/**
 * MOA Backend 고객 문의 API (/api/v1/inquiries, /api/v1/attachments)
 * - 생성·메시지 추가는 Idempotency-Key 필수. 네트워크 재시도는 같은 키·같은 본문으로만.
 * - 조회는 cursor 기반. has_more면 즉시 다음 페이지, 아니면 3초 뒤 같은 cursor로 폴링.
 */
import { AuthApiError, authed } from "./auth";
import type { Category } from "./types";

export type BackendCategory = "usage" | "account" | "billing" | "bug" | "feature_request" | "other";
export type BackendStatus = "received" | "in_review" | "needs_info" | "answered" | "closed";
export type MessageSender = "customer" | "agent" | "ai_auto";
export type MessageType = "customer_message" | "acknowledgement" | "information_request" | "final_answer";

export interface InquiryEnv {
  os: string | null;
  app_version: string | null;
  error_code: string | null;
}

export interface AttachmentMeta {
  attachment_id: number;
  file_name: string;
  mime: string;
  size: number;
}

export interface AttachmentWithUrl extends AttachmentMeta {
  url: string;
  expires_at: string;
}

export interface BackendMessage {
  message_id: number;
  sender: MessageSender;
  message_type: MessageType;
  text: string;
  attachments?: AttachmentMeta[];
  sent_at: string;
}

export interface CreateInquiryBody {
  message: string;
  source_customer_id?: string;
  customer_category?: BackendCategory;
  env: InquiryEnv;
  attachments: number[];
}

export interface CreateInquiryResponse {
  inquiry_id: number;
  status: BackendStatus;
  auto_message: BackendMessage;
}

export interface AddMessageBody {
  text: string;
  attachments: number[];
}

export interface AddMessageResponse {
  message_id: number;
  inquiry_id: number;
  inquiry_revision: number;
  status: BackendStatus;
}

export interface InquiryChatResponse {
  inquiry_id: number;
  status: BackendStatus;
  messages: BackendMessage[];
  next_cursor: string;
  has_more: boolean;
}

/** 프론트 분류 → 백엔드 Enum. 미선택은 생략(null 금지) */
export function toBackendCategory(c: Category | null | undefined): BackendCategory | undefined {
  if (!c) return undefined;
  return c === "feature" ? "feature_request" : c;
}

/** 논리 요청마다 새 ASCII 키 */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** 네트워크 오류일 때만 같은 키·본문으로 최대 2회 재시도 */
async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof AuthApiError) || e.code !== "NETWORK_ERROR") throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

export const inquiryApi = {
  create: (body: CreateInquiryBody, idempotencyKey: string) =>
    withNetworkRetry(() =>
      authed<CreateInquiryResponse>("/api/v1/inquiries", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    ),

  addMessage: (inquiryId: number, body: AddMessageBody, idempotencyKey: string) =>
    withNetworkRetry(() =>
      authed<AddMessageResponse>(`/api/v1/inquiries/${inquiryId}/messages`, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    ),

  chat: (inquiryId: number, cursor?: string | null, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return authed<InquiryChatResponse>(`/api/v1/inquiries/${inquiryId}?${q}`);
  },

  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return authed<AttachmentWithUrl>("/api/v1/attachments", { method: "POST", form });
  },

  /** 다운로드 직전에 presigned URL 발급 (기본 300초) */
  attachment: (attachmentId: number) => authed<AttachmentWithUrl>(`/api/v1/attachments/${attachmentId}`),
};

/* ------------------------------ 담당자(agent/admin) ------------------------------ */

export type BackendUrgency = "high" | "normal" | "low";

export interface InquirySummary {
  inquiry_id: number;
  title: string;
  customer_category: BackendCategory;
  category: BackendCategory | null; // AI 분석 전 null
  urgency: BackendUrgency | null;
  status: BackendStatus;
  created_at: string;
  processing_stage: null;
  group_id: null;
}

export interface InquiryListResponse {
  items: InquirySummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface InquiryDetailResponse extends InquiryChatResponse {
  tenant_id: string;
  customer_id: number;
  source_customer_id: string | null;
  title: string;
  revision: number;
  customer_category: BackendCategory;
  env: InquiryEnv;
  category: BackendCategory | null;
  urgency: BackendUrgency | null;
  created_at: string;
  updated_at: string;
  latest_customer_message_id: number;
  /** AI 실행·초안·그룹·검수는 아직 null */
  processing_stage: null;
  latest_run_id: null;
  group_id: null;
  draft: null;
  verification: null;
}

export interface AdminListFilter {
  status?: BackendStatus;
  category?: BackendCategory;
  urgency?: BackendUrgency;
}

export const adminInquiryApi = {
  list: (filter: AdminListFilter = {}, cursor?: string | null, limit = 20) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
    return authed<InquiryListResponse>(`/api/v1/admin/inquiries?${q}`);
  },
  detail: (inquiryId: number, cursor?: string | null, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set("cursor", cursor);
    return authed<InquiryDetailResponse>(`/api/v1/admin/inquiries/${inquiryId}?${q}`);
  },
};

/* ---------------------------------- 라벨 ---------------------------------- */

export const BACKEND_CATEGORY_LABEL: Record<BackendCategory, string> = {
  usage: "이용 방법",
  account: "계정",
  billing: "결제",
  bug: "기능 오류",
  feature_request: "개선 요청",
  other: "기타",
};

export const BACKEND_STATUS_LABEL: Record<BackendStatus, string> = {
  received: "접수",
  in_review: "담당자 확인 중",
  needs_info: "추가 정보 필요",
  answered: "답변 완료",
  closed: "상담 종료",
};

export const BACKEND_URGENCY_LABEL: Record<BackendUrgency, string> = {
  high: "높음",
  normal: "보통",
  low: "낮음",
};

export const INQUIRY_ERROR_MESSAGE: Record<string, string> = {
  IDEMPOTENCY_CONFLICT: "같은 요청이 다른 내용으로 이미 처리됐어요. 다시 보내 주세요.",
  ATTACHMENT_ALREADY_LINKED: "이미 다른 메시지에 첨부된 파일이에요. 다시 올려 주세요.",
  ATTACHMENT_NOT_FOUND: "첨부 파일을 찾을 수 없어요. 다시 올려 주세요.",
  INQUIRY_NOT_FOUND: "상담을 찾을 수 없어요.",
  INQUIRY_CLOSED: "종료된 상담이에요. 새 문의로 접수할게요.",
  FILE_TOO_LARGE: "파일은 10MB 이하만 올릴 수 있어요.",
  UNSUPPORTED_FILE_TYPE: "PNG, JPG, PDF 파일만 올릴 수 있어요.",
  INVALID_FILE: "파일 이름이나 내용이 올바르지 않아요.",
  STORAGE_UNAVAILABLE: "첨부 저장소를 잠시 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  TENANT_REQUIRED: "고객센터 연결이 필요해요. 새로고침해 주세요.",
  VALIDATION_ERROR: "보낼 내용을 다시 확인해 주세요.",
  NETWORK_ERROR: "네트워크가 불안정해요. 다시 시도해 주세요.",
};

export function inquiryErrorMessage(e: unknown) {
  if (e instanceof AuthApiError) return INQUIRY_ERROR_MESSAGE[e.code] ?? e.message;
  return "전송하지 못했어요. 다시 시도해 주세요.";
}
