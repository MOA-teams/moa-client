/** 실제 문의 그룹·GitHub Issue API. 데모 transport를 사용하지 않는다. */
import { authed } from "./auth";

export type IssueCreationStatus = "대기" | "처리 중" | "완료" | "실패" | "확인 필요";
export interface LiveGroup {
  group_id: string;
  summary: string;
  count: number;
  window_minutes: number;
  surging: boolean;
  episode_id: string | null;
  episode_ended_at: string | null;
  issue_creation_status: IssueCreationStatus | null;
  issue_error_code: string | null;
  issue_url: string | null;
}
export interface LiveGroupPage {
  items: LiveGroup[];
  next_cursor: string | null;
  has_more: boolean;
}
export interface LiveGroupDetail extends LiveGroup {
  inquiry_ids: string[];
  normalized_error_codes: string[];
  suspected_code: Array<{ path: string; commit_sha: string; reason: string }>;
  next_cursor: string | null;
  has_more: boolean;
}
export interface IssueAccepted {
  group_id: string;
  episode_id: string;
  issue_creation_status: IssueCreationStatus;
}

const pageQuery = (cursor?: string | null) => {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return query.toString();
};

export const groupApi = {
  list: (cursor?: string | null) => authed<LiveGroupPage>(`/api/v1/admin/groups?${pageQuery(cursor)}`),
  detail: (id: string, cursor?: string | null) =>
    authed<LiveGroupDetail>(`/api/v1/admin/groups/${encodeURIComponent(id)}?${pageQuery(cursor)}`),
  /** 202는 생성 요청 접수다. 완료 여부와 URL은 이후 그룹 조회로 확인한다. */
  createIssue: (id: string, episodeId: string, key: string) =>
    authed<IssueAccepted>(`/api/v1/admin/groups/${encodeURIComponent(id)}/github-issues`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { episode_id: episodeId, include_suspected_code: true },
    }),
};

/** 종료된 자동 작업만 수동 재요청 가능하다. 결과가 불명확한 작업은 중복 생성하지 않는다. */
export function canRequestIssue(group: LiveGroup): boolean {
  return !!group.episode_id && !group.issue_url && (
    !group.issue_creation_status || (group.issue_creation_status === "실패" && group.issue_error_code === "EPISODE_ENDED")
  );
}

/** 서버가 생성 완료로 확인한 실제 Issue URL만 링크로 표시한다. */
export function completedIssueUrl(group: LiveGroup): string | null {
  if (group.issue_creation_status !== "완료" || !group.issue_url) return null;
  try {
    const url = new URL(group.issue_url);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && /^\/[^/]+\/[^/]+\/issues\/\d+\/?$/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
