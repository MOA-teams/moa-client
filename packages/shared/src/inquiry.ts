/**
 * MOA Backend 문의·채팅·첨부·답변·평가·문서 API
 * - 도메인 Enum은 계약의 한글 값, ID는 접두어 포함 문자열 (Q-1006, MSG-000012, ATT-0002, DOC-001)
 * - 변경 API는 Idempotency-Key 필수. 재시도는 같은 키·같은 본문으로만.
 * - 조회는 cursor 기반. has_more면 즉시 다음 페이지, 아니면 3초 뒤 같은 cursor로 폴링.
 */
import { AuthApiError, authed } from "./auth";
import type { Category } from "./types";

/* ---------------------------------- Enum ---------------------------------- */

export const INQUIRY_CATEGORIES = ["이용 방법", "계정", "결제", "기능 오류", "개선 요청", "기타"] as const;
export const INQUIRY_STATUSES = ["접수", "담당자 확인 중", "추가 정보 필요", "답변 완료", "상담 종료"] as const;
export const INQUIRY_URGENCIES = ["높음", "보통", "낮음"] as const;
export const DOC_TYPES = ["정책", "FAQ", "기능 명세", "릴리즈 노트"] as const;
export const DOC_STATUSES = ["유효", "폐기"] as const;

export type BackendCategory = (typeof INQUIRY_CATEGORIES)[number];
export type BackendStatus = (typeof INQUIRY_STATUSES)[number];
export type BackendUrgency = (typeof INQUIRY_URGENCIES)[number];
export type MessageSender = "customer" | "agent" | "ai_auto";
export type MessageType = "고객 메시지" | "접수 안내" | "정보 수집 질문" | "최종 답변";
export type RunStatus = "대기" | "처리 중" | "완료" | "실패";
export type DraftResult = "초안 가능" | "직접 확인 필요" | "추가 질문 필요";
export type CheckStatus = "통과" | "실패" | "확인 불가" | "미실행";
export type ResolutionStatus = "미확인" | "해결 확인" | "미해결";
export type DocType = (typeof DOC_TYPES)[number];
export type DocStatus = (typeof DOC_STATUSES)[number];
export type IndexingStatus = "대기" | "처리 중" | "완료" | "실패";

/** 실제(백엔드) 문의 ID 형식 — 데모 mock ID(Q031)와 구분 */
export const LIVE_INQUIRY_ID = /^Q-\d{4,}$/;

/* --------------------------------- 공통 타입 --------------------------------- */

export interface InquiryEnv {
  os: string | null;
  app_version: string | null;
  error_code: string | null;
}

export interface AttachmentMeta {
  attachment_id: string;
  file_name: string;
  mime: string;
  size: number;
}

export interface AttachmentWithUrl extends AttachmentMeta {
  url: string;
  expires_at: string;
}

export interface BackendMessage {
  message_id: string;
  answer_id?: string | null;
  sender: MessageSender;
  message_type: MessageType;
  text: string;
  attachments?: AttachmentMeta[];
  sent_at: string;
}

export interface FeedbackResponse {
  rating: number | null;
  resolved: boolean | null;
  comment: string | null;
  inquiry_id: string;
  answer_id: string;
  resolution_status: ResolutionStatus;
  recorded_at: string;
}

/** 고객 상담 이탈 상태 (담당자 상세) */
export interface CustomerPresence {
  status: "상담 중" | "나감";
  left_at: string | null;
  left_reason: "left" | "new_chat" | null;
}

export type SessionEventType = "left" | "new_chat" | "returned";

export interface InquiryChatResponse {
  inquiry_id: string;
  /** 담당자들이 읽은 가장 뒤의 메시지 ID (고객 화면 '읽음' 표시용) */
  agent_last_read_message_id?: string | null;
  status: BackendStatus;
  messages: BackendMessage[];
  next_cursor: string;
  has_more: boolean;
  closed_at?: string | null;
  resolution_status?: ResolutionStatus;
  feedback_requested?: boolean;
  feedback_submitted?: boolean;
  feedback?: FeedbackResponse | null;
}

/* ---------------------------------- 고객 ---------------------------------- */

/** GET /api/v1/inquiries — 고객 본인 문의 목록 항목 */
export interface CustomerInquirySummary {
  inquiry_id: string;
  title: string;
  status: BackendStatus;
  created_at: string;
}

