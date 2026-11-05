"use client";

import { AlertCircle, Inbox as InboxIcon, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError, authErrorMessage } from "@moa/shared/auth";
import {
  BACKEND_CATEGORY_LABEL,
  BACKEND_STATUS_LABEL,
  BACKEND_URGENCY_LABEL,
  adminInquiryApi,
  type AdminListFilter,
  type BackendCategory,
  type BackendStatus,
  type BackendUrgency,
  type InquirySummary,
} from "@moa/shared/inquiry";
import { formatDateTime, timeAgo } from "@moa/shared/utils";
import { Badge, Button, Card, Empty, LoadingBlock, Select } from "@moa/ui";

const STATUS_TONE: Record<BackendStatus, string> = {
  received: "bg-sky-50 text-sky-700 ring-sky-600/15",
  in_review: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  needs_info: "bg-amber-50 text-amber-700 ring-amber-600/20",
  answered: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
};

export const URGENCY_TONE: Record<BackendUrgency, string> = {
  high: "bg-orange-50 text-orange-700 ring-orange-600/15",
  normal: "bg-zinc-100 text-zinc-700 ring-zinc-500/15",
  low: "bg-zinc-50 text-zinc-500 ring-zinc-400/15",
};

type All = "";
const POLL_MS = 5000;

/** 백엔드 실제 문의 목록 (GET /api/v1/admin/inquiries) */
export function LiveInbox() {
  const [filter, setFilter] = useState<AdminListFilter>({});
  const [items, setItems] = useState<InquirySummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const countRef = useRef(20);

  /** 처음부터 다시 조회 (필터 변경·주기 새로고침). 이미 더 불러온 만큼은 유지 */
  const reload = useCallback(async () => {
    try {
      const r = await adminInquiryApi.list(filter, null, Math.min(100, Math.max(20, countRef.current)));
      setItems(r.items);
      setCursor(r.next_cursor);
      setError(null);
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError({ msg: authErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });
    }
  }, [filter]);

  useEffect(() => {
    // 필터가 바뀌면 cursor를 비우고 처음부터
    countRef.current = 20;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(null);
    reload();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await adminInquiryApi.list(filter, cursor, 20);
      setItems((prev) => {
        const ids = new Set(prev?.map((i) => i.inquiry_id));
        const merged = [...(prev ?? []), ...r.items.filter((i) => !ids.has(i.inquiry_id))];
        countRef.current = merged.length;
        return merged;
      });
      setCursor(r.next_cursor);
    } catch (e) {
      setError({ msg: authErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });
    } finally {
      setLoadingMore(false);
    }
  }

  const set = <K extends keyof AdminListFilter>(k: K, v: AdminListFilter[K] | All) => setFilter((f) => ({ ...f, [k]: v || undefined }));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <Select<BackendStatus | All>
          aria-label="상태"
          value={filter.status ?? ""}
          onChange={(v) => set("status", v)}
          options={[{ value: "", label: "모든 상태" }, ...(Object.keys(BACKEND_STATUS_LABEL) as BackendStatus[]).map((s) => ({ value: s, label: BACKEND_STATUS_LABEL[s] }))]}
        />
        <Select<BackendCategory | All>
          aria-label="AI 분류"
          value={filter.category ?? ""}
          onChange={(v) => set("category", v)}
          options={[{ value: "", label: "모든 AI 분류" }, ...(Object.keys(BACKEND_CATEGORY_LABEL) as BackendCategory[]).map((c) => ({ value: c, label: BACKEND_CATEGORY_LABEL[c] }))]}
        />
        <Select<BackendUrgency | All>
          aria-label="긴급도"
          value={filter.urgency ?? ""}
          onChange={(v) => set("urgency", v)}
          options={[{ value: "", label: "모든 긴급도" }, ...(Object.keys(BACKEND_URGENCY_LABEL) as BackendUrgency[]).map((u) => ({ value: u, label: BACKEND_URGENCY_LABEL[u] }))]}
        />
        <span className="ml-auto flex items-center gap-2 text-[12px] text-zinc-400">
          {updatedAt && `${formatDateTime(updatedAt)} 기준 · 5초마다 새로고침`}
          <button onClick={reload} className="grid size-7 place-items-center rounded-md hover:bg-zinc-100 hover:text-zinc-700" aria-label="새로고침">
            <RefreshCw className="size-3.5" />
          </button>
        </span>
      </div>

      {(filter.category || filter.urgency) && (
        <p className="border-b border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[12px] text-zinc-500">
          AI 분류·긴급도 필터는 AI 분석이 끝난 문의에만 걸려요. 분석 전 문의는 빠집니다.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
          <AlertCircle className="size-4" /> {error.msg}
          {error.rid && <span className="font-mono text-[10.5px] text-red-400">{error.rid}</span>}
        </div>
      )}

      {items === null ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Empty icon={<InboxIcon className="size-8" />} title="문의가 없어요" desc="싱크노트 고객센터 채팅으로 들어온 문의가 여기에 표시돼요." />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((i) => (
            <li key={i.inquiry_id}>
              <Link
                href={`/inquiries/${i.inquiry_id}`}
                className="grid grid-cols-[72px_1fr] items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-50 md:grid-cols-[72px_1fr_210px_120px_80px]"
              >
                {i.urgency ? (
                  <Badge className={URGENCY_TONE[i.urgency]}>{BACKEND_URGENCY_LABEL[i.urgency]}</Badge>
                ) : (
                  <Badge className="bg-white text-zinc-400 ring-zinc-200">분석 전</Badge>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-zinc-400">#{i.inquiry_id}</span>
                    <span className="truncate text-[14px] font-medium text-zinc-900">{i.title}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-zinc-500">{formatDateTime(i.created_at)}</p>
                </div>
                <div className="col-span-2 flex items-center gap-1.5 text-[12.5px] md:col-span-1">
                  {i.category ? (
                    <span className="flex items-center gap-1 text-zinc-800">
                      <Sparkles className="size-3 text-indigo-500" />
                      {BACKEND_CATEGORY_LABEL[i.category]}
                    </span>
                  ) : (
                    <span className="text-zinc-400">AI 분류 전</span>
                  )}
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-500">고객 선택 {BACKEND_CATEGORY_LABEL[i.customer_category]}</span>
                </div>
                <div className="hidden md:block">
                  <Badge className={STATUS_TONE[i.status]}>{BACKEND_STATUS_LABEL[i.status]}</Badge>
                </div>
                <span className="hidden text-right text-[12px] text-zinc-400 md:block">{timeAgo(i.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items && cursor && (
        <div className="border-t border-zinc-100 px-4 py-3 text-center">
          <Button variant="outline" size="sm" onClick={more} loading={loadingMore}>
            더 보기
          </Button>
        </div>
      )}
    </Card>
  );
}

export { STATUS_TONE as LIVE_STATUS_TONE };
