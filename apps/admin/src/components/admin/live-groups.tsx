"use client";

import { ExternalLink, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { canRequestIssue, completedIssueUrl, groupApi, type LiveGroup, type LiveGroupDetail, type LiveGroupPage } from "@moa/shared/groups";
import { usePolling } from "@moa/shared/hooks";
import { inquiryErrorMessage, newIdempotencyKey } from "@moa/shared/inquiry";
import { Badge, Button, Card, Empty, LoadingBlock, Notice, PageHeader } from "@moa/ui";

/** 실제 서버 그룹만 사용한다. 생성 요청 후 폴링으로 Issue 완료·실패를 확인한다. */
export function LiveGroups() {
  const pages = useRef(1);
  const [moreBusy, setMoreBusy] = useState(false);
  const { data, error, loading, refresh } = usePolling(async () => {
    const items: LiveGroup[] = [];
    let page: LiveGroupPage;
    let cursor: string | null = null;
    for (let index = 0; index < pages.current; index++) {
      page = await groupApi.list(cursor);
      items.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
      if (!cursor) break;
    }
    return { items: [...new Map(items.map((g) => [g.group_id, g])).values()], cursor };
  }, 3000);

  async function more() {
    setMoreBusy(true);
    pages.current++;
    if (!(await refresh())) pages.current--;
    setMoreBusy(false);
  }

  return (
    <>
      <PageHeader title="문의 그룹" desc="실제 접수된 문의 그룹과 GitHub 이슈 처리 결과를 확인해요. 3초마다 갱신합니다."
        action={<Button variant="outline" onClick={refresh}><RefreshCw className="size-3.5" /> 새로고침</Button>} />
      <div className="mb-4"><Notice tone="info">최근 5분에 서로 다른 실시간 문의가 8건 이상 모이면 장애 구간이 생겨요. GitHub 이슈는 설정에 연결된 실제 저장소에 생성됩니다. <Link href="/settings" className="underline">연결 저장소 확인</Link></Notice></div>
      {error && <div className="mb-4"><Notice tone="warn" title="문의 그룹을 불러오지 못했어요">{error}</Notice></div>}
      {loading ? <LoadingBlock /> : data && data.items.length === 0 ? <Card><Empty icon={<Users className="size-8" />} title="실제 문의 그룹이 없어요" desc="고객 문의가 분석되어 그룹으로 묶이면 여기에 표시됩니다." /></Card> : (
        <div className="space-y-4">{data?.items.map((group) => <LiveGroupCard key={group.group_id} group={group} onChange={refresh} />)}</div>
      )}
      {data?.cursor && <div className="mt-4 text-center"><Button variant="outline" loading={moreBusy} onClick={more}>그룹 더 보기</Button></div>}
    </>
  );
}

function LiveGroupCard({ group, onChange }: { group: LiveGroup; onChange: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedRequest, setAcceptedRequest] = useState<{ episode: string; status: LiveGroup["issue_creation_status"]; error: string | null } | null>(null);
  const [detail, setDetail] = useState<LiveGroupDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const request = useRef<{ episode: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const accepted = !!acceptedRequest && acceptedRequest.episode === group.episode_id && acceptedRequest.status === group.issue_creation_status && acceptedRequest.error === group.issue_error_code;
  const retryEndedEpisode = !accepted && group.issue_creation_status === "실패" && group.issue_error_code === "EPISODE_ENDED" && canRequestIssue(group);
  const issueUrl = completedIssueUrl(group);
  const status = accepted ? "대기" : group.issue_creation_status;

  async function createIssue() {
    if (inFlight.current || !group.episode_id || !canRequestIssue(group) || accepted) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    if (request.current?.episode !== group.episode_id) request.current = { episode: group.episode_id, key: newIdempotencyKey() };
    try {
      await groupApi.createIssue(group.group_id, request.current.episode, request.current.key);
      // 접수 이후 구간 종료로 취소된 작업을 수동 재개할 때는 새 논리 요청·키를 사용한다.
      request.current = null;
      setAcceptedRequest({ episode: group.episode_id, status: group.issue_creation_status, error: group.issue_error_code });
      await onChange();
    } catch (e) {
      // 응답 유실 후 재시도에도 같은 episode·본문·키를 사용한다.
      setError(inquiryErrorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function loadDetail(more = false) {
    setDetailBusy(true);
    setError(null);
    try {
      const next = await groupApi.detail(group.group_id, more ? detail?.next_cursor : null);
      setDetail((previous) => ({ ...next, inquiry_ids: more ? [...new Set([...(previous?.inquiry_ids ?? []), ...next.inquiry_ids])] : next.inquiry_ids }));
    } catch (e) {
      setError(inquiryErrorMessage(e));
    } finally {
      setDetailBusy(false);
    }
  }

  return (
    <Card id={group.group_id} className="scroll-mt-20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-zinc-500">{group.group_id}</span>{group.surging && <Badge className="bg-red-50 text-red-700">장애 의심 · 급증</Badge>}</div>
          <h3 className="mt-1 break-words text-[15px] font-semibold text-zinc-900">{group.summary}</h3>
          <p className="mt-1 text-xs text-zinc-500">최근 {group.window_minutes}분 · {group.count}건{group.episode_ended_at ? " · 최근 장애 구간 종료" : ""}</p>
        </div>
        {status && <Badge>{status === "완료" && !issueUrl ? "생성 결과 확인 필요" : `이슈 ${status}`}</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {issueUrl ? <a href={issueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">GitHub 이슈 열기 <ExternalLink className="size-3.5" /></a> : (
          <Button size="sm" onClick={createIssue} loading={busy} disabled={!canRequestIssue(group) || accepted}>GitHub 이슈 생성 요청</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => loadDetail()} loading={detailBusy}>문의 · 코드 후보 확인</Button>
      </div>
      {!group.episode_id && <p className="mt-2 text-xs text-zinc-500">아직 장애 구간이 없어 이슈를 요청할 수 없어요.</p>}
      {(status === "대기" || status === "처리 중") && <p className="mt-2 text-xs text-zinc-500">생성 요청을 처리하고 있어요. 실제 이슈 생성이 완료되면 링크가 표시됩니다.</p>}
      {group.issue_error_code === "GITHUB_INTEGRATION_NOT_READY" && <p className="mt-2 text-xs text-amber-700">GitHub 연결을 기다리고 있어요. 설정에서 연결 상태를 확인해 주세요.</p>}
      {retryEndedEpisode && <p className="mt-2 text-xs text-amber-700">장애 구간이 끝나 자동 생성이 취소됐어요. 이 구간의 이슈를 수동으로 다시 요청할 수 있습니다.</p>}
      {((status === "실패" && !retryEndedEpisode) || status === "확인 필요" || (status === "완료" && !issueUrl)) && <p className="mt-2 text-xs text-amber-700">작업 상태와 기존 GitHub 이슈를 확인해 주세요. 중복 생성을 막기 위해 다시 요청하지 않습니다.</p>}
      {group.issue_error_code && <p className="mt-2 break-all font-mono text-xs text-amber-700">{group.issue_error_code}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {detail && <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
        <p className="text-xs text-zinc-500">오류 코드: {detail.normalized_error_codes.join(", ") || "없음"}</p>
        <div className="flex flex-wrap gap-2">{detail.inquiry_ids.map((id) => <Link key={id} href={`/inquiries/${id}`} className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs hover:bg-zinc-200">{id}</Link>)}</div>
        {detail.has_more && detail.next_cursor && <Button size="sm" variant="outline" loading={detailBusy} onClick={() => loadDetail(true)}>문의 더 보기</Button>}
        <p className="text-xs font-medium text-zinc-600">의심 코드 위치 후보 (원인 확정 아님)</p>
        {detail.suspected_code.length === 0 ? <p className="text-xs text-zinc-500">현재 검증된 코드 후보가 없어요.</p> : <ul className="space-y-2">{detail.suspected_code.map((candidate) => <li key={`${candidate.path}:${candidate.commit_sha}`} className="rounded bg-zinc-50 p-3 text-xs"><p className="break-all font-mono">{candidate.path} · {candidate.commit_sha}</p><p className="mt-1 break-words text-zinc-500">{candidate.reason}</p></li>)}</ul>}
      </div>}
    </Card>
  );
}
