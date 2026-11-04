/**
 * AI 워커 mock — 분류·정보 수집 판단·주제 검출·초안 생성(RAG)·코드 노출 검사.
 * 실제 서비스에서는 LLM/임베딩으로 대체되는 부분이며, 명세의 규칙(근거 원칙, 자동 발송 범위,
 * 근거 부족 판정, S-04 코드 노출 차단)을 그대로 재현한다.
 */
import type {
  Answer,
  Category,
  Draft,
  Environment,
  Inquiry,
  KDocument,
  Settings,
  Source,
  Urgency,
} from "@moa/shared/types";
import { CODE_INDEX, SERVICE_NAME } from "./seed";
export { detectCodeExposure } from "@moa/shared/guard";

export type Topic =
  | "pricing"
  | "refund"
  | "tax"
  | "sso"
  | "api"
  | "payfail"
  | "sync"
  | "upload"
  | "session"
  | "export"
  | "share"
  | "password"
  | "feature"
  | "vague"
  | "unknown";

export const TOPIC_TITLE: Record<Topic, string> = {
  pricing: "요금 문의",
  refund: "환불 문의",
  tax: "세금계산서·증빙 문의",
  sso: "SSO 로그인 문의",
  api: "API 연동 문의",
  payfail: "결제 실패 (E-PAY-07)",
  sync: "저장 시 E-502 오류",
  upload: "첨부 시 E-413 (첨부 용량)",
  session: "E-401 세션 만료",
  export: "노트 내보내기",
  share: "공유 링크 권한",
  password: "비밀번호 변경",
  feature: "기능 개선 요청",
  vague: "정보 부족",
  unknown: "기타",
};

const ERROR_CODE_RE = /\bE-(?:[A-Z]+-)?\d{2,3}\b/i;

export function detectErrorCode(text: string): string | undefined {
  const m = text.match(ERROR_CODE_RE);
  return m ? m[0].toUpperCase() : undefined;
}

export function customerText(inq: Pick<Inquiry, "messages">) {
  return inq.messages
    .filter((m) => m.role === "customer")
    .map((m) => m.text)
    .join(" ");
}

export function isVague(text: string, env: Environment, hasAttachment: boolean) {
  const t = text.replace(/\s+/g, " ").trim();
  if (env.errorCode || detectErrorCode(t) || hasAttachment) return false;
  if (t.length <= 12 && /(안\s?돼|안\s?됨|안\s?되|이상해|고장|도와|문제|왜)/.test(t)) return true;
  return t.length <= 4;
}

export function detectTopic(text: string, errorCode?: string): Topic {
  const code = errorCode ?? detectErrorCode(text);
  if (code === "E-502") return "sync";
  if (code === "E-413") return "upload";
  if (code === "E-401") return "session";
  if (code?.startsWith("E-PAY")) return "payfail";
  if (/(sso|saml|싱글\s?사인)/i.test(text)) return "sso";
  if (/(\bapi\b|웹훅|webhook)/i.test(text)) return "api";
  if (/(세금계산서|영수증|증빙)/.test(text)) return "tax";
  if (/환불/.test(text)) return "refund";
  if (/(요금|가격|얼마|구독료|요금제|업그레이드\s?비용|결제\s?금액)/.test(text)) return "pricing";
  if (/(비밀번호|패스워드)/.test(text)) return "password";
  if (/(내보내|export|pdf로|마크다운)/i.test(text)) return "export";
  if (/(공유|링크\s?권한|초대)/.test(text)) return "share";
  if (/(첨부|업로드|용량)/.test(text)) return "upload";
  if (/(로그아웃|로그인이\s?풀|세션)/.test(text)) return "session";
  if (/(저장|동기화|서버\s?(터|오류|다운|죽)|빙글)/.test(text)) return "sync";
  if (/(추가해|있었으면|기능\s?요청|개선해|다크\s?모드|지원해\s?주)/.test(text)) return "feature";
  if (text.trim().length <= 12) return "vague";
  return "unknown";
}