export interface CustomerInquiryListResponse {
  items: CustomerInquirySummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface CreateInquiryBody {
  message: string;
  source_customer_id?: string;
  customer_category?: BackendCategory;
  env: InquiryEnv;
  attachments: string[];
}

export interface CreateInquiryResponse {
  inquiry_id: string;
  status: BackendStatus;
  auto_message: BackendMessage;
}

export interface AddMessageBody {
  text: string;
  attachments: string[];
}

export interface AddMessageResponse {
  message_id: string;
  inquiry_id: string;
  inquiry_revision: number;
  status: BackendStatus;
}

export interface FeedbackBody {
  rating?: number | null;
  resolved?: boolean | null;
  comment?: string | null;
}

/** 프론트(mock) 분류 → 백엔드 한글 Enum. 미선택은 생략(null 금지) */
export function toBackendCategory(c: Category | null | undefined): BackendCategory | undefined {
  if (!c) return undefined;
  const map: Record<Category, BackendCategory> = {
    usage: "이용 방법",
    account: "계정",
    billing: "결제",
    bug: "기능 오류",
    feature: "개선 요청",
    other: "기타",
  };
  return map[c];
}

/** 논리 요청마다 새 ASCII 키 */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** 네트워크 오류(또는 지정 코드)일 때만 같은 키·본문으로 최대 2회 재시도 */
async function withRetry<T>(fn: () => Promise<T>, retryCodes: string[] = []): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof AuthApiError) || (e.code !== "NETWORK_ERROR" && !retryCodes.includes(e.code))) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

const idem = (key: string) => ({ "Idempotency-Key": key });
const enc = encodeURIComponent;

export const inquiryApi = {
  /** 본인 문의 목록 (최근 접수순, '새 상담'으로 떠난 과거 문의 포함). 새 문의 확인은 cursor 없이 첫 페이지 */
  list: (cursor?: string | null, limit = 20) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return authed<CustomerInquiryListResponse>(`/api/v1/inquiries?${q}`);
  },

  create: (body: CreateInquiryBody, key: string) =>
    withRetry(() => authed<CreateInquiryResponse>("/api/v1/inquiries", { method: "POST", body, headers: idem(key) })),

  addMessage: (inquiryId: string, body: AddMessageBody, key: string) =>
    withRetry(() => authed<AddMessageResponse>(`/api/v1/inquiries/${enc(inquiryId)}/messages`, { method: "POST", body, headers: idem(key) })),

  chat: (inquiryId: string, cursor?: string | null, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return authed<InquiryChatResponse>(`/api/v1/inquiries/${enc(inquiryId)}?${q}`);
  },

  /** 종료된 본인 상담의 최초 평가 (한 번만) */
  feedback: (inquiryId: string, body: FeedbackBody, key: string) =>
    withRetry(() => authed<FeedbackResponse>(`/api/v1/inquiries/${enc(inquiryId)}/feedback`, { method: "POST", body, headers: idem(key) })),

  /** 고객 읽음 위치 기록 (앞으로만 이동, Idempotency-Key 불필요) */
  read: (inquiryId: string, lastReadMessageId: string) =>
    authed<{ last_read_message_id: string }>(`/api/v1/inquiries/${enc(inquiryId)}/read`, { method: "POST", body: { last_read_message_id: lastReadMessageId } }),

  /** 상담 이탈·복귀 기록. 창 닫힘(left)은 keepalive로 보내 페이지를 떠나도 전송 */
  sessionEvent: (inquiryId: string, type: SessionEventType, opts: { keepalive?: boolean } = {}) =>
    authed<{ customer_presence: CustomerPresence }>(`/api/v1/inquiries/${enc(inquiryId)}/session-events`, {
      method: "POST",
      body: { type },
      keepalive: opts.keepalive,
    }),

  upload: (file: File, purpose: "inquiry" | "document" = "inquiry") => {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    return authed<AttachmentWithUrl>("/api/v1/attachments", { method: "POST", form });
  },

  /** 다운로드 직전에 presigned URL 발급 (기본 300초) */
  attachment: (attachmentId: string) => authed<AttachmentWithUrl>(`/api/v1/attachments/${enc(attachmentId)}`),
};

/* ------------------------------ 담당자(agent/admin) ------------------------------ */

