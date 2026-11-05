/** 실제 담당자 알림 API (GET/PATCH /api/v1/admin/alerts). 알림 내용은 기업 공유, 읽음은 담당자별 */
import { authed } from "./auth";

export type LiveAlertType = "검증 확인 필요" | "분석 실패" | "문의 급증" | "GitHub 이슈 생성 실패";

export interface LiveAlert {
  alert_id: string;
  type: LiveAlertType;
  inquiry_id: string | null;
  group_id: string | null;
  run_id: string | null;
  message: string;
  error_code: string | null;
  read_at: string | null;
  created_at: string;
}

export interface LiveAlertPage {
  items: LiveAlert[];
  next_cursor: string | null;
  has_more: boolean;
}

export const alertApi = {
  list: (opts: { unreadOnly?: boolean; cursor?: string | null; limit?: number } = {}) => {
    const q = new URLSearchParams({ limit: String(opts.limit ?? 20), unread_only: String(opts.unreadOnly ?? true) });
    if (opts.cursor) q.set("cursor", opts.cursor);
    return authed<LiveAlertPage>(`/api/v1/admin/alerts?${q}`);
  },
  /** 반복 호출해도 최초 read_at 유지 */
  read: (alertId: string) =>
    authed<{ alert_id: string; read_at: string }>(`/api/v1/admin/alerts/${encodeURIComponent(alertId)}`, { method: "PATCH", body: { read: true } }),
};

/** 알림이 가리키는 화면 */
export function alertHref(a: LiveAlert): string {
  if (a.inquiry_id) return `/inquiries/${encodeURIComponent(a.inquiry_id)}`;
  if (a.group_id) return `/groups?focus=${encodeURIComponent(a.group_id)}`;
  return "/";
}
