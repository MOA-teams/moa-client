"use client";

import { Ban, BookText, Check, CheckCheck, EyeOff, FileCode2, GitBranch, GitCommitHorizontal, MessageSquareText, PencilLine, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { usePolling } from "@moa/shared/hooks";
import { githubApi, inquiryErrorMessage, newIdempotencyKey } from "@moa/shared/inquiry";
import {
  PUSH_STATUS_LABEL,
  REVIEW_ERROR_MESSAGE,
  SUGGESTION_STATUS_LABEL,
  reviewApi,
  suggestionErrorLabel,
  type BulkResultItem,
  type LiveCommit,
  type LivePushEvent,
  type LiveReview,
  type ReviewAction,
} from "@moa/shared/reviews";
import { cn, diffWords, formatDateTime, timeAgo } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, Empty, LoadingBlock, Notice, RichText } from "@moa/ui";

const SOURCE_LABEL: Record<LiveReview["source"], string> = { push: "push 감지", doc_version: "문서 새 버전", existing_state: "기존 상태 이관" };
const BULK_LIMIT = 50;

function errorMessage(e: unknown) {
  if (e instanceof AuthApiError && REVIEW_ERROR_MESSAGE[e.code]) return REVIEW_ERROR_MESSAGE[e.code];
  return inquiryErrorMessage(e);
}

/** 오류가 나도 다른 영역은 표시하도록 영역별로 결과를 나눈다. */
async function settle<T>(p: Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await p, error: null };
  } catch (e) {
    return { value: null, error: errorMessage(e) };
  }
}