export interface InquirySummary {
  inquiry_id: string;
  title: string;
  customer_category: BackendCategory;
  category: BackendCategory | null;
  urgency: BackendUrgency | null;
  status: BackendStatus;
  created_at: string;
  processing_stage: string | null;
  group_id: null;
}

export interface InquiryListResponse {
  items: InquirySummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DocEvidence {
  doc_id: string;
  version: number;
}
export interface CodeEvidence {
  path: string;
  commit_sha?: string | null;
}
export interface Evidence {
  docs?: DocEvidence[];
  code?: CodeEvidence[];
}

export interface Analysis {
  category: BackendCategory;
  urgency: BackendUrgency;
  summary: string;
  normalized_error_code?: string | null;
  missing_fields?: string[];
}

export interface DraftView {
  answer_text: string;
  evidence: Evidence;
  citations?: Array<{ text: string; docs?: DocEvidence[] }>;
  style_references?: Array<{ best_id: string; version: number }>;
  draft_id: string;
  revision: number;
  draft_result: DraftResult;
  review_reasons?: string[];
}

export interface Verification {
  status: CheckStatus;
  checks?: Record<string, unknown>;
  reasons?: string[];
  unsupported_sentences?: string[];
}

export interface SimilarInquiries {
  items?: Array<{ inquiry_id: string; group_id?: string | null; score: number }>;
  suggested_group_id?: string | null;
  reason?: string | null;
}

export interface AnswerAudit {
  answer_id: string;
  message_id: string;
  answer_text: string;
  evidence: Evidence;
  original_draft: { answer_text?: string } | null;
  original_verification: Record<string, unknown> | null;
  approval: Record<string, unknown>;
  agent_edit_ratio: number | null;
  /** "담당자" | "자동" */
  delivery_mode: string;
  agent_id: string | null;
  run_id: string | null;
  draft_revision: number | null;
  answered_at: string;
}

/** 서버 자동 응대 정책 결과 (AI가 추가 질문·답변을 자동 발송했거나 담당자 검토로 전환) */
export interface AutomaticResponseView {
  answer_id?: string | null;
  run_id: string;
  delivery_action: "담당자 검토" | "추가 질문 전송" | "자동 답변 전송";
  message_id: string | null;
  review_reasons: string[];
  requires_review: boolean;
  delivery_mode: "자동" | null;
  agent_id?: null;
}

export interface InquiryDetailResponse extends InquiryChatResponse {
  automatic_response?: AutomaticResponseView | null;
  /** 고객이 읽은 마지막 메시지 ID (담당자 화면 '읽음' 표시용) */
  customer_last_read_message_id?: string | null;
  customer_presence?: CustomerPresence;
  backend_knowledge_revision: number;
  answers?: AnswerAudit[];
  tenant_id: string;
  customer_id: string;
  source_customer_id: string | null;
  title: string;
  revision: number;
  customer_category: BackendCategory;
  env: InquiryEnv;
  category: BackendCategory | null;
  urgency: BackendUrgency | null;
  created_at: string;
  updated_at: string;
  latest_customer_message_id: string;
  processing_stage: string | null;
  latest_run_id: string | null;
  analysis_request_id: string | null;
  run_status: RunStatus | null;
  analysis_error: string | null;
  analysis: Analysis | null;
  additional_question: string | null;
  similar_inquiries: SimilarInquiries | null;
  knowledge_revision: number | null;
  draft_result: DraftResult | null;
  group_id: null;
  draft: DraftView | null;
  verification: Verification | null;
}

export interface AdminListFilter {
  status?: BackendStatus;
  category?: BackendCategory;
  urgency?: BackendUrgency;
}

export interface AnswerBody {
  draft_id: string | null;
  draft_revision: number | null;
  expected_inquiry_revision: number;
  expected_last_customer_message_id: string;
  expected_backend_knowledge_revision: number;
  answer_text: string;
  evidence: Evidence;
}

export const adminInquiryApi = {
  list: (filter: AdminListFilter = {}, cursor?: string | null, limit = 20) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
    return authed<InquiryListResponse>(`/api/v1/admin/inquiries?${q}`);
  },

  detail: (inquiryId: string, cursor?: string | null, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return authed<InquiryDetailResponse>(`/api/v1/admin/inquiries/${enc(inquiryId)}?${q}`);
  },

