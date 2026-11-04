/**
 * 인메모리 데모 스토어 — API 서버 + AI 워커 역할을 대신한다.
 * 실제 백엔드(Spring Boot / FastAPI + PostgreSQL·pgvector)가 붙으면 Route Handler만 프록시로 바꾸면 된다.
 */
import type {
  Alert,
  Answer,
  Attachment,
  AuditLog,
  Category,
  CodeCandidate,
  Commit,
  DocType,
  Environment,
  GithubIssue,
  Group,
  Inquiry,
  KDocument,
  Message,
  PushEvent,
  ReviewItem,
  Settings,
  Urgency,
} from "@moa/shared/types";
import {
  INFO_REQUEST_TEXT,
  TOPIC_TITLE,
  classify,
  customerText,
  detectCodeExposure,
  detectErrorCode,
  detectTopic,
  editRatio,
  generateDraft,
  isVague,
  parsePrices,
  receiptText,
  type DraftContext,
  type Topic,
} from "./ai";
import { ago, seedAnswers, seedCommits, seedDocuments, seedSettings } from "./seed";

interface StoredFile {
  buf: Buffer;
  mime: string;
  name: string;
}

interface DB {
  inquiries: Inquiry[];
  documents: KDocument[];
  answers: Answer[];
  groups: Group[];
  issues: GithubIssue[];
  pushEvents: PushEvent[];
  reviews: ReviewItem[];
  alerts: Alert[];
  commits: Commit[];
  audit: AuditLog[];
  settings: Settings;
  codeValues: { proMonthly: number; proAnnual: number; sha: string };
  codeIndexed: boolean;
  files: Map<string, StoredFile>;
  seq: { inquiry: number; answer: number; issue: number; misc: number };
}