export function LiveChanges() {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResultItem[] | null>(null);
  const bulkRequest = useRef<{ sig: string; key: string } | null>(null);

  const { data, refresh } = usePolling(async () => {
    const [integration, events, pending, resolved, dismissed] = await Promise.all([
      settle(githubApi.status()),
      settle(reviewApi.pushEvents()),
      settle(reviewApi.list("pending")),
      settle(reviewApi.list("resolved")),
      settle(reviewApi.list("dismissed")),
    ]);
    return { integration, events, pending, resolved, dismissed };
  }, 5000);
  // 커밋은 GitHub 실시간 조회라 자주 부르지 않는다.
  const commits = usePolling(() => settle(reviewApi.commits()), 60000);

  const pending = useMemo(() => data?.pending.value?.items ?? [], [data]);
  const done = useMemo(
    () => [...(data?.resolved.value?.items ?? []), ...(data?.dismissed.value?.items ?? [])].sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at)),
    [data],
  );
  const approvable = pending.filter((r) => r.suggested_text !== null);
  const chosen = approvable.filter((r) => selected.has(r.review_id)).slice(0, BULK_LIMIT);
  const allSelected = approvable.length > 0 && approvable.every((r) => selected.has(r.review_id));

  async function bulkApprove() {
    if (chosen.length === 0) return;
    const items = chosen.map((r) => ({ review_id: r.review_id, expected_revision: r.revision }));
    const sig = JSON.stringify(items);
    // 응답 유실 후 재시도는 같은 키·본문으로 보낸다.
    if (bulkRequest.current?.sig !== sig) bulkRequest.current = { sig, key: newIdempotencyKey() };
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await reviewApi.bulkApprove(items, bulkRequest.current.key);
      bulkRequest.current = null;
      setBulkResult(res.items);
      setSelected(new Set(res.items.filter((i) => !i.success).map((i) => i.review_id)));
      await refresh();
    } catch (e) {
      setBulkResult([{ review_id: "", success: false, status_code: 0, error_code: errorMessage(e) }]);
    } finally {
      setBulkBusy(false);
    }
  }

  if (!data) return <LoadingBlock />;
  const gh = data.integration.value;
  const list = tab === "pending" ? pending : done;
  const reviewError = data.pending.error ?? data.resolved.error ?? data.dismissed.error;
  const events = data.events.value?.items ?? [];
  const failed = bulkResult?.filter((i) => !i.success) ?? [];

  return (
    <>
      {data.integration.error && (
        <div className="mb-4">
          <Notice tone="warn" title="GitHub 연동 상태를 불러오지 못했어요">{data.integration.error}</Notice>
        </div>
      )}
      {gh && !gh.repository && (
        <div className="mb-4">
          <Notice tone="info" title="연결된 저장소가 없어요">
            감시 브랜치에 push가 들어와야 변경 요약과 재검토 항목이 생겨요.{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2">설정 → GitHub 연동</Link>에서 저장소를 연결해 주세요.
          </Notice>
        </div>
      )}

      {gh && (
        <Card className="mb-5">
          <div className="grid divide-y divide-zinc-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            <Stat icon={<GitBranch className="size-4" />} label="연결 레포 · 감시 브랜치">
              <span className="font-mono text-[13px]">
                {gh.repository ?? "미연결"}
                <span className="text-zinc-400">@{gh.watch_branch}</span>
              </span>
            </Stat>
            <Stat icon={<ShieldCheck className="size-4" />} label="보안 레벨">
              레벨 {gh.security_level}
            </Stat>
            <Stat icon={<FileCode2 className="size-4" />} label="감시 경로">
              <span className="font-mono text-[12.5px]">{gh.include_paths.length ? gh.include_paths.join(" ") : "전체"}</span>
            </Stat>
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <div className="flex items-center">
            <p className="text-[12.5px] font-semibold text-zinc-500">실제 수신한 push</p>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { refresh(); commits.refresh(); }}>
              <RefreshCw className="size-3.5" /> 새로고침
            </Button>
          </div>
          {data.events.error ? (
            <Notice tone="warn" title="push 이력을 불러오지 못했어요">{data.events.error}</Notice>
          ) : events.length === 0 ? (
            <Card>
              <Empty icon={<GitCommitHorizontal className="size-8" />} title="아직 수신한 push가 없어요" desc="감시 브랜치에 push가 들어오면 여기에 표시돼요." />
            </Card>
          ) : (
            events.map((ev) => <PushCard key={ev.push_event_id} ev={ev} />)
          )}
          <RecentCommits state={commits.data} />
        </div>

        <Card className="self-start">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
            <div className="flex rounded-lg bg-zinc-100 p-0.5 text-[13px]">
              {(["pending", "done"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn("rounded-md px-3 py-1.5 transition", tab === t ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500")}
                >
                  {t === "pending" ? `재검토 필요 ${pending.length}` : `처리 완료 ${done.length}`}
                </button>
              ))}
            </div>
            {tab === "pending" && approvable.length > 0 && (
              <>
                <label className="ml-2 flex items-center gap-1.5 text-[12.5px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(approvable.slice(0, BULK_LIMIT).map((r) => r.review_id)))}
                    className="size-3.5 accent-zinc-900"
                  />
                  수정안 있는 항목 전체 선택
                </label>
                <Button size="sm" className="ml-auto" disabled={chosen.length === 0} loading={bulkBusy} onClick={bulkApprove}>
                  <CheckCheck className="size-3.5" /> AI 수정안 일괄 승인 ({chosen.length})
                </Button>
              </>
            )}
          </div>
          {tab === "pending" && approvable.length > 0 && (
            <p className="border-b border-zinc-100 px-5 py-2 text-[11.5px] text-zinc-500">답변 초안을 승인하면 바로 고객에게 발송돼요. 한 번에 최대 {BULK_LIMIT}개까지 승인할 수 있어요.</p>
          )}
          {bulkResult && (
            <div className="border-b border-zinc-100 px-5 py-3">
              {failed.length === 0 ? (
                <Notice tone="info">{bulkResult.length}개 항목을 승인했어요.</Notice>
              ) : (
                <Notice tone="warn" title={`${bulkResult.length - failed.length}개 승인, ${failed.length}개 실패`}>
                  <ul className="mt-1 space-y-0.5 text-[12px]">
                    {failed.map((f) => (
                      <li key={f.review_id || "all"}>
                        {f.review_id && <span className="font-mono">{f.review_id} · </span>}
                        {(f.error_code && REVIEW_ERROR_MESSAGE[f.error_code]) ?? f.error_code ?? `오류 ${f.status_code}`}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}
            </div>
          )}
          {reviewError && (
            <div className="border-b border-zinc-100 px-5 py-3">
              <Notice tone="warn" title="재검토 목록을 불러오지 못했어요">{reviewError}</Notice>
            </div>
          )}
          {list.length === 0 ? (
            <Empty icon={<CheckCheck className="size-8" />} title={tab === "pending" ? "재검토할 항목이 없어요" : "처리한 항목이 없어요"} />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {list.map((r) => (
                <ReviewRow
                  key={r.review_id}
                  r={r}
                  selected={selected.has(r.review_id)}
                  onSelect={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v) n.add(r.review_id);
                      else n.delete(r.review_id);
                      return n;
                    })
                  }
                  onDone={refresh}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
        {icon}
        {label}
      </p>
      <div className="mt-1 truncate text-[13.5px] font-medium text-zinc-900">{children}</div>
    </div>
  );
}

function PushCard({ ev }: { ev: LivePushEvent }) {
  const [open, setOpen] = useState<string | null>(null);
  const sha = (ev.commit?.sha ?? ev.after_sha ?? "").slice(0, 7);
  const warn = ev.status === "failed" || ev.status === "incomplete";
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <GitCommitHorizontal className="size-3.5" />
          {sha && <span className="font-mono text-violet-700">{sha}</span>}
          <span>→ {ev.branch}</span>
          <Badge className={cn("ml-1", warn && "bg-amber-50 text-amber-700 ring-amber-600/20")}>{PUSH_STATUS_LABEL[ev.status]}</Badge>
          <span className="ml-auto">{timeAgo(ev.created_at)}</span>
        </div>
        <p className="mt-1 break-words text-[13.5px] font-medium text-zinc-900">{ev.commit?.message ?? "커밋 정보 없음"}</p>
        {ev.commit && <p className="mt-0.5 text-[11.5px] text-zinc-500">{ev.commit.author}</p>}
      </div>
      <div className="space-y-3 px-5 py-4">
        {ev.summary && (
          <div className="rounded-lg bg-indigo-50/70 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-indigo-600">{ev.summary_kind === "change_statistics" ? "변경 통계" : "변경 요약"}</p>
            <p className="mt-0.5 whitespace-pre-line text-[13.5px] font-medium text-indigo-950">{ev.summary}</p>
          </div>
        )}
        {ev.changes.length > 0 && (
          <ul className="space-y-1">
            {ev.changes.map((c) => (
              <li key={c.path}>
                <button
                  type="button"
                  disabled={!c.diff}
                  onClick={() => setOpen((v) => (v === c.path ? null : c.path))}
                  className={cn("flex w-full items-center gap-2 text-left text-[12.5px]", c.excluded && "text-zinc-400")}
                >
                  {c.excluded ? <EyeOff className="size-3.5 shrink-0" /> : <FileCode2 className="size-3.5 shrink-0 text-zinc-500" />}
                  <span className={cn("shrink-0 font-mono", c.excluded ? "line-through" : "text-zinc-900")}>{c.path}</span>
                  <span className="truncate">{c.excluded ? c.exclude_reason : c.summary}</span>
                </button>
                {open === c.path && c.diff && (
                  <pre className="scrollbar-thin mt-1.5 max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11.5px] leading-relaxed text-zinc-100">
                    {c.diff}
                    {!c.diff_complete && "\n… (diff 일부만 표시)"}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
        {(ev.affected_draft_ids.length > 0 || ev.affected_document_ids.length > 0) && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
            <span className="font-semibold">
              초안 {ev.affected_draft_ids.length}개 · 문서 {ev.affected_document_ids.length}개 낡았을 수 있음
            </span>
            <span className="text-amber-700">→ 재검토 큐</span>
          </div>
        )}
        {(ev.error_code || ev.sync_error_code) && <p className="break-all font-mono text-[11.5px] text-amber-700">{ev.error_code ?? ev.sync_error_code}</p>}
      </div>
    </Card>
  );
}

function RecentCommits({ state }: { state: { value: { items: LiveCommit[] } | null; error: string | null } | null }) {
  return (
    <Card>
      <CardHeader title="최근 커밋" desc="감시 브랜치의 실시간 커밋 (보안 레벨 1 이상)" />
      {!state ? (
        <p className="px-5 pb-4 text-[12.5px] text-zinc-500">불러오는 중…</p>
      ) : state.error ? (
        <p className="px-5 pb-4 text-[12.5px] text-amber-700">{state.error}</p>
      ) : state.value?.items.length === 0 ? (
        <p className="px-5 pb-4 text-[12.5px] text-zinc-500">커밋이 없어요.</p>
      ) : (
        <ul className="divide-y divide-zinc-50 px-2 py-1">
          {state.value?.items.slice(0, 8).map((c) => (
            <li key={c.sha} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
              <span className="font-mono text-violet-700">{c.sha.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700">{c.message.split("\n")[0]}</span>
              <span className="shrink-0 text-[11px] text-zinc-400">{formatDateTime(c.committed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReviewRow({ r, selected, onSelect, onDone }: { r: LiveReview; selected: boolean; onSelect: (v: boolean) => void; onDone: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const request = useRef<{ sig: string; key: string } | null>(null);
  const pending = r.status === "pending";
  const suggestion = r.suggested_text;
  const changed = suggestion !== null && suggestion !== r.current_text;
  const diff = useMemo(() => (suggestion !== null ? diffWords(r.current_text, suggestion) : []), [r.current_text, suggestion]);

  function startEdit() {
    if (!editing) setText(suggestion ?? r.current_text);
    setEditing((v) => !v);
  }

  async function act(action: ReviewAction) {
    const body = { action, expected_revision: r.revision, text: action === "edit" ? text : null };
    const sig = JSON.stringify(body);
    if (request.current?.sig !== sig) request.current = { sig, key: newIdempotencyKey() };
    setBusy(action);
    setError(null);
    try {
      await reviewApi.decide(r.review_id, body, request.current.key);
      request.current = null;
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof AuthApiError && e.status === 409) await onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        {pending && (
          <input
            type="checkbox"
            checked={selected}
            disabled={suggestion === null}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-1 size-3.5 accent-zinc-900 disabled:opacity-30"
            aria-label="선택"
          />
        )}
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", r.target_type === "document" ? "bg-sky-50 text-sky-600" : "bg-zinc-100 text-zinc-500")}>
          {r.target_type === "document" ? <BookText className="size-3.5" /> : <MessageSquareText className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13.5px] font-medium text-zinc-900">{r.title}</p>
            <Badge>{SOURCE_LABEL[r.source]}</Badge>
            {pending ? (
              <>
                <Badge>{SUGGESTION_STATUS_LABEL[r.suggestion_status]}</Badge>
                {r.excluded_from_search && (
                  <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
                    <Ban className="size-3" /> 검색 제외 중
                  </Badge>
                )}
              </>
            ) : (
              <Badge className={r.status === "resolved" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-zinc-100 text-zinc-500"}>
                {r.status === "resolved" ? "승인" : "보관"}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
            {r.reason}
            {r.inquiry_id && (
              <>
                {" · "}
                <Link href={`/inquiries/${r.inquiry_id}`} className="font-mono underline underline-offset-2">{r.inquiry_id}</Link>
              </>
            )}
          </p>

          {pending && (
            <div className="mt-3">
              {editing ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={r.target_type === "document" ? 7 : 4}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-zinc-400"
                />
              ) : (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className={cn("block w-full whitespace-pre-line rounded-lg bg-zinc-50 px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-zinc-700", !expanded && "line-clamp-3")}
                >
                  {changed
                    ? diff.map((p, i) => (
                        <span key={i} className={cn(p.type === "add" && "rounded bg-emerald-100 text-emerald-900", p.type === "del" && "rounded bg-red-100 text-red-700 line-through")}>
                          {p.text}
                        </span>
                      ))
                    : <RichText text={r.current_text} />}
                </button>
              )}
              {r.suggestion_error && !editing && <p className="mt-1.5 text-[11.5px] text-amber-700">{suggestionErrorLabel(r.suggestion_error)}</p>}
              {error && <p role="alert" className="mt-1.5 text-[12px] text-red-600">{error}</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[11.5px] text-zinc-500">
                  {editing ? (r.target_type === "draft" ? "승인하면 고객에게 바로 발송돼요" : "새 문서 버전으로 저장돼요") : changed ? "AI 수정안과 현재 내용을 비교해요" : suggestion === null ? "자동 수정안이 없어요. 직접 수정해 주세요" : "수정안이 현재 내용과 같아요"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => act("dismiss")} loading={busy === "dismiss"} disabled={!!busy}>
                  <EyeOff className="size-3.5" /> 보관
                </Button>
                <Button size="sm" variant="outline" onClick={startEdit} disabled={!!busy}>
                  <PencilLine className="size-3.5" /> {editing ? "비교 보기" : "직접 수정"}
                </Button>
                {editing ? (
                  <Button size="sm" onClick={() => act("edit")} loading={busy === "edit"} disabled={!!busy || !text.trim()}>
                    <Check className="size-3.5" /> 수정본 승인
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => act("approve")} loading={busy === "approve"} disabled={!!busy || suggestion === null}>
                    <Check className="size-3.5" /> 수정안 승인
                  </Button>
                )}
              </div>
            </div>
          )}
          {!pending && r.resolved_at && <p className="mt-1 text-[11.5px] text-zinc-400">{formatDateTime(r.resolved_at)} 처리</p>}
        </div>
      </div>
    </li>
  );
}