  /** 담당자 읽음 위치 기록 (문의별 공통, 앞으로만 이동) */
  read: (inquiryId: string, lastReadMessageId: string) =>
    authed<{ last_read_message_id: string }>(`/api/v1/admin/inquiries/${enc(inquiryId)}/read`, { method: "POST", body: { last_read_message_id: lastReadMessageId } }),

  /** AI 재분석 요청 (고객 자동 발송 없음) */
  analyze: (inquiryId: string, body: { expected_inquiry_revision: number; based_on_message_id: string; review_only?: boolean }, key: string) =>
    withRetry(() =>
      authed<{ inquiry_id: string; analysis_request_id: string; run_id: string | null; run_status: RunStatus }>(`/api/v1/admin/inquiries/${enc(inquiryId)}/analysis`, {
        method: "POST",
        body: { review_only: true, ...body },
        headers: idem(key),
      }),
    ),

  /** 담당자 분류·긴급도 확정 (이후 AI 결과가 덮어쓰지 않음) */
  classify: (inquiryId: string, body: { expected_revision: number; category: BackendCategory; urgency: BackendUrgency; reason: string }) =>
    authed<{ inquiry_id: string; revision: number; category: BackendCategory; urgency: BackendUrgency }>(`/api/v1/admin/inquiries/${enc(inquiryId)}/classification`, {
      method: "PATCH",
      body,
    }),

  /** 최종 답변 승인·발송. 503 근거 확인 실패는 같은 키·본문으로 재시도 */
  answer: (inquiryId: string, body: AnswerBody, key: string) =>
    withRetry(
      () =>
        authed<{ answer_id: string; message_id: string; inquiry_id: string; inquiry_revision: number; status: BackendStatus; delivery_mode: "담당자" | "자동"; agent_id: string | null; answered_at: string }>(
          `/api/v1/admin/inquiries/${enc(inquiryId)}/answers`,
          { method: "POST", body, headers: idem(key) },
        ),
      ["EVIDENCE_CHECK_UNAVAILABLE"],
    ),

  /** 답변 이후 상담 종료 → 고객에게 평가 요청 */
  close: (inquiryId: string, body: { expected_inquiry_revision: number }, key: string) =>
    withRetry(() =>
      authed<{ inquiry_id: string; inquiry_revision: number; status: BackendStatus; resolution_status: ResolutionStatus; closed_at: string; feedback_requested: boolean }>(
        `/api/v1/admin/inquiries/${enc(inquiryId)}/close`,
        { method: "POST", body: { resolution_status: "미확인", ...body }, headers: idem(key) },
      ),
    ),
};

/* ---------------------------------- 문서 ---------------------------------- */

export interface DocumentSummary {
  doc_id: string;
  version: number;
  status: DocStatus;
  review_required: boolean;
  searchable: boolean;
  title: string;
  doc_type: DocType;
  created_at: string;
  uploaded_at: string;
  attachment_id: string | null;
  indexing_status: IndexingStatus;
  indexing_error: string | null;
  sync_error: string | null;
}

export interface DocumentCreateBody {
  doc_id?: string | null;
  version: number;
  doc_type: DocType;
  title: string;
  status?: DocStatus;
  created_at: string;
  text?: string | null;
  attachment_id?: string | null;
}

