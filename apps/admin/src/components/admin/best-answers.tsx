"use client";

import { AlertTriangle, BookText, Check, Code2, Star, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError, adminApi } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { TIER_LABEL } from "@moa/shared/labels";
import type { Answer, AnswerTier } from "@moa/shared/types";
import { cn, pct, timeAgo } from "@moa/shared/utils";
import { Badge, Button, Card, Empty, LoadingBlock, PageHeader, Stars } from "@moa/ui";

const TABS: Array<{ key: AnswerTier | "all"; label: string }> = [
  { key: "candidate", label: "후보" },
  { key: "best", label: "우수 답변" },
  { key: "quality_check", label: "품질 점검" },
  { key: "all", label: "전체 답변" },
];

const TIER_TONE: Record<AnswerTier, string> = {
  best: "bg-amber-50 text-amber-700 ring-amber-600/20",
  candidate: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  normal: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
  quality_check: "bg-red-50 text-red-700 ring-red-600/15",
};

export function BestAnswersView() {
  const { data, refresh } = usePolling(async () => {
    const [answers, settings] = await Promise.all([adminApi.answers(), adminApi.settings()]);
    return { answers, settings };
  }, 4000);
  const [tab, setTab] = useState<AnswerTier | "all">("candidate");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.answers.length ?? 0 };
    for (const a of data?.answers ?? []) c[a.tier] = (c[a.tier] ?? 0) + 1;
    return c;
  }, [data]);

  if (!data) return <LoadingBlock />;
  const s = data.settings;
  const list = data.answers
    .filter((a) => tab === "all" || a.tier === tab)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rules = [
    { stars: s.bestAnswerAutoScore, text: "우수 답변 후보로 자동 등록 → 담당자 승인 시 우수 답변" },
    { stars: s.bestAnswerConditionalScore, text: `담당자 수정량이 초안 대비 ${pct(s.editRatioLimit)} 미만이면 후보, 아니면 일반 답변` },
    { stars: 3, text: "일반 답변으로 저장, 후보 아님" },
    { stars: 2, text: "이하: 후보 제외 + 품질 점검. 같은 근거를 쓴 우수 답변은 재검토 큐로" },
  ];

  return (
    <>
      <PageHeader title="우수 답변" desc="고객 별점이 1차 기준이고, 최종 등록은 항상 담당자가 승인해요. 우수 답변은 사실 근거가 아니라 형식 참고용입니다." />

      <Card className="mb-5 px-5 py-4">
        <div className="grid gap-2.5 md:grid-cols-2">
          {rules.map((r) => (
            <div key={r.stars} className="flex items-center gap-3 text-[13px]">
              <span className="w-[74px] shrink-0">
                <Stars score={r.stars} />
              </span>
              <span className="text-zinc-600">{r.text}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-zinc-100 pt-3 text-[12px] text-zinc-500">
          미평가는 후보에서 제외 · 근거가 바뀌면 별점과 무관하게 재검토 대상 · 기준은{" "}
          <Link href="/settings" className="underline underline-offset-2">
            설정
          </Link>
          에서 조정
        </p>
      </Card>

      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-200/50 p-1 text-[13px] sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn("flex-1 rounded-md px-3 py-1.5 transition sm:flex-none", tab === t.key ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
          >
            {t.label} <span className="tabular-nums text-zinc-400">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon={<Star className="size-8" />} title="해당하는 답변이 없어요" desc={tab === "candidate" ? "상담 종료 후 ★5를 받은 답변이 여기에 올라와요." : undefined} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((a) => (
            <AnswerCard key={a.id} a={a} onChange={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

function AnswerCard({ a, onChange }: { a: Answer; onChange: () => void }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setErr(null);
    try {
      await adminApi.decideCandidate(a.id, action);
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={cn("flex flex-col", a.tier === "candidate" && "border-indigo-200")}>
      <div className="flex items-start gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[12px] text-zinc-400">{a.id}</span>
            <Badge className={TIER_TONE[a.tier]}>{TIER_LABEL[a.tier]}</Badge>
            {a.imported && <Badge className="bg-zinc-100 text-zinc-600">CSV import · 별점 없음 · 승인 필요</Badge>}
            {a.isStale && (
              <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
                <AlertTriangle className="size-3" /> 재검토 중 · 사실 근거 제외
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[14px] font-medium text-zinc-900">{a.question}</p>
        </div>
        <div className="text-right">
          <Stars score={a.rating} />
          <p className="mt-0.5 text-[11px] text-zinc-400">수정량 {pct(a.editRatio)}</p>
        </div>
      </div>
      <p className="mx-5 mt-3 line-clamp-4 whitespace-pre-line rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-700">{a.text}</p>
      {a.staleReason && <p className="mx-5 mt-2 text-[12px] text-amber-700">{a.staleReason}</p>}

      <div className="mt-auto px-5 pb-4 pt-3">
        <p className="mb-1.5 text-[11px] text-zinc-500">근거 목록</p>
        <div className="flex flex-wrap gap-1.5">
          {a.evidence.length === 0 && <span className="text-[12px] text-zinc-400">없음</span>}
          {a.evidence.map((e, i) =>
            e.docId ? (
              <Badge key={i} className="bg-white text-zinc-700 ring-zinc-300/70">
                <BookText className="size-3" /> {e.docId} v{e.docVersion}
              </Badge>
            ) : (
              <Badge key={i} className="bg-violet-50 font-mono text-violet-700 ring-violet-600/15">
                <Code2 className="size-3" /> {e.filePath}
                {e.commitSha && `@${e.commitSha}`}
              </Badge>
            ),
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="mr-auto text-[11.5px] text-zinc-400">
            {a.inquiryId && (
              <Link href={`/inquiries/${a.inquiryId}`} className="hover:text-zinc-700">
                {a.inquiryId} ·{" "}
              </Link>
            )}
            {timeAgo(a.createdAt)}
          </span>
          {err && <span className="text-[12px] text-red-600">{err}</span>}
          {a.tier === "candidate" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => decide("reject")} loading={busy === "reject"}>
                <X className="size-3.5" /> 일반 답변으로
              </Button>
              <Button size="sm" onClick={() => decide("approve")} loading={busy === "approve"}>
                <Check className="size-3.5" /> 승인 · 등록
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