export function classify(
  text: string,
  env: Environment,
): { category: Category; urgency: Urgency; topic: Topic; summary: string } {
  const topic = detectTopic(text, env.errorCode);
  const code = env.errorCode ?? detectErrorCode(text);
  let category: Category = "other";
  if (["sync", "upload", "session", "payfail"].includes(topic) || code) category = "bug";
  else if (["pricing", "refund", "tax"].includes(topic)) category = "billing";
  else if (["sso", "password"].includes(topic)) category = "account";
  else if (["export", "share", "api"].includes(topic)) category = "usage";
  else if (topic === "feature") category = "feature";
  else if (/(오류|에러|안\s?돼|안\s?됨|실패|버그|튕|멈춰)/.test(text)) category = "bug";

  let urgency: Urgency = "normal";
  if (topic === "payfail" || code?.startsWith("E-5")) urgency = "high";
  else if (category === "bug") urgency = "high";
  else if (category === "feature" || category === "usage") urgency = "low";
  if (topic === "refund") urgency = "high";

  const summary = (TOPIC_TITLE[topic] !== "기타" ? `[${TOPIC_TITLE[topic]}] ` : "") + text.slice(0, 60);
  return { category, urgency, topic, summary };
}

/* -------------------------------------------------------------------------- */
/*                                 초안 생성                                   */
/* -------------------------------------------------------------------------- */

export interface DraftContext {
  documents: KDocument[];
  answers: Answer[];
  settings: Settings;
  codeValues: { proMonthly: number; proAnnual: number; sha: string };
}

const GREET = `안녕하세요, ${SERVICE_NAME}입니다.`;
const CLOSE = "추가로 궁금하신 점이 있으면 편하게 말씀해 주세요.";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function docSource(doc: KDocument, excerpt: string, similarity: number, role: Source["role"] = "fact"): Source {
  return {
    id: `src-${doc.id}`,
    type: "document",
    title: doc.title,
    excerpt,
    similarity,
    docId: doc.id,
    docVersion: doc.version,
    docStatus: doc.status,
    role,
    stale: doc.status !== "valid",
  };
}

function answerSource(a: Answer, similarity: number, role: Source["role"]): Source {
  return {
    id: `src-${a.id}`,
    type: "best_answer",
    title: `${a.id} · ${a.question}`,
    excerpt: a.text.slice(0, 120) + (a.text.length > 120 ? "…" : ""),
    similarity,
    role,
    stale: a.isStale,
  };
}

function codeSources(ctx: DraftContext, filePath: string, similarity: number, commit?: { sha: string; message: string }) {
  const out: Source[] = [];
  const level = ctx.settings.securityLevel;
  if (level >= 2) {
    const raw = CODE_INDEX[filePath] ?? "";
    out.push({
      id: `src-code-${filePath}`,
      type: "code",
      title: filePath,
      excerpt: raw
        .replace("{PRO}", String(ctx.codeValues.proMonthly))
        .replace("{ANNUAL}", String(ctx.codeValues.proAnnual)),
      similarity,
      filePath,
      role: "internal",
      url: `https://github.com/${ctx.settings.repo}/blob/${ctx.settings.branch}/${filePath}`,
    });
  }
  if (commit && level >= 1) {
    out.push({
      id: `src-commit-${commit.sha}`,
      type: "commit",
      title: `${commit.sha} · ${commit.message}`,
      excerpt: level === 1 ? `변경 파일: ${filePath} (레벨 1: 메타데이터만)` : `변경 파일: ${filePath}`,
      similarity: Math.max(0.5, similarity - 0.08),
      commitSha: commit.sha,
      filePath,
      role: "internal",
      url: `https://github.com/${ctx.settings.repo}/commit/${commit.sha}`,
    });
  }
  return out;
}

export function parsePrices(content: string) {
  const m = content.match(/Pro:\s*월\s*([\d,]+)원,\s*연간 결제 시 월\s*([\d,]+)원/);
  if (!m) return null;
  return { pro: Number(m[1].replace(/,/g, "")), annual: Number(m[2].replace(/,/g, "")) };
}

function extractFaq(doc: KDocument | undefined, heading: string) {
  if (!doc) return "";
  const parts = doc.content.split("\n## ");
  const hit = parts.find((p) => p.startsWith(heading));
  return hit ? hit.split("\n").slice(1).join(" ").trim() : "";
}