export const documentApi = {
  list: (status?: DocStatus, cursor?: string | null, limit = 100) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (status) q.set("status", status);
    if (cursor) q.set("cursor", cursor);
    return authed<{ items: DocumentSummary[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/admin/documents?${q}`);
  },

  /** 신규: doc_id 생략 + version 1 / 새 버전: 기존 doc_id + 다음 version. 503은 같은 키로 재시도 */
  create: (body: DocumentCreateBody, key: string) =>
    withRetry(
      () =>
        authed<{ doc_id: string; version: number; status: DocStatus; indexing_status: IndexingStatus; uploaded_at: string }>("/api/v1/admin/documents", {
          method: "POST",
          body,
          headers: idem(key),
        }),
      ["DOCUMENT_SYNC_FAILED"],
    ),

  setStatus: (docId: string, version: number, body: { status: DocStatus; review_required: boolean; reason: string }) =>
    withRetry(
      () =>
        authed<{ doc_id: string; version: number; status: DocStatus; review_required: boolean; searchable: boolean }>(
          `/api/v1/admin/documents/${enc(docId)}/versions/${version}/status`,
          { method: "PATCH", body },
        ),
      ["DOCUMENT_SYNC_FAILED"],
    ),
};

/* ------------------------------- GitHub 연동 ------------------------------- */

export interface AuthorizedRepository {
  installation_id: number;
  repository_id: number;
  repository: string;
  default_branch: string;
}

export interface GitHubStatus {
  integration_id: string;
  status: string;
  installation_id: number | null;
  repository: string | null;
  watch_branch: string;
  security_level: number;
  include_paths: string[];
  exclude_patterns: string[];
  document_bindings: Array<{ path: string; doc_id: string }>;
  analysis_provider: "external_llm" | "none";
  last_synced_sha: string | null;
  last_synced_at: string | null;
  error_code: string | null;
  report: Record<string, unknown>;
}

export interface GitHubConnectBody {
  authorization_id?: string | null;
  installation_id?: number | null;
  repository?: string | null;
  watch_branch?: string;
  /** 0: 연동 안 함 · 1: 메타데이터만 · 2: 경로 제한 코드 (3은 미지원) */
  security_level: 0 | 1 | 2;
  include_paths?: string[];
  exclude_patterns?: string[];
  document_bindings?: Array<{ path: string; doc_id: string }>;
}

export const githubApi = {
  status: () => authed<GitHubStatus>("/api/v1/admin/integrations/github"),
  /** GitHub App 설치·사용자 인증 시작 → 이동할 URL */
  start: () => authed<{ authorization_url: string; installation_url: string; expires_in: number }>("/api/v1/admin/integrations/github/authorization", { method: "POST" }),
  /** GitHub에서 돌아온 state·code로 인증 완료 → 관리 가능한 저장소 목록 */
  complete: (state: string, code: string) =>
    authed<{ authorization_id: string; repositories: AuthorizedRepository[]; expires_in: number }>("/api/v1/admin/integrations/github/authorization/complete", {
      method: "POST",
      body: { state, code },
    }),
  /** branch 생략 → 브랜치 목록, branch 지정 → 해당 sha의 경로 목록 */
  branches: (authorization_id: string, repository_id: number) =>
    authed<{ branches: Array<{ name: string; sha: string }> }>("/api/v1/admin/integrations/github/selection", {
      method: "POST",
      body: { authorization_id, repository_id },
    }),
  paths: (authorization_id: string, repository_id: number, branch: string) =>
    authed<{ sha: string; paths: string[] }>("/api/v1/admin/integrations/github/selection", {
      method: "POST",
      body: { authorization_id, repository_id, branch },
    }),
  /** 연동 설정·최초 인덱싱 접수 (admin 전용) */
  connect: (body: GitHubConnectBody, key: string) =>
    withRetry(() => authed<{ integration_id: string; status: string }>("/api/v1/admin/integrations/github", { method: "POST", body, headers: idem(key) })),
};

/* ------------------------------- AI 결과 라벨 ------------------------------- */

/** 서버가 내려주는 검토 사유 코드 → 안내 문구 (모르는 값은 그대로 표시) */
export const REVIEW_REASON_LABEL: Record<string, string> = {
  AUTO_RESPONSE_DISABLED: "이 기업은 자동 응대가 꺼져 있어 담당자 검토로 넘어왔어요",
};

export const VERIFICATION_CHECK_LABEL: Record<string, string> = {
  source_conflict: "근거 간 충돌 없음",
  claims_supported: "문장마다 근거 있음",
  evidence_current: "근거가 최신 버전",
  auto_response_scope: "자동 응대 허용 범위",
  internal_data_excluded: "내부 정보(코드 등) 제외",
};

export const reviewReasonLabel = (code: string) => REVIEW_REASON_LABEL[code] ?? code;

/** AI 분석 실패 코드 → 안내 문구 */
export const ANALYSIS_ERROR_LABEL: Record<string, string> = {
  AI_PIPELINE_FAILED: "AI가 이 문의를 처리하지 못했어요. 재분석을 요청하거나, 내용을 직접 확인해 답변해 주세요.",
};
export const analysisErrorLabel = (code: string) => ANALYSIS_ERROR_LABEL[code] ?? code;

/* ---------------------------------- 오류 ---------------------------------- */

export const INQUIRY_ERROR_MESSAGE: Record<string, string> = {
  IDEMPOTENCY_CONFLICT: "같은 요청이 다른 내용으로 이미 처리됐어요. 다시 시도해 주세요.",
  ATTACHMENT_ALREADY_LINKED: "이미 다른 메시지에 첨부된 파일이에요. 다시 올려 주세요.",
  ATTACHMENT_NOT_FOUND: "첨부 파일을 찾을 수 없어요. 다시 올려 주세요.",
  INQUIRY_NOT_FOUND: "상담을 찾을 수 없어요.",
  INQUIRY_CLOSED: "이미 종료된 상담이에요.",
  INQUIRY_NOT_CLOSED: "상담이 종료된 뒤에 평가할 수 있어요.",
  FEEDBACK_ALREADY_SUBMITTED: "이미 평가를 남기셨어요.",
  ANSWER_REQUIRED: "답변이 발송된 뒤에 진행할 수 있어요.",
  ANSWER_ALREADY_SENT: "이미 답변이 발송됐어요. 최신 내용을 확인해 주세요.",
  STALE_INQUIRY_REVISION: "그사이 문의가 바뀌었어요. 최신 내용을 확인하고 다시 시도해 주세요.",
  STALE_CUSTOMER_MESSAGE: "고객이 새 메시지를 보냈어요. 확인 후 다시 작성해 주세요.",
  STALE_DRAFT: "초안이 새로 만들어졌어요. 최신 초안을 확인해 주세요.",
  STALE_KNOWLEDGE: "근거 문서가 바뀌었어요. 초안을 다시 확인해 주세요.",
  STALE_EVIDENCE: "근거로 쓴 문서가 최신이 아니에요. 다시 확인해 주세요.",
  EVIDENCE_NOT_RETRIEVED: "AI가 실제로 찾은 근거만 첨부할 수 있어요.",
  CODE_EVIDENCE_UNVERIFIED: "코드 근거를 확인하지 못했어요.",
  EVIDENCE_CHECK_UNAVAILABLE: "근거 확인 서버에 잠시 연결할 수 없어요. 다시 시도해 주세요.",
  DOCUMENT_NOT_FOUND: "근거 문서를 찾을 수 없어요.",
  DOCUMENT_VERSION_CONFLICT: "문서 버전이 맞지 않아요. 목록을 새로고침해 주세요.",
  DOCUMENT_SYNC_PENDING: "이전 버전 처리가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.",
  DOCUMENT_SYNC_FAILED: "검색 상태 반영에 실패했어요. 다시 시도해 주세요.",
  ID_SPACE_EXHAUSTED: "문서 ID를 더 발급할 수 없어요. 백엔드에 문의해 주세요.",
  FILE_TOO_LARGE: "파일은 10MB 이하만 올릴 수 있어요.",
  UNSUPPORTED_FILE_TYPE: "PNG, JPG, PDF 파일만 올릴 수 있어요.",
  INVALID_FILE: "파일 이름이나 내용이 올바르지 않아요.",
  STORAGE_UNAVAILABLE: "첨부 저장소를 잠시 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  TENANT_REQUIRED: "고객센터 연결이 필요해요. 새로고침해 주세요.",
  FORBIDDEN: "이 계정으로는 할 수 없는 작업이에요.",
  VALIDATION_ERROR: "입력한 내용을 다시 확인해 주세요.",
  NETWORK_ERROR: "네트워크가 불안정해요. 다시 시도해 주세요.",
  MESSAGE_NOT_FOUND: "메시지를 찾을 수 없어요.",
  GITHUB_NOT_CONFIGURED: "서버에 GitHub 연동 설정이 아직 없어요. 백엔드에서 GitHub App을 설정해야 해요.",
  GITHUB_UNAVAILABLE: "GitHub에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  GITHUB_AUTHORIZATION_INVALID: "GitHub 인증이 만료됐거나 올바르지 않아요. 연결을 다시 시작해 주세요.",
  GITHUB_REPOSITORY_NOT_FOUND: "저장소를 찾을 수 없어요. GitHub App 설치 범위를 확인해 주세요.",
  GITHUB_REPOSITORY_CONNECTED: "이미 다른 곳에 연결된 저장소예요.",
};

export function inquiryErrorMessage(e: unknown) {
  if (e instanceof AuthApiError) return INQUIRY_ERROR_MESSAGE[e.code] ?? e.message;
  return "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}