const g = globalThis as unknown as { __moaDB?: DB };

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
    public data?: unknown,
  ) {
    super(message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uid(db: DB, prefix: string) {
  db.seq.misc += 1;
  return `${prefix}-${db.seq.misc}`;
}

function msg(db: DB, role: Message["role"], kind: Message["kind"], text: string, at = nowIso(), attachments?: Attachment[]): Message {
  return { id: uid(db, "m"), role, kind, text, createdAt: at, attachments };
}

export function db(): DB {
  if (!g.__moaDB) g.__moaDB = createDB();
  return g.__moaDB;
}

export function resetDB() {
  g.__moaDB = createDB();
}

function draftCtx(d: DB): DraftContext {
  return { documents: d.documents, answers: d.answers, settings: d.settings, codeValues: d.codeValues };
}

function audit(d: DB, actor: string, action: string, target: string) {
  d.audit.unshift({ id: uid(d, "log"), actor, action, target, at: nowIso() });
  d.audit = d.audit.slice(0, 200);
}

function pushAlert(d: DB, a: Omit<Alert, "id" | "read" | "createdAt">) {
  d.alerts.unshift({ ...a, id: uid(d, "al"), read: false, createdAt: nowIso() });
}

/* -------------------------------------------------------------------------- */
/*                                   seed                                      */
/* -------------------------------------------------------------------------- */

function createDB(): DB {
  const d: DB = {
    inquiries: [],
    documents: seedDocuments(),
    answers: seedAnswers(),
    groups: [],
    issues: [],
    pushEvents: [],
    reviews: [],
    alerts: [],
    commits: seedCommits(),
    audit: [],
    settings: seedSettings(),
    codeValues: { proMonthly: 9900, proAnnual: 7900, sha: "c07e1b2" },
    codeIndexed: true,
    files: new Map(),
    seq: { inquiry: 100, answer: 50, issue: 127, misc: 0 },
  };

  // 환불 정책 v3 갱신으로 A012 재검토 대기 (문서 재업로드 → 버전 비교)
  d.reviews.push({
    id: uid(d, "rv"),
    targetType: "answer",
    targetId: "A012",
    title: "A012 · 환불 받을 수 있나요?",
    reason: "근거 문서 '환불 정책'이 v2 → v3로 갱신됨. 답변에 '14일'이 남아 있음",
    source: "doc_version",
    status: "pending",
    createdAt: ago(60 * 24 * 3),
  });

  type SeedQ = {
    id: string;
    name: string;
    hint: Category | null;
    text: string;
    min: number;
    env?: Environment;
    flow?: "answer" | { rate: number | null };
  };
  const seeds: SeedQ[] = [
    { id: "Q003", name: "김하늘", hint: "billing", text: "Pro 요금제 한 달에 얼마예요? 연간으로 하면 할인되나요?", min: 52 },
    { id: "Q007", name: "이도윤", hint: "other", text: "어제 결제했는데 환불 가능한가요? 생각보다 안 쓰게 돼서요", min: 48 },
    { id: "Q011", name: "박서준", hint: "usage", text: "노트를 PDF로 내보내는 방법 알려주세요", min: 95, flow: "answer" },
    { id: "Q014", name: "최유나", hint: "account", text: "비밀번호 변경은 어디서 하나요?", min: 41 },
    { id: "Q018", name: "정민재", hint: "other", text: "안 돼요", min: 39 },
    { id: "Q022", name: "한지우", hint: "feature", text: "다크모드 추가해주세요. 밤에 쓰기 눈부셔요", min: 120 },
    { id: "Q025", name: "오세린", hint: "account", text: "회사에서 SSO(SAML) 로그인 지원하나요? 도입 검토 중입니다", min: 36 },
    { id: "Q027", name: "윤태호", hint: "other", text: "앱이 안 돼요", min: 33 },
    { id: "Q029", name: "강예린", hint: "billing", text: "세금계산서 발행 가능한가요? 법인 카드로 결제했어요", min: 31 },
    { id: "Q031", name: "임도현", hint: "bug", text: "저장 누르면 E-502 오류가 떠요", min: 30, env: { os: "macOS 15", browser: "Chrome 141" } },
    { id: "Q032", name: "서아린", hint: "other", text: "노트 저장 실패라고 나오고 E-502 뜹니다", min: 26, env: { os: "Windows 11", browser: "Edge 141" } },
    { id: "Q039", name: "배준호", hint: "bug", text: "파일 첨부하면 E-413 뜹니다", min: 24, env: { os: "iOS 19", appVersion: "4.2.0" } },
    { id: "Q044", name: "문채원", hint: "account", text: "갑자기 E-401 뜨면서 로그아웃 됐어요", min: 22, env: { os: "Android 16", appVersion: "4.2.0" } },
    { id: "Q046", name: "신우진", hint: "usage", text: "공유 링크 권한을 편집 가능으로 바꾸고 싶어요", min: 300, flow: { rate: 5 } },
    { id: "Q047", name: "조하은", hint: "usage", text: "노트 여러 개를 마크다운으로 내보낼 수 있나요?", min: 280, flow: { rate: 4 } },
    { id: "Q048", name: "권민서", hint: "billing", text: "환불 기간 지났다는데 너무하네요. 환불 안 되나요?", min: 260, flow: { rate: 2 } },
    { id: "Q049", name: "황지민", hint: "account", text: "비밀번호 바꾸는 메뉴가 어디 있죠?", min: 240, flow: { rate: null } },
    { id: "Q050", name: "노은서", hint: "other", text: "API로 노트 목록 가져올 수 있나요? 사내 위키랑 연동하려고요", min: 18 },
  ];

  for (const s of seeds) {
    const inq = createInquiryIn(d, {
      id: s.id,
      customerName: s.name,
      customerCategory: s.hint,
      text: s.text,
      environment: s.env ?? { os: "macOS 15", browser: "Chrome 141" },
      attachments: [],
      at: ago(s.min),
    });
    if (s.flow) {
      const draft = inq.draft?.text ?? "";
      sendAnswerIn(d, inq.id, draft, ago(s.min - 8));
      if (s.flow !== "answer") {
        closeInquiryIn(d, inq.id, ago(s.min - 15));
        if (s.flow.rate !== null) rateInquiryIn(d, inq.id, s.flow.rate, s.flow.rate <= 2 ? "정책이 아쉬워요" : undefined, ago(s.min - 16));
      }
    }
  }
  d.alerts = [];
  return d;
}

/* -------------------------------------------------------------------------- */
/*                                 문의 처리                                    */
/* -------------------------------------------------------------------------- */

interface CreateInput {
  id?: string;
  customerName?: string;
  customerCategory: Category | null;
  text: string;
  environment: Environment;
  attachments: Attachment[];
  at?: string;
}

function createInquiryIn(d: DB, input: CreateInput): Inquiry {
  const at = input.at ?? nowIso();
  const id = input.id ?? `Q${String(++d.seq.inquiry).padStart(3, "0")}`;
  const env: Environment = { ...input.environment };
  // C-09: 스크린샷에서 추출한 오류 코드 → error_code 자동 입력
  const extracted = input.attachments.find((a) => a.extractedErrorCode)?.extractedErrorCode;
  env.errorCode = env.errorCode || detectErrorCode(input.text) || extracted;

  const c = classify(input.text, env);
  const inq: Inquiry = {
    id,
    customerName: input.customerName || "고객",
    customerCategory: input.customerCategory,
    aiCategory: c.category,
    category: c.category,
    urgency: c.urgency,
    status: "received",
    summary: c.summary,
    environment: env,
    messages: [msg(d, "customer", "text", input.text, at, input.attachments)],
    classificationHistory: [],
    createdAt: at,
    updatedAt: at,
  };
  // C-08: 즉시 자동 접수 안내 (자동 발송 허용)
  inq.messages.push(msg(d, "ai", "receipt", receiptText(d.settings.avgResponseMinutes), at));
  // A-08: 정보 부족 → 사실 없는 정보 수집 질문 자동 발송
  if (isVague(input.text, env, input.attachments.length > 0)) {
    inq.messages.push(msg(d, "ai", "info_request", INFO_REQUEST_TEXT, at));
    inq.status = "need_info";
  }
  d.inquiries.unshift(inq);
  assignGroup(d, inq, c.topic);
  inq.draft = generateDraft(inq, draftCtx(d), { spikeActive: groupOf(d, inq)?.spike });
  logCodeUse(d, inq);
  return inq;
}

function logCodeUse(d: DB, inq: Inquiry) {
  const code = inq.draft?.sources.filter((s) => s.type === "code") ?? [];
  for (const s of code) audit(d, "AI 워커", `초안 근거로 코드 청크 사용 (${inq.id})`, s.filePath ?? s.title);
}

function groupOf(d: DB, inq: Inquiry) {
  return inq.groupId ? d.groups.find((x) => x.id === inq.groupId) : undefined;
}

/** G-01: 오류 코드 일치 + (코드 없을 때) 의미 유사도로 그룹화 */
function assignGroup(d: DB, inq: Inquiry, topic: Topic) {
  if (topic === "vague" || topic === "unknown") return;
  const code = inq.environment.errorCode;
  let key: string;
  if (code) key = `G-${code}`;
  else if (topic === "sync") key = "G-E-502"; // "서버 터짐?"처럼 의미로만 쓴 문의
  else if (topic === "upload") key = "G-E-413";
  else if (topic === "session") key = "G-E-401";
  else key = `G-${topic}`;

  let group = d.groups.find((x) => x.id === key);
  if (!group) {
    group = {
      id: key,
      title: TOPIC_TITLE[topic],
      errorCode: key.startsWith("G-E-") ? key.slice(2) : undefined,
      category: inq.category,
      inquiryIds: [],
      firstAt: inq.createdAt,
      lastAt: inq.createdAt,
      spike: false,
    };
    d.groups.push(group);
  }
  group.inquiryIds.push(inq.id);
  group.lastAt = inq.createdAt > group.lastAt ? inq.createdAt : group.lastAt;
  group.firstAt = inq.createdAt < group.firstAt ? inq.createdAt : group.firstAt;
  inq.groupId = group.id;
  checkSpike(d, group);
}

/** G-02: 설정 시간 내 기준 건수 초과 시 장애 의심 알림 */
function checkSpike(d: DB, group: Group) {
  if (group.spike || group.category !== "bug") return;
  const windowStart = Date.now() - d.settings.spikeWindowMinutes * 60_000;
  const recent = group.inquiryIds
    .map((id) => d.inquiries.find((i) => i.id === id))
    .filter((i): i is Inquiry => !!i && new Date(i.createdAt).getTime() >= windowStart);
  if (recent.length < d.settings.spikeCount) return;

  group.spike = true;
  for (const i of recent) {
    if (i.urgency !== "critical") {
      i.classificationHistory.push({ at: nowIso(), field: "urgency", from: i.urgency, to: "critical", by: "급증 감지" });
      i.urgency = "critical";
    }
  }
  pushAlert(d, {
    type: "spike",
    title: `장애 의심: ${group.title}`,
    body: `${d.settings.spikeWindowMinutes}분 내 ${recent.length}건 (기준 ${d.settings.spikeCount}건). ${recent.length}번째 문의에서 감지했어요.`,
    href: `/groups?focus=${group.id}`,
  });
  if (d.settings.autoCreateIssue && d.settings.securityLevel >= 1) createIssueIn(d, group.id, true);
}

export function listInquiries() {
  return db().inquiries;
}

export function getInquiry(id: string) {
  const inq = db().inquiries.find((i) => i.id === id);
  if (!inq) throw new StoreError("문의를 찾을 수 없습니다", 404);
  return inq;
}

export function customerView(inq: Inquiry) {
  return {
    id: inq.id,
    status: inq.status,
    messages: inq.messages,
    rating: inq.rating,
    environment: inq.environment,
    createdAt: inq.createdAt,
  };
}

export function createInquiry(input: CreateInput) {
  return createInquiryIn(db(), input);
}

/** C-05: 같은 채팅에서 추가 정보 응답. 상담 종료 후 메시지는 새 문의로 생성 */
export function addCustomerMessage(id: string, text: string, attachments: Attachment[], environment?: Environment) {
  const d = db();
  const inq = getInquiry(id);
  if (inq.status === "closed") {
    const created = createInquiryIn(d, {
      customerName: inq.customerName,
      customerCategory: null,
      text,
      environment: { ...inq.environment, errorCode: environment?.errorCode, ...environment },
      attachments,
    });
    return { inquiry: created, newInquiry: true };
  }
  const at = nowIso();
  inq.messages.push(msg(d, "customer", "text", text, at, attachments));
  inq.updatedAt = at;
  const extracted = attachments.find((a) => a.extractedErrorCode)?.extractedErrorCode;
  inq.environment.errorCode = inq.environment.errorCode || environment?.errorCode || detectErrorCode(text) || extracted;

  // 세션 요약 기준으로 재분류
  const all = customerText(inq);
  const c = classify(all, inq.environment);
  const manualCat = inq.classificationHistory.some((h) => h.field === "category" && h.by !== "AI");
  if (!manualCat) inq.aiCategory = inq.category = c.category;
  inq.aiCategory = c.category;
  if (!inq.classificationHistory.some((h) => h.field === "urgency")) inq.urgency = c.urgency;
  inq.summary = c.summary;
  if (inq.status === "need_info" || inq.status === "answered") inq.status = "in_review";
  if (!inq.groupId) assignGroup(d, inq, c.topic);
  inq.draft = generateDraft(inq, draftCtx(d), { spikeActive: groupOf(d, inq)?.spike });
  return { inquiry: inq, newInquiry: false };
}

export function openInquiry(id: string) {
  const inq = getInquiry(id);
  if (inq.status === "received") {
    inq.status = "in_review";
    inq.updatedAt = nowIso();
  }
  return inq;
}

/** A-03: 분류 수동 변경 + 변경 이력 */
export function updateClassification(id: string, patch: { category?: Category; urgency?: Urgency }, by = "담당자") {
  const inq = getInquiry(id);
  const at = nowIso();
  if (patch.category && patch.category !== inq.category) {
    inq.classificationHistory.push({ at, field: "category", from: inq.category, to: patch.category, by });
    inq.category = patch.category;
  }
  if (patch.urgency && patch.urgency !== inq.urgency) {
    inq.classificationHistory.push({ at, field: "urgency", from: inq.urgency, to: patch.urgency, by });
    inq.urgency = patch.urgency;
  }
  inq.updatedAt = at;
  return inq;
}

export function regenerateDraft(id: string) {
  const d = db();
  const inq = getInquiry(id);
  inq.draft = generateDraft(inq, draftCtx(d), { spikeActive: groupOf(d, inq)?.spike });
  logCodeUse(d, inq);
  return inq;
}

export function saveDraft(id: string, text: string) {
  const inq = getInquiry(id);
  if (!inq.draft) throw new StoreError("초안이 없습니다");
  inq.draft.text = text;
  return inq;
}

/** A-06 + S-04: 승인·발송. 코드·파일 경로가 섞이면 발송 차단 */
function sendAnswerIn(d: DB, id: string, text: string, at = nowIso()) {
  const inq = d.inquiries.find((i) => i.id === id);
  if (!inq) throw new StoreError("문의를 찾을 수 없습니다", 404);
  if (inq.status === "closed") throw new StoreError("이미 종료된 상담입니다");
  const body = text.trim();
  if (!body) throw new StoreError("답변 내용이 비어 있습니다");
  if (/\[가격 확인 필요\]/.test(body)) throw new StoreError("확인 필요 표시가 남아 있습니다. 값을 확인해 채워주세요.", 422);
  const exposure = detectCodeExposure(body);
  if (exposure.length) {
    throw new StoreError("고객 답변에 코드·파일 경로가 포함되어 발송을 차단했습니다 (S-04)", 422, { exposure });
  }

  const draft = inq.draft;
  const evidence = (draft?.sources ?? [])
    .filter((s) => s.role !== "format")
    .map((s) =>
      s.type === "document"
        ? { docId: s.docId, docVersion: s.docVersion }
        : s.type === "code" || s.type === "commit"
          ? { filePath: s.filePath, commitSha: s.commitSha ?? d.codeValues.sha }
          : {},
    )
    .filter((e) => Object.keys(e).length > 0);

  const answer: Answer = {
    id: `A${String(++d.seq.answer).padStart(3, "0")}`,
    inquiryId: inq.id,
    question: customerText(inq).slice(0, 80),
    text: body,
    evidence,
    rating: null,
    editRatio: editRatio(draft?.originalText ?? "", body),
    tier: "normal",
    isStale: false,
    lowStreak: 0,
    createdAt: at,
  };
  d.answers.push(answer);
  inq.sentAnswerId = answer.id;
  inq.messages.push(msg(d, "agent", "text", body, at));
  inq.status = "answered";
  inq.updatedAt = at;
  return inq;
}

export function sendAnswer(id: string, text: string) {
  return sendAnswerIn(db(), id, text);
}

/** A-07: 상담 종료 → 고객에게 별점 조사 자동 발송 */
function closeInquiryIn(d: DB, id: string, at = nowIso()) {
  const inq = d.inquiries.find((i) => i.id === id);
  if (!inq) throw new StoreError("문의를 찾을 수 없습니다", 404);
  if (inq.status === "closed") return inq;
  inq.status = "closed";
  inq.messages.push(msg(d, "system", "rating_request", "상담이 종료되었어요. 답변은 만족스러우셨나요?", at));
  inq.rating = { score: null, requestedAt: at };
  inq.updatedAt = at;
  return inq;
}

export function closeInquiry(id: string) {
  return closeInquiryIn(db(), id);
}

/** C-04 + 7장 우수 답변 선정 기준 */
function rateInquiryIn(d: DB, id: string, score: number, comment: string | undefined, at = nowIso()) {
  const inq = d.inquiries.find((i) => i.id === id);
  if (!inq) throw new StoreError("문의를 찾을 수 없습니다", 404);
  if (inq.status !== "closed") throw new StoreError("상담 종료 후 평가할 수 있습니다");
  if (score < 1 || score > 5) throw new StoreError("별점은 1~5입니다");
  inq.rating = { ...(inq.rating ?? { requestedAt: at }), score, comment, ratedAt: at };

  const answer = d.answers.find((a) => a.id === inq.sentAnswerId);
  if (!answer) return inq;
  answer.rating = score;
  const s = d.settings;
  if (score >= s.bestAnswerAutoScore) answer.tier = "candidate";
  else if (score >= s.bestAnswerConditionalScore) answer.tier = answer.editRatio < s.editRatioLimit ? "candidate" : "normal";
  else if (score >= 3) answer.tier = "normal";
  else answer.tier = "quality_check";

  // 같은 근거(형식 참고)로 쓴 우수 답변 연속 저평가 추적
  const usedBest = (inq.draft?.sources ?? [])
    .filter((x) => x.type === "best_answer")
    .map((x) => d.answers.find((a) => `src-${a.id}` === x.id))
    .filter((a): a is Answer => !!a && a.tier === "best");
  for (const b of usedBest) {
    if (score <= 2) {
      b.lowStreak += 1;
      const already = d.reviews.some((r) => r.targetId === b.id && r.status === "pending");
      if (!already) {
        d.reviews.unshift({
          id: uid(d, "rv"),
          targetType: "answer",
          targetId: b.id,
          title: `${b.id} · ${b.question}`,
          reason:
            b.lowStreak >= 2
              ? `이 우수 답변을 참고한 초안이 연속 ${b.lowStreak}회 ★2 이하를 받았어요`
              : `같은 근거를 쓴 답변(${answer.id})이 ★${score}를 받아 함께 점검이 필요해요`,
          source: "rating",
          status: "pending",
          createdAt: at,
        });
      }
    } else b.lowStreak = 0;
  }
  return inq;
}

export function rateInquiry(id: string, score: number, comment?: string) {
  return rateInquiryIn(db(), id, score, comment);
}

/* -------------------------------------------------------------------------- */
/*                               그룹 · 이슈                                    */
/* -------------------------------------------------------------------------- */

export function listGroups() {
  const d = db();
  return d.groups
    .map((gr) => ({
      ...gr,
      inquiries: gr.inquiryIds
        .map((id) => d.inquiries.find((i) => i.id === id))
        .filter((i): i is Inquiry => !!i)
        .map((i) => ({
          id: i.id,
          text: i.messages[0]?.text ?? "",
          createdAt: i.createdAt,
          status: i.status,
          errorCode: i.environment.errorCode,
          os: i.environment.os,
        })),
      issue: d.issues.find((x) => x.id === gr.issueId),
    }))
    .sort((a, b) => Number(b.spike) - Number(a.spike) || b.inquiryIds.length - a.inquiryIds.length);
}

const CANDIDATES: Record<string, CodeCandidate[]> = {
  "E-502": [
    { filePath: "sync/saveHandler.ts", score: 0.86, reason: "E-502 반환 경로 + 2시간 전 배치 처리 변경(a1f3c92)" },
    { filePath: "sync/queue.ts", score: 0.71, reason: "flushBatch 변경 — 배치 실패 시 전체 롤백" },
    { filePath: "api/client.ts", score: 0.52, reason: "502 재시도 정책" },
  ],
  "E-413": [
    { filePath: "upload/attachment.ts", score: 0.88, reason: "MAX_ATTACHMENT_BYTES 초과 시 E-413" },
    { filePath: "api/client.ts", score: 0.4, reason: "업로드 요청 크기 제한" },
  ],
  "E-401": [
    { filePath: "auth/session.ts", score: 0.84, reason: "토큰 만료 시 E-401 + refresh 처리 변경(9e0aa47)" },
    { filePath: "api/client.ts", score: 0.47, reason: "401 응답 처리" },
  ],
};

function createIssueIn(d: DB, groupId: string, auto: boolean) {
  const group = d.groups.find((x) => x.id === groupId);
  if (!group) throw new StoreError("그룹을 찾을 수 없습니다", 404);
  if (group.issueId) return d.issues.find((x) => x.id === group.issueId)!;
  if (d.settings.securityLevel === 0) throw new StoreError("보안 레벨 0(연동 안 함)에서는 이슈를 만들 수 없습니다", 403);

  const level = d.settings.securityLevel;
  const candidates = (CANDIDATES[group.errorCode ?? ""] ?? [{ filePath: "api/client.ts", score: 0.4, reason: "공통 요청 처리" }]).map(
    (c) => (level === 1 ? { ...c, reason: "변경 파일 경로 기반 (레벨 1)" } : c),
  );
  const commits = d.commits.filter((c) => c.files.some((f) => candidates.some((x) => x.filePath === f)));
  const inqs = group.inquiryIds.map((id) => d.inquiries.find((i) => i.id === id)).filter((i): i is Inquiry => !!i);
  const envs = [...new Set(inqs.map((i) => i.environment.os).filter(Boolean))].join(", ");
  const number = ++d.seq.issue;
  const body = [
    `## 문의 요약`,
    `- ${group.title}: ${inqs.length}건 (${new Date(group.firstAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~ ${new Date(group.lastAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`,
    `- 오류 코드: ${group.errorCode ?? "없음"} · 환경: ${envs || "-"}`,
    `- 대표 문의: "${inqs[0]?.messages[0]?.text ?? ""}"`,
    ``,
    `## 의심 코드 위치 후보 (확정 아님)`,
    ...candidates.map((c, i) => `${i + 1}. \`${c.filePath}\` (${Math.round(c.score * 100)}%) — ${c.reason}`),
    ``,
    `## 최근 관련 커밋`,
    ...(commits.length ? commits.map((c) => `- ${c.sha} ${c.message} (@${c.author})`) : ["- 없음"]),
    ``,
    `> 모아(MOA)가 고객 문의 그룹에서 자동 생성한 이슈입니다. 원인은 런타임(데이터·외부 API·환경)에 있을 수 있습니다.`,
  ].join("\n");

  const issue: GithubIssue = {
    id: uid(d, "is"),
    number,
    title: `[CS ${inqs.length}건] ${group.title}`,
    url: `https://github.com/${d.settings.repo}/issues/${number}`,
    groupId,
    body,
    candidates,
    commits,
    createdAt: nowIso(),
    auto,
  };
  d.issues.unshift(issue);
  group.issueId = issue.id;
  pushAlert(d, {
    type: "issue",
    title: `GitHub 이슈 #${number} ${auto ? "자동 " : ""}생성`,
    body: issue.title,
    href: `/groups?focus=${groupId}`,
  });
  audit(d, auto ? "AI 워커" : "담당자", `GitHub 이슈 #${number} 생성`, groupId);
  // 그룹 내 열린 문의 초안 갱신 (개발팀 확인 중 안내)
  for (const i of inqs) if (i.status !== "closed" && i.status !== "answered") i.draft = generateDraft(i, draftCtx(d), { spikeActive: group.spike });
  return issue;
}

export function createIssue(groupId: string) {
  return createIssueIn(db(), groupId, false);
}

/* -------------------------------------------------------------------------- */
/*                      push 감지 · diff 요약 · 영향 분석                        */
/* -------------------------------------------------------------------------- */

function globToRegex(p: string) {
  const esc = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return p.endsWith("/") ? new RegExp(`^${esc}`) : new RegExp(`(^|/)${esc}$`);
}

export function matchExclude(path: string, patterns: string[]) {
  return patterns.find((p) => globToRegex(p).test(path));
}

/** 데모 장면 2: 요금 변경 커밋 push (9,900 → 12,900) */
export function simulatePricePush() {
  const d = db();
  const s = d.settings;
  if (s.securityLevel === 0) throw new StoreError("보안 레벨 0에서는 GitHub push를 감지하지 않습니다. 문서 재업로드로 변경을 반영하세요.", 403);
  if (d.codeValues.proMonthly === 12900) throw new StoreError("이미 요금 변경 커밋이 반영되었습니다. 데모를 초기화하세요.", 409);

  const commit: Commit = {
    sha: "f42b7c1",
    message: "billing: Pro 가격 인상 (9,900 → 12,900)",
    author: "seoyeon",
    files: ["billing/pricing.ts", "billing/plans.ts", ".env.example", "config/prod.pricing.ts"],
    at: nowIso(),
  };
  const detail: Record<string, string> = {
    "billing/pricing.ts": "PRO_MONTHLY 9,900 → 12,900, PRO_ANNUAL_MONTHLY 7,900 → 10,900",
    "billing/plans.ts": "플랜 설명 문구의 가격 표기 갱신",
    ".env.example": "결제 대행사 키 예시 추가",
    "config/prod.pricing.ts": "운영 가격 설정",
  };
  const changes = commit.files.map((f) => {
    const ex = matchExclude(f, s.excludePatterns);
    const watched = s.watchPaths.some((w) => f.startsWith(w));
    if (ex) return { filePath: f, summary: "인덱싱 제외", excluded: true, excludeReason: `제외 패턴 ${ex}` };
    if (!watched) return { filePath: f, summary: "감시 경로 아님", excluded: true, excludeReason: "감시 경로 밖" };
    return { filePath: f, summary: s.securityLevel === 1 ? `파일 변경 (메시지: ${commit.message})` : detail[f] };
  });

  d.codeValues = { proMonthly: 12900, proAnnual: 10900, sha: commit.sha };
  d.commits.unshift(commit);

  // 영향 분석: 근거 목록 1차 매칭 (바뀐 파일·문서 연결) + 값 매칭 2차
  const affectedAnswers = d.answers.filter(
    (a) =>
      !a.isStale &&
      (a.evidence.some((e) => e.filePath === "billing/pricing.ts" || e.docId === "D001") || /9,900원|7,900원/.test(a.text)),
  );
  for (const a of affectedAnswers) {
    a.isStale = true;
    a.staleReason = `push ${commit.sha}: Pro 가격 9,900 → 12,900 변경과 연결된 답변`;
    d.reviews.unshift({
      id: uid(d, "rv"),
      targetType: "answer",
      targetId: a.id,
      title: `${a.id} · ${a.question}`,
      reason: a.staleReason,
      source: "push",
      status: "pending",
      createdAt: nowIso(),
    });
  }
  const d1 = d.documents.find((x) => x.id === "D001")!;
  d1.status = "review";
  const ev: PushEvent = {
    id: uid(d, "push"),
    branch: s.branch,
    commit,
    summary:
      s.securityLevel === 1
        ? `billing/pricing.ts 외 1개 파일 변경 · 커밋 메시지: "${commit.message}" (레벨 1: 코드 본문 미열람)`
        : "요금 상수 변경: Pro 월 9,900 → 12,900원, 연간 월 7,900 → 10,900원",
    changes,
    affectedAnswerIds: affectedAnswers.map((a) => a.id),
    affectedDocIds: ["D001"],
    createdAt: nowIso(),
  };
  d.reviews.unshift({
    id: uid(d, "rv"),
    targetType: "document",
    targetId: "D001",
    title: `D001 · 요금 안내 (v${d1.version})`,
    reason: `push ${commit.sha}: 문서의 Pro 9,900원 / 연간 7,900원이 코드와 다름`,
    source: "push",
    status: "pending",
    pushEventId: ev.id,
    createdAt: nowIso(),
  });
  for (const r of d.reviews) if (r.source === "push" && !r.pushEventId) r.pushEventId = ev.id;
  d.pushEvents.unshift(ev);
  pushAlert(d, {
    type: "push",
    title: `${s.branch} push 감지 · ${commit.sha}`,
    body: `${ev.summary} → 답변 ${affectedAnswers.length}개 낡았을 수 있음`,
    href: "/changes",
  });
  audit(d, "GitHub Webhook", `push 수신 ${commit.sha}`, s.repo);
  refreshOpenDrafts(d);
  return ev;
}

function refreshOpenDrafts(d: DB) {
  for (const i of d.inquiries) {
    if (i.status === "closed" || i.status === "answered" || !i.draft) continue;
    const t = detectTopic(customerText(i), i.environment.errorCode);
    if (t === "pricing" || t === "refund") i.draft = generateDraft(i, draftCtx(d), { spikeActive: groupOf(d, i)?.spike });
  }
}

/* -------------------------------------------------------------------------- */
/*                                  재검토 큐                                   */
/* -------------------------------------------------------------------------- */

/** AI 수정안: 사실 값만 최신 근거로 치환 */
export function suggestFix(text: string) {
  const d = db();
  let out = text;
  if (d.codeValues.proMonthly === 12900) out = out.replaceAll("9,900원", "12,900원").replaceAll("7,900원", "10,900원");
  out = out.replace(/14일 이내/g, "7일 이내");
  return out;
}

export function listReviews() {
  const d = db();
  return d.reviews.map((r) => {
    if (r.targetType === "answer") {
      const a = d.answers.find((x) => x.id === r.targetId);
      return { ...r, current: a?.text ?? "", suggestion: a ? suggestFix(a.text) : "", tier: a?.tier, rating: a?.rating };
    }
    const doc = d.documents.find((x) => x.id === r.targetId);
    return { ...r, current: doc?.content ?? "", suggestion: doc ? suggestFix(doc.content) : "" };
  });
}

export function resolveReview(id: string, action: "approve" | "dismiss", text?: string) {
  const d = db();
  const r = d.reviews.find((x) => x.id === id);
  if (!r) throw new StoreError("재검토 항목을 찾을 수 없습니다", 404);
  if (r.status !== "pending") return r;
  if (action === "dismiss") {
    // 검색 제외 유지 (보관)
    r.status = "dismissed";
    r.resolvedAt = nowIso();
    return r;
  }
  if (r.targetType === "answer") {
    const a = d.answers.find((x) => x.id === r.targetId);
    if (a) {
      a.text = text ?? suggestFix(a.text);
      a.isStale = false;
      a.staleReason = undefined;
      a.lowStreak = 0;
      a.evidence = a.evidence.map((e) =>
        e.docId === "D001" ? { ...e, docVersion: d.documents.find((x) => x.id === "D001")!.version } :
        e.docId === "D002" ? { ...e, docVersion: d.documents.find((x) => x.id === "D002")!.version } :
        e.filePath === "billing/pricing.ts" ? { ...e, commitSha: d.codeValues.sha } : e,
      );
    }
  } else {
    updateDocumentIn(d, r.targetId, text ?? suggestFix(d.documents.find((x) => x.id === r.targetId)?.content ?? ""));
  }
  r.status = "resolved";
  r.resolvedAt = nowIso();
  refreshOpenDrafts(d);
  return r;
}

/* -------------------------------------------------------------------------- */
/*                                   문서                                       */
/* -------------------------------------------------------------------------- */

function updateDocumentIn(d: DB, id: string, content: string) {
  const doc = d.documents.find((x) => x.id === id);
  if (!doc) throw new StoreError("문서를 찾을 수 없습니다", 404);
  doc.version += 1;
  doc.content = content;
  doc.status = "valid";
  doc.updatedAt = nowIso();
  doc.history.push({ version: doc.version, content, uploadedAt: doc.updatedAt });
  markDocDependents(d, doc);
  return doc;
}

/** 문서가 새 버전으로 올라오면 그 문서를 근거로 쓴 답변을 재검토 필요로 */
function markDocDependents(d: DB, doc: KDocument) {
  const prices = doc.id === "D001" ? parsePrices(doc.content) : null;
  for (const a of d.answers) {
    if (a.isStale) continue;
    const ev = a.evidence.find((e) => e.docId === doc.id && (e.docVersion ?? 0) < doc.version);
    if (!ev) continue;
    // 값이 그대로면 버전만 갱신
    if (prices && a.text.includes(`${prices.pro.toLocaleString("ko-KR")}원`)) {
      ev.docVersion = doc.version;
      continue;
    }
    if (doc.id !== "D001" || !prices) {
      ev.docVersion = doc.version;
      continue;
    }
    a.isStale = true;
    a.staleReason = `근거 문서 '${doc.title}'이 v${ev.docVersion} → v${doc.version}로 갱신됨`;
    d.reviews.unshift({
      id: uid(d, "rv"),
      targetType: "answer",
      targetId: a.id,
      title: `${a.id} · ${a.question}`,
      reason: a.staleReason,
      source: "doc_version",
      status: "pending",
      createdAt: nowIso(),
    });
  }
}

export function listDocuments() {
  return db().documents;
}

export function uploadDocument(input: { title: string; type: DocType; content: string }) {
  const d = db();
  const existing = d.documents.find((x) => x.title === input.title.trim());
  if (existing) return updateDocumentIn(d, existing.id, input.content);
  const id = `D${String(d.documents.length + 1).padStart(3, "0")}`;
  const doc: KDocument = {
    id,
    title: input.title.trim(),
    type: input.type,
    version: 1,
    status: "valid",
    content: input.content,
    updatedAt: nowIso(),
    history: [{ version: 1, content: input.content, uploadedAt: nowIso() }],
  };
  d.documents.push(doc);
  return doc;
}

export function setDocumentStatus(id: string, status: KDocument["status"]) {
  const doc = db().documents.find((x) => x.id === id);
  if (!doc) throw new StoreError("문서를 찾을 수 없습니다", 404);
  doc.status = status;
  doc.updatedAt = nowIso();
  refreshOpenDrafts(db());
  return doc;
}

export function updateDocument(id: string, content: string) {
  const d = db();
  const doc = updateDocumentIn(d, id, content);
  // 해당 문서의 재검토 항목 자동 해결
  for (const r of d.reviews) if (r.targetId === id && r.status === "pending") {
    r.status = "resolved";
    r.resolvedAt = nowIso();
  }
  refreshOpenDrafts(d);
  return doc;
}

/* -------------------------------------------------------------------------- */
/*                                 우수 답변                                    */
/* -------------------------------------------------------------------------- */

export function listAnswers() {
  const d = db();
  return d.answers.map((a) => ({
    ...a,
    inquiry: a.inquiryId ? d.inquiries.find((i) => i.id === a.inquiryId)?.rating : undefined,
  }));
}

/** K-02: 후보 승인 → 근거 목록과 함께 Vector DB 등록 */
export function decideCandidate(id: string, action: "approve" | "reject") {
  const d = db();
  const a = d.answers.find((x) => x.id === id);
  if (!a) throw new StoreError("답변을 찾을 수 없습니다", 404);
  if (action === "approve") {
    if (a.tier !== "candidate") throw new StoreError("후보 상태인 답변만 승인할 수 있습니다");
    if (a.evidence.length === 0) throw new StoreError("근거 목록이 없는 답변은 등록할 수 없습니다");
    a.tier = "best";
    a.approvedAt = nowIso();
    audit(d, "담당자", "우수 답변 승인 · Vector DB 등록", a.id);
  } else {
    a.tier = "normal";
  }
  return a;
}

/* -------------------------------------------------------------------------- */
/*                               설정 · 알림 · 첨부                              */
/* -------------------------------------------------------------------------- */

export function getSettings() {
  return db().settings;
}

export function updateSettings(patch: Partial<Settings>) {
  const d = db();
  const prevLevel = d.settings.securityLevel;
  d.settings = { ...d.settings, ...patch, service: { ...d.settings.service, ...(patch.service ?? {}) } };
  if (patch.securityLevel !== undefined && patch.securityLevel !== prevLevel) {
    audit(d, "관리자", `보안 레벨 ${prevLevel} → ${patch.securityLevel}`, d.settings.repo);
    if (patch.securityLevel === 0 || patch.securityLevel === 1) {
      // S-08: 연동 해제(또는 코드 본문 미열람) 시 코드 인덱스 즉시 삭제
      if (d.codeIndexed) audit(d, "시스템", "코드 인덱스·청크 즉시 삭제 (S-08)", d.settings.repo);
      d.codeIndexed = false;
    } else if (patch.securityLevel === 2) {
      d.codeIndexed = true;
      audit(d, "시스템", "감시 경로 재인덱싱 (제외 패턴 적용)", d.settings.watchPaths.join(", "));
    }
  }
  if (patch.ragMode) refreshAllOpenDrafts(d);
  return d.settings;
}

function refreshAllOpenDrafts(d: DB) {
  for (const i of d.inquiries) {
    if (i.status === "closed" || i.status === "answered") continue;
    i.draft = generateDraft(i, draftCtx(d), { spikeActive: groupOf(d, i)?.spike });
  }
}

export function getSystemState() {
  const d = db();
  return {
    codeValues: d.codeValues,
    codeIndexed: d.codeIndexed,
    pushed: d.codeValues.proMonthly === 12900,
    commits: d.commits,
    audit: d.audit.slice(0, 30),
  };
}

export function listAlerts() {
  return db().alerts;
}

export function markAlertsRead(ids?: string[]) {
  for (const a of db().alerts) if (!ids || ids.includes(a.id)) a.read = true;
}

export function saveFile(name: string, mime: string, buf: Buffer): Attachment {
  const d = db();
  const id = uid(d, "f");
  d.files.set(id, { buf, mime, name });
  // C-09: 비전 LLM 오류 코드 추출 — 데모에서는 파일명/메타 기반 mock
  const extracted = detectErrorCode(name.replace(/_/g, "-"));
  return { id, name, mime, size: buf.length, url: `/api/attachments/${id}`, extractedErrorCode: extracted };
}

export function getFile(id: string) {
  return db().files.get(id);
}

/* -------------------------------------------------------------------------- */
/*                         데모 장면 3: 버그 문의 몰아넣기                         */
/* -------------------------------------------------------------------------- */

export const SPIKE_SCRIPT: Array<{ name: string; text: string; env: Environment }> = [
  { name: "유서진", text: "저장하면 E-502 떠요", env: { os: "macOS 15", browser: "Safari 19" } },
  { name: "김도겸", text: "E-502 오류 계속 나요 저장이 안돼요", env: { os: "Windows 11", browser: "Chrome 141" } },
  { name: "박소율", text: "노트 저장할 때마다 E-502", env: { os: "iOS 19", appVersion: "4.2.0" } },
  { name: "이현우", text: "서버 터짐?", env: { os: "Android 16", appVersion: "4.2.0" } },
  { name: "정하린", text: "E-502 뜨고 방금 쓴 내용 저장 안 됨", env: { os: "macOS 15", browser: "Chrome 141" } },
  { name: "최민혁", text: "첨부파일 올리니까 E-413 나와요", env: { os: "Windows 11", browser: "Chrome 141" } },
  { name: "한소희", text: "저장 버튼 눌렀는데 계속 실패해요 빙글빙글 돌기만 함", env: { os: "iOS 19", appVersion: "4.2.0" } },
  { name: "오지환", text: "E-502 error when saving", env: { os: "macOS 15", browser: "Firefox 140" } },
  { name: "강다은", text: "저장 E-502 ㅠㅠ 급해요 회의록인데", env: { os: "Windows 11", browser: "Edge 141" } },
  { name: "윤재민", text: "E-502 계속 떠요 다른 분들도 그런가요", env: { os: "Android 16", appVersion: "4.1.9" } },
  { name: "임서윤", text: "저장시 E502 에러", env: { os: "macOS 15", browser: "Chrome 141", errorCode: "E-502" } },
  { name: "서준영", text: "E-502 오류 저장 불가", env: { os: "Windows 11", browser: "Chrome 141" } },
  { name: "신예준", text: "노트 동기화 안 되고 E-502", env: { os: "iOS 19", appVersion: "4.2.0" } },
];

export function spikeStep(step: number) {
  const item = SPIKE_SCRIPT[step];
  if (!item) throw new StoreError("시나리오 끝", 400);
  return createInquiry({ customerName: item.name, customerCategory: step % 3 === 0 ? "other" : "bug", text: item.text, environment: item.env, attachments: [] });
}
