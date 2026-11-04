"use client";

import {
  ArrowRight,
  Ban,
  BookText,
  Check,
  CheckCheck,
  EyeOff,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  MessageSquareText,
  PencilLine,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError, adminApi, demoApi, type ReviewView } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { SECURITY_LEVELS, TIER_LABEL } from "@moa/shared/labels";
import type { PushEvent } from "@moa/shared/types";
import { cn, diffWords, formatDateTime, timeAgo } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, Empty, LoadingBlock, Notice, PageHeader } from "@moa/ui";

const SOURCE_LABEL = { push: "push 감지", doc_version: "문서 새 버전", rating: "낮은 별점" } as const;

export function ChangesView() {
  const { data, refresh } = usePolling(async () => {
    const [events, reviews, settings, system] = await Promise.all([
      adminApi.pushEvents(),
      adminApi.reviews(),
      adminApi.settings(),
      adminApi.system(),
    ]);
    return { events, reviews, settings, system };
  }, 3000);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const pending = useMemo(() => data?.reviews.filter((r) => r.status === "pending") ?? [], [data]);
  const done = useMemo(() => data?.reviews.filter((r) => r.status !== "pending") ?? [], [data]);

  async function push() {
    setPushing(true);
    setPushError(null);
    try {
      await demoApi.push();
      await refresh();
    } catch (e) {
      setPushError(e instanceof ApiError ? e.message : "실패");
    } finally {
      setPushing(false);
    }
  }

  async function bulkApprove() {
    setBulkBusy(true);
    try {
      await adminApi.bulkApprove([...selected]);
      setSelected(new Set());
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  if (!data) return <LoadingBlock />;
  const level = SECURITY_LEVELS[data.settings.securityLevel];
  const list = tab === "pending" ? pending : done;
  const allSelected = pending.length > 0 && pending.every((r) => selected.has(r.id));

  return (
    <>
      <PageHeader
        title="변경 감지 · 재검토 큐"
        desc="감시 브랜치에 push가 들어오면 diff를 요약하고, 연결된 답변·문서를 재검토 필요로 표시해요. 처리 전까지 검색에서 빠집니다."
        action={
          <Button onClick={push} loading={pushing} disabled={data.system.pushed}>
            <Upload className="size-3.5" />
            {data.system.pushed ? "요금 변경 커밋 반영됨" : "데모: 요금 변경 커밋 push"}
          </Button>
        }
      />
      {pushError && (
        <div className="mb-4">
          <Notice tone="warn">{pushError}</Notice>
        </div>
      )}

      {/* 연결 상태 */}
      <Card className="mb-5">
        <div className="grid divide-y divide-zinc-100 md:grid-cols-4 md:divide-x md:divide-y-0">
          <Stat icon={<GitBranch className="size-4" />} label="연결 레포 · 감시 브랜치">
            <span className="font-mono text-[13px]">
              {data.settings.repo}
              <span className="text-zinc-400">@{data.settings.branch}</span>
            </span>
          </Stat>
          <Stat icon={<ShieldCheck className="size-4" />} label="보안 레벨">
            레벨 {data.settings.securityLevel} · {level.name}
          </Stat>
          <Stat icon={<FileCode2 className="size-4" />} label="감시 경로">
            <span className="font-mono text-[12.5px]">{data.settings.watchPaths.join(" ")}</span>
          </Stat>
          <Stat icon={<GitCommitHorizontal className="size-4" />} label="현재 Pro 요금 (코드)">
            <span className="tabular-nums">
              {data.system.codeValues.proMonthly.toLocaleString()}원{" "}
              <span className="font-mono text-[11.5px] text-zinc-400">@{data.system.codeValues.sha}</span>
            </span>
          </Stat>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        {/* push 이벤트 */}
        <div className="space-y-4">
          <p className="text-[12.5px] font-semibold text-zinc-500">변경 요약 카드</p>
          {data.events.length === 0 ? (
            <Card>
              <Empty icon={<GitCommitHorizontal className="size-8" />} title="아직 감지된 push가 없어요" desc="상단 버튼으로 요금 변경 커밋(9,900 → 12,900원)을 push해 보세요." />
            </Card>
          ) : (
            data.events.map((ev) => <PushCard key={ev.id} ev={ev} />)
          )}
          <RecentCommits commits={data.system.commits} />
        </div>

        {/* 재검토 큐 */}
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
            {tab === "pending" && pending.length > 0 && (
              <>
                <label className="ml-2 flex items-center gap-1.5 text-[12.5px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map((r) => r.id)))}
                    className="size-3.5 accent-zinc-900"
                  />
                  전체 선택
                </label>
                <Button size="sm" className="ml-auto" disabled={selected.size === 0} loading={bulkBusy} onClick={bulkApprove}>
                  <CheckCheck className="size-3.5" /> AI 수정안 일괄 승인 ({selected.size})
                </Button>
              </>
            )}
          </div>
          {list.length === 0 ? (
            <Empty icon={<CheckCheck className="size-8" />} title={tab === "pending" ? "재검토할 항목이 없어요" : "처리한 항목이 없어요"} />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {list.map((r) => (
                <ReviewRow
                  key={r.id}
                  r={r}
                  selected={selected.has(r.id)}
                  onSelect={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v) n.add(r.id);
                      else n.delete(r.id);
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

function PushCard({ ev }: { ev: PushEvent }) {
  return (
    <Card className="animate-fade-up overflow-hidden">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <GitCommitHorizontal className="size-3.5" />
          <span className="font-mono text-violet-700">{ev.commit.sha}</span>
          <span>→ {ev.branch}</span>
          <span className="ml-auto">{timeAgo(ev.createdAt)}</span>
        </div>
        <p className="mt-1 text-[13.5px] font-medium text-zinc-900">{ev.commit.message}</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="rounded-lg bg-indigo-50/70 px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-indigo-600">AI diff 요약</p>
          <p className="mt-0.5 text-[14px] font-semibold text-indigo-950">{ev.summary}</p>
        </div>
        <ul className="space-y-1">
          {ev.changes.map((c) => (
            <li key={c.filePath} className={cn("flex items-center gap-2 text-[12.5px]", c.excluded && "text-zinc-400")}>
              {c.excluded ? <EyeOff className="size-3.5 shrink-0" /> : <FileCode2 className="size-3.5 shrink-0 text-zinc-500" />}
              <span className={cn("font-mono", c.excluded ? "line-through" : "text-zinc-900")}>{c.filePath}</span>
              <span className="truncate">{c.excluded ? c.excludeReason : c.summary}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          <span className="font-semibold">
            답변 {ev.affectedAnswerIds.length}개 · 문서 {ev.affectedDocIds.length}개 낡았을 수 있음
          </span>
          <span className="text-amber-700">→ 검색 제외 + 재검토 큐</span>
        </div>
      </div>
    </Card>
  );
}

function RecentCommits({ commits }: { commits: PushEvent["commit"][] }) {
  return (
    <Card>
      <CardHeader title="최근 커밋" desc="레벨 1 이상에서 커밋 메시지·변경 파일 조회" />
      <ul className="divide-y divide-zinc-50 px-2 py-1">
        {commits.slice(0, 6).map((c) => (
          <li key={c.sha} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
            <span className="font-mono text-violet-700">{c.sha}</span>
            <span className="min-w-0 flex-1 truncate text-zinc-700">{c.message}</span>
            <span className="shrink-0 text-[11px] text-zinc-400">{formatDateTime(c.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReviewRow({ r, selected, onSelect, onDone }: { r: ReviewView; selected: boolean; onSelect: (v: boolean) => void; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.suggestion);
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const pending = r.status === "pending";
  const changed = r.current !== r.suggestion;
  const { current, suggestion } = r;
  const diff = useMemo(() => diffWords(current, suggestion), [current, suggestion]);

  async function act(action: "approve" | "dismiss") {
    setBusy(action);
    try {
      await adminApi.resolveReview(r.id, action, action === "approve" ? (editing ? text : r.suggestion) : undefined);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        {pending && (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} className="mt-1 size-3.5 accent-zinc-900" aria-label="선택" />
        )}
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", r.targetType === "document" ? "bg-sky-50 text-sky-600" : "bg-zinc-100 text-zinc-500")}>
          {r.targetType === "document" ? <BookText className="size-3.5" /> : <MessageSquareText className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13.5px] font-medium text-zinc-900">{r.title}</p>
            <Badge>{SOURCE_LABEL[r.source]}</Badge>
            {r.tier && r.tier !== "normal" && <Badge className="bg-amber-50 text-amber-700 ring-amber-600/15">{TIER_LABEL[r.tier]}</Badge>}
            {pending ? (
              <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
                <Ban className="size-3" /> 검색 제외 중
              </Badge>
            ) : (
              <Badge className={r.status === "resolved" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-zinc-100 text-zinc-500"}>
                {r.status === "resolved" ? "승인 · 검색 복귀" : "보관 · 검색 제외 유지"}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">{r.reason}</p>

          {pending && (
            <div className="mt-3">
              {editing ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={r.targetType === "document" ? 7 : 4}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-zinc-400"
                />
              ) : (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className={cn(
                    "block w-full whitespace-pre-line rounded-lg bg-zinc-50 px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-zinc-700",
                    !expanded && "line-clamp-3",
                  )}
                >
                  {changed ? (
                    diff.map((p, i) => (
                      <span
                        key={i}
                        className={cn(p.type === "add" && "rounded bg-emerald-100 text-emerald-900", p.type === "del" && "rounded bg-red-100 text-red-700 line-through")}
                      >
                        {p.text}
                      </span>
                    ))
                  ) : (
                    r.current
                  )}
                </button>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {changed && !editing && <span className="mr-auto text-[11.5px] text-zinc-500">AI 수정안: 사실 값만 최신 근거로 바꿨어요</span>}
                {!changed && !editing && <span className="mr-auto text-[11.5px] text-zinc-500">자동 수정안이 없어요. 직접 확인해 주세요</span>}
                {editing && <span className="mr-auto" />}
                <Button size="sm" variant="ghost" onClick={() => act("dismiss")} loading={busy === "dismiss"}>
                  <EyeOff className="size-3.5" /> 보관
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                  <PencilLine className="size-3.5" /> {editing ? "비교 보기" : "직접 수정"}
                </Button>
                <Button size="sm" onClick={() => act("approve")} loading={busy === "approve"}>
                  <Check className="size-3.5" /> {editing ? "수정본 승인" : "수정안 승인"}
                </Button>
              </div>
            </div>
          )}
          {!pending && r.targetType === "answer" && (
            <Link href="/best-answers" className="mt-1 inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900">
              답변 보기 <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