export function generateDraft(inq: Inquiry, ctx: DraftContext, opts: { spikeActive?: boolean } = {}): Draft {
  const text = customerText(inq);
  const topic = detectTopic(text, inq.environment.errorCode);
  const mode = ctx.settings.ragMode;
  const th = ctx.settings.similarityThreshold;
  const doc = (id: string) => ctx.documents.find((d) => d.id === id)!;
  const answer = (id: string) => ctx.answers.find((a) => a.id === id);
  const now = new Date().toISOString();
  const sources: Source[] = [];
  const reasons: string[] = [];
  const conflicts: string[] = [];
  let body = "";

  const finish = (): Draft => ({
    text: body,
    originalText: body,
    sources,
    needsManualCheck: reasons.length > 0 || conflicts.length > 0,
    manualCheckReasons: reasons,
    conflicts,
    mode,
    generatedAt: now,
  });

  const faq = doc("D003");

  switch (topic) {
    case "pricing": {
      const d1 = doc("D001");
      const best = answer("A021");
      const docPrices = parsePrices(d1.content);
      const code = ctx.codeValues;

      if (mode === "naive") {
        // 일반 RAG: 버전·재검토·근거 원칙 OFF → 가장 유사한 문서·답변을 그대로 사실 근거로 사용
        sources.push(docSource(d1, d1.content.split("\n")[2], 0.9, "fact"));
        if (best) sources.push(answerSource(best, 0.93, "fact"));
        const p = docPrices ?? { pro: 9900, annual: 7900 };
        body = `${GREET} Pro 요금제는 월 ${won(p.pro)}이며, 연간 결제 시 월 ${won(p.annual)}이에요. 노트와 기기를 무제한으로 쓰실 수 있습니다. ${CLOSE}`;
        return finish();
      }

      const docUsable = d1.status === "valid" && docPrices;
      sources.push(docSource(d1, d1.content.split("\n")[2], 0.9, "fact"));
      if (best) sources.push(answerSource(best, 0.93, "format"));
      sources.push(...codeSources(ctx, "billing/pricing.ts", 0.84, code.sha !== "c07e1b2" ? { sha: code.sha, message: "billing: Pro 가격 인상 (9,900 → 12,900)" } : undefined));

      if (d1.status !== "valid") {
        reasons.push(`근거 문서 '요금 안내'(v${d1.version})가 재검토 중이라 사실 근거에서 제외했습니다.`);
      }
      if (docPrices && docPrices.pro !== code.proMonthly) {
        conflicts.push(
          `요금 안내 v${d1.version}: Pro 월 ${won(docPrices.pro)} ↔ 최신 코드(billing/pricing.ts @${code.sha}): 월 ${won(code.proMonthly)}`,
        );
      }
      if (docPrices && docPrices.annual !== code.proAnnual) {
        conflicts.push(
          `요금 안내 v${d1.version}: 연간 월 ${won(docPrices.annual)} ↔ 최신 코드: 월 ${won(code.proAnnual)}`,
        );
      }
      if (docUsable && conflicts.length === 0) {
        body = `${GREET} Pro 요금제는 월 ${won(docPrices.pro)}이며, 연간 결제 시 월 ${won(docPrices.annual)}이에요. 노트와 기기를 무제한으로 쓰실 수 있습니다. ${CLOSE}`;
      } else {
        body = `${GREET} Pro 요금제는 월 [가격 확인 필요]이며, 연간 결제 시 월 [가격 확인 필요]이에요. 노트와 기기를 무제한으로 쓰실 수 있습니다. ${CLOSE}`;
        reasons.push("요금 문서와 코드 값이 달라 가격은 담당자가 직접 확인해야 합니다. 재검토 큐에서 문서를 먼저 갱신하세요.");
      }
      return finish();
    }

    case "refund": {
      const d2 = doc("D002");
      const a012 = answer("A012");
      if (mode === "naive") {
        if (a012) sources.push(answerSource(a012, 0.93, "fact"));
        sources.push(docSource(d2, d2.content.split("\n")[1], 0.81, "fact"));
        body = a012?.text ?? "";
        return finish();
      }
      sources.push(docSource(d2, d2.content.split("\n")[1], 0.81, "fact"));
      if (a012) sources.push(answerSource(a012, 0.93, "format"));
      sources.push(...codeSources(ctx, "billing/refund.ts", 0.72, { sha: "7be21d0", message: "refund: 환불 가능 기간 14일 → 7일 (정책 v3)" }));
      const days = d2.content.match(/(\d+)일 이내/)?.[1] ?? "7";
      body = `${GREET} 이용에 불편을 드려 죄송합니다. 결제일로부터 ${days}일 이내이고 유료 기능 사용 이력이 없으시면 전액 환불해 드려요.\n1) 설정 > 결제 관리\n2) 환불 요청\n3) 사유 선택 순서로 진행해 주세요.\n처리까지 영업일 기준 3일 걸립니다. ${CLOSE}`;
      return finish();
    }

    case "sync": {
      sources.push(docSource(faq, extractFaq(faq, "저장 시 E-502"), 0.82, "fact"));
      const a003 = answer("A003");
      if (a003) sources.push(answerSource(a003, 0.88, mode === "naive" ? "fact" : "format"));
      sources.push(...codeSources(ctx, "sync/saveHandler.ts", 0.86, { sha: "a1f3c92", message: "sync: 저장 요청 배치 처리로 변경" }));
      if (mode === "naive") {
        body = `${GREET} 저장 시 E-502 오류는 최근 sync/saveHandler.ts의 배치 처리 변경(a1f3c92) 때문으로 보입니다. 1~2분 뒤 다시 저장해 주세요. ${CLOSE}`;
        return finish();
      }
      body = `${GREET} 저장 중 E-502 오류로 불편을 드려 죄송합니다. 작성하신 내용은 기기에 임시 보관되어 있어요.\n1) 앱을 종료하지 말고\n2) 1~2분 뒤 다시 저장해 주세요.\n${
        opts.spikeActive
          ? "현재 같은 증상이 여러 건 접수되어 개발팀이 원인을 확인하고 있어요. 해결되면 이 채팅으로 바로 알려드리겠습니다."
          : "계속되면 이 채팅으로 알려주시면 바로 확인하겠습니다."
      } ${CLOSE}`;
      return finish();
    }

    case "upload": {
      sources.push(docSource(faq, extractFaq(faq, "첨부 시 E-413"), 0.88, "fact"));
      sources.push(...codeSources(ctx, "upload/attachment.ts", 0.8, { sha: "3c9d8e1", message: "upload: 첨부 용량 제한 상수 분리" }));
      body = `${GREET} 첨부 파일은 파일당 20MB까지 올릴 수 있어요. 용량을 초과하면 E-413이 표시됩니다. 파일 크기를 줄이거나 나눠서 올려주세요. ${CLOSE}`;
      return finish();
    }

    case "session": {
      sources.push(docSource(faq, extractFaq(faq, "E-401"), 0.86, "fact"));
      sources.push(...codeSources(ctx, "auth/session.ts", 0.78, { sha: "9e0aa47", message: "auth: refresh token 만료 처리 개선" }));
      body = `${GREET} 로그인은 30일간 유지되며, 기간이 지나거나 다른 기기에서 비밀번호를 바꾸시면 E-401과 함께 다시 로그인이 필요해요. 번거로우시겠지만 재로그인 부탁드립니다. ${CLOSE}`;
      return finish();
    }

    case "payfail": {
      sources.push(docSource(faq, extractFaq(faq, "결제 시 E-PAY-07"), 0.87, "fact"));
      body = `${GREET} E-PAY-07은 카드사에서 승인이 거절된 경우 표시돼요. 다른 카드로 다시 시도하시거나 카드사에 승인 거절 사유를 확인해 주세요. ${CLOSE}`;
      return finish();
    }

    case "export": {
      sources.push(docSource(faq, extractFaq(faq, "노트 내보내기"), 0.91, "fact"));
      const a005 = answer("A005");
      if (a005) sources.push(answerSource(a005, 0.9, mode === "naive" ? "fact" : "format"));
      body = `${GREET} 네, 가능해요.\n1) 노트 우측 상단 ⋯ 메뉴\n2) 내보내기\n3) Markdown 또는 PDF 선택 순서로 진행해 주세요.\n여러 노트는 폴더 단위로 내보내실 수 있어요. ${CLOSE}`;
      return finish();
    }

    case "share": {
      const d4 = doc("D004");
      sources.push(docSource(d4, d4.content.split("\n")[1], 0.89, "fact"));
      body = `${GREET} 공유 링크 권한은 보기 / 댓글 / 편집 중에서 고르실 수 있어요. 노트 우측 상단 공유 > 링크 권한에서 바꿔주세요. ${CLOSE}`;
      return finish();
    }

    case "password": {
      sources.push(docSource(faq, extractFaq(faq, "비밀번호 변경"), 0.92, "fact"));
      body = `${GREET} 비밀번호는 설정 > 계정 > 보안 > 비밀번호 변경에서 바꾸실 수 있어요. ${CLOSE}`;
      return finish();
    }

    case "vague": {
      reasons.push("문의 내용이 부족해 AI가 정보 수집 질문을 자동 발송했습니다. 고객 응답을 기다리는 중입니다.");
      return finish();
    }

    case "feature": {
      const d5 = doc("D005");
      sources.push(docSource(d5, d5.content.split("\n")[1], 0.41, "fact"));
      if (mode === "naive") {
        body = `${GREET} 말씀하신 기능은 다음 업데이트에 추가될 예정이에요. ${CLOSE}`;
        return finish();
      }
      reasons.push(`관련 로드맵 문서가 없습니다 (가장 가까운 근거 유사도 0.41 < 임계값 ${th}). 기능 유무·일정은 안내하지 마세요.`);
      body = `${GREET} 소중한 의견 감사합니다. 남겨주신 내용은 제품팀에 그대로 전달할게요. ${CLOSE}`;
      return finish();
    }

    default: {
      // sso / api / tax / unknown — 근거 없는 문의 (명세 11장 지표 7)
      const d4 = doc("D004");
      const sim = topic === "unknown" ? 0.38 : 0.44;
      sources.push(docSource(topic === "tax" ? doc("D001") : d4, (topic === "tax" ? doc("D001") : d4).content.split("\n")[1], sim, "fact"));
      if (mode === "naive") {
        const fabricated: Record<string, string> = {
          sso: "네, Team 요금제에서 SAML 기반 SSO를 지원합니다. 관리자 콘솔 > 보안에서 설정하실 수 있어요.",
          api: "네, REST API를 제공하고 있어요. 설정 > 개발자에서 API 키를 발급받으실 수 있습니다.",
          tax: "네, 세금계산서는 결제 후 설정 > 결제 관리 > 증빙에서 자동 발행됩니다.",
          unknown: "문의하신 내용은 설정 메뉴에서 처리하실 수 있어요.",
        };
        body = `${GREET} ${fabricated[topic] ?? fabricated.unknown} ${CLOSE}`;
        return finish();
      }
      reasons.push(`가장 가까운 근거 유사도 ${sim} < 임계값 ${th} — 관련 문서·코드가 없어 초안을 만들지 않았습니다. 사실을 지어내지 않도록 직접 확인 후 답변하세요.`);
      return finish();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                          S-04 고객 답변 코드 노출 차단                        */
/* -------------------------------------------------------------------------- */

/** 수정량: 정규화된 편집 거리 (0~1) */
export function editRatio(a: string, b: string) {
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  const s = a.slice(0, 800);
  const t = b.slice(0, 800);
  const prev = new Array(t.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (s[i - 1] === t[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return Math.min(1, prev[t.length] / Math.max(s.length, t.length));
}

/** 정보 수집 질문 — 사실이 들어가지 않은 질문만 자동 발송 가능 (A-08) */
export const INFO_REQUEST_TEXT =
  "확인을 위해 몇 가지 여쭤볼게요. 어떤 화면에서 안 되나요? 오류 코드나 화면 캡처를 보내주시면 더 빠르게 도와드릴 수 있어요.";

export function receiptText(avgMinutes: number) {
  return `문의가 접수되었어요. 담당자가 확인 후 답변드려요. (평균 응답 ${avgMinutes}분) 창을 닫아도 대화는 유지되고, 답변이 오면 알려드릴게요.`;
}
