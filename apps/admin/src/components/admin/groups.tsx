"use client";

import { Bug, ExternalLink, GitCommitHorizontal, Play, Siren, Sparkles, Users } from "lucide-react";
import { GithubIcon as Github } from "@moa/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, adminApi, demoApi, type GroupView } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { CATEGORY_LABEL, STATUS_LABEL } from "@moa/shared/labels";
import type { Settings } from "@moa/shared/types";
import { cn, formatTime, pct } from "@moa/shared/utils";
import { Badge, Button, Card, Empty, LoadingBlock, Notice, PageHeader } from "@moa/ui";

export function GroupsView() {
  const focus = useSearchParams().get("focus");
  const { data, refresh } = usePolling(async () => {
    const [groups, settings] = await Promise.all([adminApi.groups(), adminApi.settings()]);
    return { groups, settings };
  }, 3000);
  const [running, setRunning] = useState<{ step: number; total: number } | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    if (!focus || !data) return;
    document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, data]);

  async function runSpike() {
    setDemoError(null);
    let total = 13;
    for (let step = 0; step < total; step++) {
      setRunning({ step: step + 1, total });
      try {
        const r = await demoApi.spike(step);
        total = r.total;
      } catch (e) {
        setDemoError(e instanceof Error ? e.message : "실패");
        break;
      }
      await refresh();
      await new Promise((r) => setTimeout(r, 650));
    }
    setRunning(null);
  }

  if (!data) return <LoadingBlock />;
  const bugGroups = data.groups.filter((g) => g.category === "bug");
  const otherGroups = data.groups.filter((g) => g.category !== "bug");

  return (
    <>
      <PageHeader
        title="문의 그룹"
        desc="임베딩 유사도 + 오류 코드·환경 비교로 같은 문의를 묶어요. 기능 오류 그룹이 기준을 넘으면 급증 알림과 GitHub 이슈를 만듭니다."
        action={
          <Button onClick={runSpike} loading={!!running} disabled={!!running}>
            <Play className="size-3.5" />
            {running ? `문의 유입 중 ${running.step}/${running.total}` : "데모: E-502 문의 몰아넣기"}
          </Button>
        }
      />
      {demoError && (
        <div className="mb-4">
          <Notice tone="warn" title="데모 시나리오를 이미 실행했어요">
            {demoError === "시나리오 끝" ? "사이드바의 '데모 데이터 초기화' 후 다시 실행하세요." : demoError}
          </Notice>
        </div>
      )}

      <p className="mb-2 text-[12.5px] font-semibold text-zinc-500">기능 오류</p>
      <div className="space-y-4">
        {bugGroups.length === 0 && (
          <Card>
            <Empty icon={<Bug className="size-8" />} title="기능 오류 그룹이 없어요" />
          </Card>
        )}
        {bugGroups.map((g) => (
          <GroupCard key={g.id} g={g} settings={data.settings} focused={focus === g.id} onChange={refresh} />
        ))}
      </div>

      {otherGroups.length > 0 && (
        <>
          <p className="mb-2 mt-8 text-[12.5px] font-semibold text-zinc-500">그 밖의 유사 문의</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {otherGroups.map((g) => (
              <Card key={g.id} id={g.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-zinc-900">{g.title}</p>
                  <span className="text-[13px] font-semibold tabular-nums text-zinc-700">{g.inquiryIds.length}건</span>
                </div>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  {CATEGORY_LABEL[g.category]} · 최근 {formatTime(g.lastAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.inquiries.slice(0, 4).map((i) => (
                    <Link key={i.id} href={`/inquiries/${i.id}`} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 hover:bg-zinc-200">
                      {i.id}
                    </Link>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function GroupCard({ g, settings, focused, onChange }: { g: GroupView; settings: Settings; focused: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const windowStart = now - settings.spikeWindowMinutes * 60_000;
  const recent = g.inquiries.filter((i) => new Date(i.createdAt).getTime() >= windowStart).length;
  const ratio = Math.min(1, recent / settings.spikeCount);

  async function createIssue() {
    setBusy(true);
    setErr(null);
    try {
      await adminApi.createIssue(g.id);
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={g.id} className={cn("scroll-mt-20 overflow-hidden", g.spike && "border-red-200 ring-1 ring-red-100", focused && "ring-2 ring-zinc-900/10")}>
      <div className={cn("flex flex-wrap items-start gap-4 px-5 py-4", g.spike && "bg-red-50/40")}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", g.spike ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-500")}>
          {g.spike ? <Siren className="size-5" /> : <Bug className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zinc-900">{g.title}</h3>
            {g.errorCode && <Badge className="bg-red-50 font-mono text-red-700 ring-red-600/15">{g.errorCode}</Badge>}
            {g.spike && <Badge className="bg-red-600 text-white ring-red-600">장애 의심 · 급증</Badge>}
          </div>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            {formatTime(g.firstAt)} ~ {formatTime(g.lastAt)} · 총 {g.inquiryIds.length}건
          </p>
        </div>
        <div className="w-48">
          <div className="flex justify-between text-[11.5px] text-zinc-500">
            <span>최근 {settings.spikeWindowMinutes}분</span>
            <span className={cn("font-semibold tabular-nums", g.spike ? "text-red-600" : "text-zinc-700")}>
              {recent} / {settings.spikeCount}건
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-zinc-200/70">
            <div className={cn("h-1.5 rounded-full transition-all duration-500", g.spike ? "bg-red-500" : "bg-zinc-700")} style={{ width: pct(ratio) }} />
          </div>
        </div>
      </div>

      <div className="grid border-t border-zinc-100 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="border-zinc-100 lg:border-r">
          <p className="flex items-center gap-1.5 px-5 pb-1 pt-3 text-[11.5px] text-zinc-500">
            <Users className="size-3.5" /> 묶인 문의
          </p>
          <ul className="scrollbar-thin max-h-72 overflow-y-auto px-2 pb-2">
            {g.inquiries
              .slice()
              .reverse()
              .map((i) => {
                const semantic = !new RegExp(g.errorCode ?? "^$", "i").test(i.text.replace("E502", "E-502")) && !i.errorCode;
                return (
                  <li key={i.id}>
                    <Link href={`/inquiries/${i.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-zinc-50">
                      <span className="font-mono text-[11px] text-zinc-400">{i.id}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800">{i.text}</span>
                      {semantic && (
                        <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/15">
                          <Sparkles className="size-3" /> 의미로 묶임
                        </Badge>
                      )}
                      <span className="hidden text-[11px] text-zinc-400 sm:inline">{i.os}</span>
                      <span className="text-[11px] tabular-nums text-zinc-400">{formatTime(i.createdAt)}</span>
                      <span className="sr-only">{STATUS_LABEL[i.status]}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>

        <div className="px-5 py-4">
          {g.issue ? (
            <IssueCard g={g} />
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <p className="text-[13px] text-zinc-600">
                아직 이슈가 없어요. 급증 시 {settings.autoCreateIssue ? "자동으로 만들어요" : "수동으로 만들 수 있어요"} (문의 요약 + 의심 코드 위치 후보 + 최근 관련 커밋).
              </p>
              {err && <p className="text-[12.5px] text-red-600">{err}</p>}
              <div>
                <Button variant="outline" size="sm" onClick={createIssue} loading={busy}>
                  <Github className="size-3.5" /> GitHub 이슈 만들기
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function IssueCard({ g }: { g: GroupView }) {
  const issue = g.issue!;
  return (
    <div className="animate-fade-up">
      <div className="flex items-start gap-2">
        <Github className="mt-0.5 size-4 text-zinc-700" />
        <div className="min-w-0 flex-1">
          <a href={issue.url} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-zinc-900 hover:underline">
            #{issue.number} {issue.title}
          </a>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            {issue.auto ? "급증 감지로 자동 생성" : "담당자가 생성"} · {formatTime(issue.createdAt)}
          </p>
        </div>
        <a href={issue.url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-700" aria-label="GitHub에서 열기">
          <ExternalLink className="size-4" />
        </a>
      </div>

      <p className="mb-1.5 mt-4 text-[11.5px] font-medium text-zinc-500">의심 코드 위치 후보 (확정 아님)</p>
      <ol className="space-y-1.5">
        {issue.candidates.map((c, i) => (
          <li key={c.filePath} className="flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2">
            <span className="text-[11px] font-semibold text-zinc-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12.5px] text-zinc-900">{c.filePath}</p>
              <p className="truncate text-[11.5px] text-zinc-500">{c.reason}</p>
            </div>
            <span className="text-[12px] font-semibold tabular-nums text-zinc-700">{pct(c.score)}</span>
          </li>
        ))}
      </ol>

      {issue.commits.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 text-[11.5px] font-medium text-zinc-500">최근 관련 커밋</p>
          <ul className="space-y-1">
            {issue.commits.map((c) => (
              <li key={c.sha} className="flex items-center gap-2 text-[12.5px]">
                <GitCommitHorizontal className="size-3.5 text-zinc-400" />
                <span className="font-mono text-violet-700">{c.sha}</span>
                <span className="truncate text-zinc-700">{c.message}</span>
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">@{c.author}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
