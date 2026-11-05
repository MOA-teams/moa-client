/** 실제 GitHub push 이력·최근 커밋·재검토 큐 API. 데모 transport를 사용하지 않는다. */
import { authed } from "./auth";

export interface LiveCommit {
  sha: string;
  message: string;
  author: string;
  committed_at: string;
  files?: string[];
}

export interface LiveChange {
  path: string;
  previous_path: string | null;
  summary: string;
  excluded: boolean;
  exclude_reason: string | null;
  diff: string | null;
  diff_complete: boolean;
}

export type PushEventStatus = "pending" | "processing" | "completed" | "incomplete" | "failed";

export interface LivePushEvent {
  push_event_id: string;
  repo: string;
  branch: string;
  before_sha: string | null;
  after_sha: string | null;
  commit: LiveCommit | null;
  summary: string | null;
  /** change_statistics: 변경 경로·추가/삭제 수 요약 (AI 요약 아님) */
  summary_kind: string;
  changes: LiveChange[];
  affected_draft_ids: string[];
  affected_document_ids: string[];
  status: PushEventStatus;
  complete: boolean;
  error_code: string | null;
  sync_status: string;
  sync_error_code: string | null;
  created_at: string;
}

export type ReviewStatus = "pending" | "resolved" | "dismissed";
export type SuggestionStatus = "waiting_for_sources" | "processing" | "ready" | "failed" | "manual_required";

export interface LiveReview {
  review_id: string;
  target_type: "draft" | "document";
  target_id: string;
  target_version: number;
  inquiry_id: string | null;
  revision: number;
  title: string;
  reason: string;
  source: "push" | "doc_version" | "existing_state";
  push_event_id: string | null;
  current_text: string;
  suggested_text: string | null;
  suggestion_status: SuggestionStatus;
  suggestion_error: string | null;
  excluded_from_search: boolean | null;
  status: ReviewStatus;
  created_at: string;
  resolved_at: string | null;
  result: Record<string, unknown> | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DecisionResult {
  review_id: string;
  revision: number;
  status: ReviewStatus;
  resolved_at: string;
  result?: Record<string, unknown> | null;
}

export interface BulkResultItem {
  review_id: string;
  success: boolean;
  status_code: number;
  error_code?: string | null;
  result?: DecisionResult | null;
}

export type ReviewAction = "approve" | "edit" | "dismiss";

const pageQuery = (cursor?: string | null, extra?: Record<string, string>) => {
  const query = new URLSearchParams({ limit: "20", ...extra });
  if (cursor) query.set("cursor", cursor);
  return query.toString();
};

export const reviewApi = {
  pushEvents: (cursor?: string | null) => authed<Page<LivePushEvent>>(`/api/v1/admin/push-events?${pageQuery(cursor)}`),
  /** 보안 레벨 1 이상 필요(없으면 403). 새 커밋 확인은 cursor 없이 조회 */
  commits: (cursor?: string | null) => authed<Page<LiveCommit>>(`/api/v1/admin/integrations/github/commits?${pageQuery(cursor)}`),
  list: (status: ReviewStatus, cursor?: string | null) => authed<Page<LiveReview>>(`/api/v1/admin/reviews?${pageQuery(cursor, { status })}`),
  decide: (id: string, body: { action: ReviewAction; expected_revision: number; text?: string | null }, key: string) =>
    authed<DecisionResult>(`/api/v1/admin/reviews/${encodeURIComponent(id)}/decisions`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body,
    }),
  /** 최대 50개. 항목별 독립 처리이며 전체 응답은 200 */
  bulkApprove: (items: Array<{ review_id: string; expected_revision: number }>, key: string) =>
    authed<{ items: BulkResultItem[] }>("/api/v1/admin/reviews/bulk-approve", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { items },
    }),
};

export const REVIEW_ERROR_MESSAGE: Record<string, string> = {
  STALE_REVIEW: "그사이 항목이 바뀌었어요. 최신 내용을 확인해 주세요.",
  STALE_REVIEW_TARGET: "대상 답변·문서가 바뀌었어요. 최신 내용을 확인해 주세요.",
  REVIEW_ALREADY_DECIDED: "이미 처리된 항목이에요.",
  REVIEW_SUGGESTION_UNAVAILABLE: "승인할 AI 수정안이 없어요. 직접 수정해 주세요.",
  CUSTOMER_CONTENT_UNSAFE: "코드 블록이나 소스 파일 경로는 고객에게 보낼 수 없어요.",
};

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  waiting_for_sources: "검색 동기화 대기 중",
  processing: "AI 수정안 만드는 중",
  ready: "AI 수정안 준비됨",
  failed: "수정안 생성 실패",
  manual_required: "직접 수정 필요",
};

export const PUSH_STATUS_LABEL: Record<PushEventStatus, string> = {
  pending: "수집 중",
  processing: "수집 중",
  completed: "범위 확인 완료",
  incomplete: "일부 누락",
  failed: "수집 실패",
};
