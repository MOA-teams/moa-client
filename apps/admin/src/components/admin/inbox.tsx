"use client";

import "@/lib/browser-mock"; // 데모 데이터는 브라우저 안에서 처리

import { AlertCircle, Clock, Inbox as InboxIcon, Paperclip, Siren, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { adminApi } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { LiveInbox } from "./live-inbox";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  URGENCIES,
  URGENCY_LABEL,
  URGENCY_RANK,
  URGENCY_TONE,
} from "@moa/shared/labels";
import type { Category, Inquiry, InquiryStatus, Urgency } from "@moa/shared/types";
import { cn, timeAgo } from "@moa/shared/utils";
import { Badge, Card, Empty, LoadingBlock, PageHeader, Select } from "@moa/ui";

type All = "all";

export function InboxView() {
  const [tab, setTab] = useState<"live" | "demo">("live");
  return (
    <>
      <PageHeader title="문의 인박스" desc="AI가 분류·초안까지 준비하고, 발송은 담당자가 승인합니다." />
      <div className="mb-5 flex w-fit gap-1 rounded-lg bg-zinc-200/50 p-1 text-[13px]">
        {(
          [
            ["live", "실제 문의"],
            ["demo", "데모 시나리오"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("rounded-md px-3.5 py-1.5 transition", tab === k ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "live" ? <LiveInbox /> : <MockInbox />}
    </>
  );
}

/** 데모 시나리오(mock) — 그룹·급증·push 재검토 장면용 */
function MockInbox() {
  const { data } = usePolling(async () => {
    const [inquiries, groups] = await Promise.all([adminApi.inquiries(), adminApi.groups()]);
    return { inquiries, groups };
  }, 3000);
  const [cat, setCat] = useState<Category | All>("all");
  const [urg, setUrg] = useState<Urgency | All>("all");
  const [status, setStatus] = useState<InquiryStatus | "open" | All>("open");
  const [group, setGroup] = useState<string>("all");

  const list = useMemo(() => {
    if (!data) return [];
    return data.inquiries
      .filter((i) => cat === "all" || i.category === cat)
      .filter((i) => urg === "all" || i.urgency === urg)
      .filter((i) => (status === "all" ? true : status === "open" ? i.status !== "closed" : i.status === status))
      .filter((i) => group === "all" || i.groupId === group)
      .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.createdAt.localeCompare(a.createdAt));
  }, [data, cat, urg, status, group]);

  const stats = useMemo(() => {
    const inqs = data?.inquiries ?? [];
    const open = inqs.filter((i) => i.status !== "closed");
    return [
      { label: "처리 대기", value: open.filter((i) => i.status === "received" || i.status === "in_review").length, icon: InboxIcon, tone: "text-zinc-900" },
      { label: "긴급", value: open.filter((i) => i.urgency === "critical").length, icon: Siren, tone: "text-red-600" },
      { label: "추가 정보 필요", value: open.filter((i) => i.status === "need_info").length, icon: Clock, tone: "text-amber-600" },
      { label: "직접 확인 필요", value: open.filter((i) => i.status !== "answered" && i.draft?.needsManualCheck).length, icon: AlertCircle, tone: "text-orange-600" },
    ];
  }, [data]);

  if (!data) return <LoadingBlock />;

  const groupName = (id?: string) => data.groups.find((g) => g.id === id);

  return (
    <>
      <p className="mb-4 text-[12.5px] text-zinc-500">합성 데이터로 데모 장면(분류·초안·그룹·push 재검토)을 보여주는 화면이에요. 긴급도순으로 정렬돼요.</p>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3.5">
            <div className="flex items-center justify-between text-[12.5px] text-zinc-500">
              {s.label}
              <s.icon className={cn("size-4", s.tone)} />
            </div>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.tone)}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <Select aria-label="상태" value={status} onChange={setStatus} options={[{ value: "open", label: "진행 중 전체" }, { value: "all", label: "모든 상태" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
          <Select aria-label="유형" value={cat} onChange={setCat} options={[{ value: "all", label: "모든 유형" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
          <Select aria-label="긴급도" value={urg} onChange={setUrg} options={[{ value: "all", label: "모든 긴급도" }, ...URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))]} />
          <Select
            aria-label="그룹"
            value={group}
            onChange={setGroup}
            options={[{ value: "all", label: "모든 그룹" }, ...data.groups.map((g) => ({ value: g.id, label: `${g.title} (${g.inquiryIds.length})` }))]}
          />
          <span className="ml-auto text-[12.5px] text-zinc-500">{list.length}건</span>
        </div>

        {list.length === 0 ? (
          <Empty icon={<InboxIcon className="size-8" />} title="조건에 맞는 문의가 없어요" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.map((i) => (
              <Row key={i.id} i={i} group={groupName(i.groupId)} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Row({ i, group }: { i: Inquiry; group?: { title: string; spike: boolean } }) {
  const first = i.messages.find((m) => m.role === "customer");
  const hasAtt = i.messages.some((m) => m.attachments?.length);
  const mismatch = i.customerCategory && i.customerCategory !== i.aiCategory;
  return (
    <li>
      <Link href={`/inquiries/${i.id}`} className="grid grid-cols-[72px_1fr] items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-50 md:grid-cols-[72px_1fr_200px_120px_80px]">
        <Badge className={URGENCY_TONE[i.urgency]}>{URGENCY_LABEL[i.urgency]}</Badge>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11.5px] text-zinc-400">{i.id}</span>
            <span className="truncate text-[14px] font-medium text-zinc-900">{first?.text || "(첨부만 보냄)"}</span>
            {hasAtt && <Paperclip className="size-3.5 shrink-0 text-zinc-400" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
            <span>{i.customerName}</span>
            {i.environment.errorCode && <Badge className="bg-red-50 font-mono text-red-700 ring-red-600/10">{i.environment.errorCode}</Badge>}
            {group && (
              <Badge className={group.spike ? "bg-red-50 text-red-700 ring-red-600/15" : "bg-zinc-50 text-zinc-600 ring-zinc-400/20"}>
                {group.spike && <Siren className="size-3" />}
                {group.title}
              </Badge>
            )}
            {i.draft?.needsManualCheck && i.status !== "answered" && i.status !== "closed" && (
              <Badge className="bg-orange-50 text-orange-700 ring-orange-600/15">
                <AlertCircle className="size-3" /> 직접 확인 필요
              </Badge>
            )}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-[12.5px] md:col-span-1">
          <span className="flex items-center gap-1 text-zinc-800">
            <Sparkles className="size-3 text-indigo-500" />
            {CATEGORY_LABEL[i.category]}
          </span>
          {mismatch && <span className="text-zinc-400 line-through decoration-zinc-300">{CATEGORY_LABEL[i.customerCategory!]}</span>}
        </div>
        <div className="hidden md:block">
          <Badge className={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
        </div>
        <span className="hidden text-right text-[12px] text-zinc-400 md:block">{timeAgo(i.createdAt)}</span>
      </Link>
    </li>
  );
}
