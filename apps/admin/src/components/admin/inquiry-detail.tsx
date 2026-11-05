"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  BookText,
  Bug,
  Check,
  Code2,
  ExternalLink,
  FileText,
  GitCommitHorizontal,
  History,
  Lock,
  MessageSquareText,
  Monitor,
  RefreshCw,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Star,
  Undo2,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, adminApi, type InquiryDetail } from "@moa/shared/api";
import { detectCodeExposure } from "@moa/shared/guard";
import { usePolling } from "@moa/shared/hooks";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DOC_STATUS_LABEL,
  SOURCE_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  URGENCIES,
  URGENCY_LABEL,
  URGENCY_TONE,
} from "@moa/shared/labels";
import type { Answer, Category, Message, Source, Urgency } from "@moa/shared/types";
import { cn, diffWords, formatBytes, formatDateTime, formatTime, pct } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, Notice, Select, Stars } from "@moa/ui";

export function InquiryDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, refresh, setData } = usePolling(() => adminApi.inquiry(id), 3000);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    adminApi.open(id).then(() => refresh());
  }, [id, refresh]);

  if (error && !data)
    return (
      <div className="py-20 text-center text-sm text-zinc-500">
        {error}
        <div className="mt-3">
          <Link href="/" className="text-zinc-900 underline">
            인박스로
          </Link>
        </div>
      </div>
    );
  if (!data) return <LoadingBlock />;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/60" aria-label="뒤로">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[13px] text-zinc-400">{data.id}</span>
        <h1 className="text-lg font-semibold text-zinc-900">{data.customerName}님의 문의</h1>
        <Badge className={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
        <Badge className={URGENCY_TONE[data.urgency]}>{URGENCY_LABEL[data.urgency]}</Badge>
        <span className="ml-auto text-[12.5px] text-zinc-400">접수 {formatDateTime(data.createdAt)}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Conversation inquiry={data} />
          <EnvironmentCard inquiry={data} />
          {data.group && <GroupCard inquiry={data} />}
        </div>
        <div className="space-y-5">
          <ClassificationCard inquiry={data} onChange={setData} />
          <DraftCard inquiry={data} onChange={refresh} />
          <RatingCard inquiry={data} />
        </div>
      </div>
    </>
  );
}

/* --------------------------------- 대화 --------------------------------- */

function Conversation({ inquiry }: { inquiry: InquiryDetail }) {
  return (
    <Card>
      <CardHeader title="대화" desc="대화 세션 1개 = 문의 1건 · 분류·그룹화는 세션 요약 기준" icon={<MessageSquareText className="size-4" />} />
      <div className="scrollbar-thin max-h-[520px] space-y-4 overflow-y-auto px-5 py-5">
        {inquiry.messages.map((m) => (
          <Bubble key={m.id} m={m} name={inquiry.customerName} />
        ))}
      </div>
    </Card>
  );
}

function Bubble({ m, name }: { m: Message; name: string }) {
  const isCustomer = m.role === "customer";
  const label =
    m.role === "customer"
      ? name
      : m.role === "agent"
        ? "담당자 (승인 발송)"
        : m.role === "ai"
          ? m.kind === "info_request"
            ? "AI 자동 발송 · 정보 수집 질문"
            : "AI 자동 발송 · 접수 안내"
          : "시스템";
  const Icon = m.role === "customer" ? User : m.role === "agent" ? Check : Bot;
  if (m.role === "system") {
    return (
      <div className="flex items-center gap-3 text-[12px] text-zinc-400">
        <div className="h-px flex-1 bg-zinc-200" />
        {m.kind === "rating_request" ? "상담 종료 · 별점 조사 발송" : m.text} · {formatTime(m.createdAt)}
        <div className="h-px flex-1 bg-zinc-200" />
      </div>
    );
  }
  return (
    <div className={cn("flex gap-2.5", !isCustomer && "flex-row-reverse")}>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full",
          isCustomer ? "bg-zinc-100 text-zinc-600" : m.role === "ai" ? "bg-indigo-50 text-indigo-600" : "bg-zinc-900 text-white",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className={cn("max-w-[82%]", !isCustomer && "items-end text-right")}>
        <p className="mb-1 text-[11.5px] text-zinc-500">
          {label} · {formatTime(m.createdAt)}
        </p>
        {m.text && (
          <div
            className={cn(
              "inline-block whitespace-pre-line rounded-xl px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed",
              isCustomer ? "bg-zinc-100 text-zinc-900" : m.role === "ai" ? "bg-indigo-50/70 text-indigo-950" : "bg-zinc-900 text-white",
            )}
          >
            {m.text}
          </div>
        )}
        {m.attachments?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-zinc-200 bg-white text-left">
                {a.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-28 w-40 object-cover" />
                ) : (
                  <div className="flex h-28 w-40 flex-col items-center justify-center gap-1 bg-zinc-50 text-zinc-500">
                    <FileText className="size-6 text-red-500" />
                    <span className="text-[11px]">PDF</span>
                  </div>
                )}
                <div className="border-t border-zinc-100 px-2 py-1.5">
                  <p className="truncate text-[11px] text-zinc-700">{a.name}</p>
                  <p className="text-[10.5px] text-zinc-400">
                    {formatBytes(a.size)}
                    {a.extractedErrorCode && <span className="ml-1 font-mono text-red-600">· {a.extractedErrorCode} 추출</span>}
                  </p>
                </div>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EnvironmentCard({ inquiry }: { inquiry: InquiryDetail }) {
  const env = inquiry.environment;
  const extracted = inquiry.messages.flatMap((m) => m.attachments ?? []).find((a) => a.extractedErrorCode);
  const rows = [
    { k: "OS", v: env.os },
    { k: "브라우저 · 앱 버전", v: env.browser ?? env.appVersion },
    { k: "오류 코드", v: env.errorCode, mono: true },
  ];
  return (
    <Card>
      <CardHeader title="발생 환경" desc="웹은 자동 수집" icon={<Monitor className="size-4" />} />
      <dl className="grid grid-cols-3 divide-x divide-zinc-100">
        {rows.map((r) => (
          <div key={r.k} className="px-5 py-3.5">
            <dt className="text-[11.5px] text-zinc-500">{r.k}</dt>
            <dd className={cn("mt-1 text-[13.5px] font-medium text-zinc-900", r.mono && "font-mono", r.mono && r.v && "text-red-600")}>{r.v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {extracted && (
        <div className="border-t border-zinc-100 px-5 py-3 text-[12px] text-zinc-500">
          <Sparkles className="mr-1 inline size-3.5 text-indigo-500" />
          스크린샷 <span className="text-zinc-800">{extracted.name}</span>에서 오류 코드{" "}
          <span className="font-mono font-semibold text-red-600">{extracted.extractedErrorCode}</span>를 추출해 자동 입력했어요.
        </div>
      )}
    </Card>
  );
}

function GroupCard({ inquiry }: { inquiry: InquiryDetail }) {
  const g = inquiry.group!;
  return (
    <Card className={g.spike ? "border-red-200" : undefined}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {g.title}
            {g.spike && (
              <Badge className="bg-red-50 text-red-700 ring-red-600/20">
                <Siren className="size-3" /> 급증
              </Badge>
            )}
          </span>
        }
        desc={`유사 문의 ${g.inquiryIds.length}건 · 마지막 ${formatTime(g.lastAt)}`}
        icon={<Bug className="size-4" />}
        action={
          <Link href={`/groups?focus=${g.id}`} className="text-[12.5px] font-medium text-zinc-600 hover:text-zinc-900">
            그룹 보기 →
          </Link>
        }
      />
      {g.issue && (
        <a href={g.issue.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-3 text-[13px] text-violet-700 hover:bg-violet-50/50">
          <GitCommitHorizontal className="size-4" />
          GitHub 이슈 #{g.issue.number} · {g.issue.title}
          <ExternalLink className="ml-auto size-3.5" />
        </a>
      )}
    </Card>
  );
}

/* --------------------------------- 분류 --------------------------------- */

function ClassificationCard({ inquiry, onChange }: { inquiry: InquiryDetail; onChange: (d: InquiryDetail) => void }) {
  const [busy, setBusy] = useState(false);
  async function update(patch: { category?: Category; urgency?: Urgency }) {
    setBusy(true);
    try {
      const r = await adminApi.classify(inquiry.id, patch);
      onChange({ ...inquiry, ...r });
    } finally {
      setBusy(false);
    }
  }
  const mismatch = inquiry.customerCategory && inquiry.customerCategory !== inquiry.aiCategory;
  return (
    <Card>
      <CardHeader title="분류" desc="고객이 고른 카테고리는 힌트로만 사용해요" icon={<Sparkles className="size-4" />} />
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[11.5px] text-zinc-500">고객 선택</p>
          <p className={cn("mt-1.5 text-[13.5px] font-medium", mismatch ? "text-zinc-400 line-through" : "text-zinc-900")}>
            {inquiry.customerCategory ? CATEGORY_LABEL[inquiry.customerCategory] : "선택 안 함"}
          </p>
        </div>
        <div>
          <p className="text-[11.5px] text-zinc-500">
            유형 <span className="text-indigo-500">(AI: {CATEGORY_LABEL[inquiry.aiCategory]})</span>
          </p>
          <Select
            aria-label="유형"
            className="mt-1 w-full"
            value={inquiry.category}
            onChange={(v) => update({ category: v })}
            options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          />
        </div>
        <div>
          <p className="text-[11.5px] text-zinc-500">긴급도</p>
          <Select
            aria-label="긴급도"
            className="mt-1 w-full"
            value={inquiry.urgency}
            onChange={(v) => update({ urgency: v })}
            options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))}
          />
        </div>
      </div>
      {inquiry.classificationHistory.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-3">
          <p className="mb-1.5 flex items-center gap-1 text-[11.5px] text-zinc-500">
            <History className="size-3.5" /> 변경 이력 {busy && "· 저장 중…"}
          </p>
          <ul className="space-y-1 text-[12.5px] text-zinc-600">
            {inquiry.classificationHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <span className="text-zinc-400">{formatTime(h.at)}</span> · {h.by} · {h.field === "category" ? "유형" : "긴급도"}{" "}
                  {h.field === "category" ? CATEGORY_LABEL[h.from as Category] : URGENCY_LABEL[h.from as Urgency]} →{" "}
                  <b className="font-medium text-zinc-900">
                    {h.field === "category" ? CATEGORY_LABEL[h.to as Category] : URGENCY_LABEL[h.to as Urgency]}
                  </b>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------- 초안 --------------------------------- */

function DraftCard({ inquiry, onChange }: { inquiry: InquiryDetail; onChange: () => Promise<unknown> }) {
  const draft = inquiry.draft;
  const [text, setText] = useState(draft?.text ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"regen" | "send" | "close" | null>(null);
  const [error, setError] = useState<{ msg: string; exposure?: string[] } | null>(null);
  const [newDraftReady, setNewDraftReady] = useState(false);
  const genRef = useRef(draft?.generatedAt);

  useEffect(() => {
    if (!draft) return;
    if (draft.generatedAt !== genRef.current) {
      genRef.current = draft.generatedAt;
      if (dirty) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNewDraftReady(true);
      } else setText(draft.text);
    }
  }, [draft, dirty]);

  const exposure = useMemo(() => detectCodeExposure(text), [text]);
  const placeholder = /\[가격 확인 필요\]/.test(text);
  const answered = inquiry.status === "answered";
  const closed = inquiry.status === "closed";

  async function regenerate() {
    setBusy("regen");
    setError(null);
    try {
      await adminApi.regenerate(inquiry.id);
      setDirty(false);
      genRef.current = undefined;
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      await adminApi.send(inquiry.id, text);
      setDirty(false);
      await onChange();
    } catch (e) {
      if (e instanceof ApiError) setError({ msg: e.message, exposure: (e.data as { exposure?: string[] })?.exposure });
      else setError({ msg: "발송하지 못했어요" });
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("close");
    try {
      await adminApi.close(inquiry.id);
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  const sourcesByRole = {
    fact: draft?.sources.filter((s) => s.role === "fact") ?? [],
    format: draft?.sources.filter((s) => s.role === "format") ?? [],
    internal: draft?.sources.filter((s) => s.role === "internal") ?? [],
  };

  return (
    <Card>
      <CardHeader
        title="답변 초안"
        desc={
          draft ? (
            <>
              {draft.mode === "naive" ? (
                <span className="font-medium text-amber-700">일반 RAG 모드로 생성</span>
              ) : (
                "사실은 최신 문서·코드에서, 답하는 방식은 우수 답변에서"
              )}{" "}
              · {formatTime(draft.generatedAt)}
            </>
          ) : undefined
        }
        icon={<Sparkles className="size-4" />}
        action={
          !closed && (
            <Button variant="outline" size="sm" onClick={regenerate} loading={busy === "regen"}>
              <RefreshCw className="size-3.5" /> 다시 생성
            </Button>
          )
        }
      />
      <div className="space-y-3 px-5 py-4">
        {draft && draft.conflicts.length > 0 && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />} title="근거 충돌 — 직접 확인 필요">
            <ul className="list-disc space-y-0.5 pl-4">
              {draft.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Link href="/changes" className="mt-1 inline-block font-medium underline underline-offset-2">
              재검토 큐에서 문서 갱신하기 →
            </Link>
          </Notice>
        )}
        {draft && draft.manualCheckReasons.length > 0 && (
          <Notice tone="warn" icon={<AlertCircle className="size-4" />} title="직접 확인 필요">
            <ul className="list-disc space-y-0.5 pl-4">
              {draft.manualCheckReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Notice>
        )}
        {newDraftReady && (
          <Notice tone="info" title="새 초안이 생성됐어요">
            근거가 바뀌어 초안이 다시 만들어졌어요.{" "}
            <button
              className="font-medium underline underline-offset-2"
              onClick={() => {
                setText(draft?.text ?? "");
                setDirty(false);
                setNewDraftReady(false);
              }}
            >
              새 초안 적용
            </button>
          </Notice>
        )}

        {answered || closed ? (
          <>
            <div className="rounded-lg bg-emerald-50/70 px-4 py-3 text-[13px] text-emerald-900">
              <Check className="mr-1 inline size-4 text-emerald-600" />
              답변을 발송했어요.{" "}
              {answered && "고객 확인 후 상담을 종료하면 별점 조사가 자동으로 발송돼요."}
              {closed && "상담이 종료되었어요."}
            </div>
            {inquiry.sentAnswer && <SentAnswer answer={inquiry.sentAnswer} />}
          </>
        ) : (
          <>
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDirty(true);
                }}
                onBlur={() => dirty && adminApi.saveDraft(inquiry.id, text).catch(() => {})}
                rows={8}
                placeholder={draft?.needsManualCheck ? "근거가 부족해 초안을 만들지 않았어요. 직접 확인 후 작성해 주세요." : "답변을 작성하세요"}
                className={cn(
                  "w-full resize-y rounded-lg border bg-white px-3.5 py-3 text-[14px] leading-relaxed text-zinc-900 outline-none transition focus:ring-4",
                  exposure.length ? "border-red-300 focus:ring-red-100" : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-100",
                )}
              />
              {dirty && draft && (
                <button
                  onClick={() => {
                    setText(draft.originalText);
                    setDirty(false);
                  }}
                  className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11.5px] text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-900"
                >
                  <Undo2 className="size-3" /> 원래 초안
                </button>
              )}
            </div>

            {exposure.length > 0 && (
              <Notice tone="danger" icon={<ShieldAlert className="size-4" />} title="발송 차단: 고객 답변에 코드·파일 경로가 포함됨 (S-04)">
                코드는 담당자 확인용 근거로만 쓸 수 있어요. 다음 내용을 지워주세요:{" "}
                {exposure.map((x) => (
                  <code key={x} className="mx-0.5 rounded bg-red-100 px-1 font-mono text-[12px]">
                    {x}
                  </code>
                ))}
              </Notice>
            )}
            {placeholder && (
              <p className="text-[12.5px] text-amber-700">
                <AlertTriangle className="mr-1 inline size-3.5" />
                [가격 확인 필요] 표시를 확인한 값으로 바꿔야 발송할 수 있어요.
              </p>
            )}
            {error && !error.exposure && <p className="text-[12.5px] text-red-600">{error.msg}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p className="mr-auto text-[12px] text-zinc-500">
                <Lock className="mr-1 inline size-3" />
                사실이 들어간 답변은 담당자 승인 후에만 발송돼요
              </p>
              <Button onClick={send} loading={busy === "send"} disabled={!text.trim() || exposure.length > 0 || placeholder}>
                <Send className="size-3.5" /> 승인·발송
              </Button>
            </div>
          </>
        )}

        {!closed && (
          <div className="flex justify-end border-t border-zinc-100 pt-3">
            <Button variant={answered ? "primary" : "ghost"} size="sm" onClick={close} loading={busy === "close"}>
              <XCircle className="size-3.5" /> 상담 종료 · 별점 조사 발송
            </Button>
          </div>
        )}
      </div>

      {/* 출처 */}
      {draft && draft.sources.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <p className="mb-3 text-[12.5px] font-semibold text-zinc-700">출처 · 근거 ({draft.sources.length})</p>
          <div className="space-y-4">
            {sourcesByRole.fact.length > 0 && <SourceGroup title="사실 근거" items={sourcesByRole.fact} threshold />}
            {sourcesByRole.format.length > 0 && <SourceGroup title="형식 참고 (톤·설명 순서만)" items={sourcesByRole.format} />}
            {sourcesByRole.internal.length > 0 && (
              <SourceGroup title="담당자 확인용 — 고객 답변에 쓰지 마세요" items={sourcesByRole.internal} internal />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function SourceGroup({ title, items, internal, threshold }: { title: string; items: Source[]; internal?: boolean; threshold?: boolean }) {
  return (
    <div>
      <p className={cn("mb-1.5 flex items-center gap-1 text-[11.5px]", internal ? "text-violet-700" : "text-zinc-500")}>
        {internal && <Lock className="size-3" />}
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((s) => (
          <SourceItem key={s.id} s={s} showThreshold={threshold} />
        ))}
      </ul>
    </div>
  );
}

const SOURCE_ICON = { document: BookText, best_answer: Star, code: Code2, commit: GitCommitHorizontal };

function SourceItem({ s, showThreshold }: { s: Source; showThreshold?: boolean }) {
  const Icon = SOURCE_ICON[s.type];
  const low = showThreshold && s.similarity < 0.75;
  return (
    <li className={cn("rounded-lg border px-3.5 py-3", s.stale ? "border-amber-200 bg-amber-50/40" : "border-zinc-200")}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", s.type === "code" || s.type === "commit" ? "text-violet-500" : "text-zinc-400")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("text-[13px] font-medium text-zinc-900", (s.type === "code" || s.type === "commit") && "font-mono text-[12.5px]")}>
              {s.title}
            </span>
            <Badge>{SOURCE_TYPE_LABEL[s.type]}</Badge>
            {s.docVersion && <Badge className="bg-white text-zinc-600 ring-zinc-300/60">v{s.docVersion}</Badge>}
            {s.docStatus && s.docStatus !== "valid" && (
              <Badge className="bg-amber-100 text-amber-800 ring-amber-600/20">{DOC_STATUS_LABEL[s.docStatus]} · 검색 제외</Badge>
            )}
            {s.stale && s.type === "best_answer" && <Badge className="bg-amber-100 text-amber-800 ring-amber-600/20">재검토 중 · 사실 근거 제외</Badge>}
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-700" aria-label="열기">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          <p
            className={cn(
              "mt-1.5 line-clamp-3 whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-600",
              (s.type === "code" || s.type === "commit") && "rounded bg-zinc-50 px-2 py-1.5 font-mono text-[11.5px]",
            )}
          >
            {s.excerpt}
          </p>
        </div>
        <div className="w-16 shrink-0 text-right">
          <p className={cn("text-[12px] font-semibold tabular-nums", low ? "text-orange-600" : "text-zinc-700")}>{pct(s.similarity)}</p>
          <div className="mt-1 h-1 rounded-full bg-zinc-100">
            <div className={cn("h-1 rounded-full", low ? "bg-orange-400" : "bg-zinc-800")} style={{ width: pct(s.similarity) }} />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400">유사도</p>
        </div>
      </div>
    </li>
  );
}

/* --------------------------------- 별점 --------------------------------- */

function RatingCard({ inquiry }: { inquiry: InquiryDetail }) {
  if (inquiry.status !== "closed") return null;
  const r = inquiry.rating;
  return (
    <Card>
      <CardHeader title="고객 만족도" desc="별점은 답변·근거 목록과 함께 저장돼 우수 답변 선정에 쓰여요" icon={<Star className="size-4" />} />
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        {r?.score ? (
          <div>
            <Stars score={r.score} size="md" />
            {r.comment && <p className="mt-1 text-[13px] text-zinc-600">&ldquo;{r.comment}&rdquo;</p>}
          </div>
        ) : (
          <p className="text-[13px] text-zinc-500">별점 대기 중 · 미응답 시 24시간 후 1회만 재요청하고, 그래도 없으면 &lsquo;미평가&rsquo;로 저장해요</p>
        )}
        {r?.score ? (
          <Link href="/best-answers" className="shrink-0 text-[12.5px] font-medium text-zinc-600 hover:text-zinc-900">
            {r.score >= 5 ? "우수 답변 후보 보기 →" : r.score <= 2 ? "품질 점검 보기 →" : "답변 목록 →"}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------ A-06 수정 전후 ------------------------------ */

function SentAnswer({ answer }: { answer: Answer }) {
  const [view, setView] = useState<"diff" | "after" | "before">("diff");
  const before = answer.draftText ?? "";
  const diff = useMemo(() => diffWords(before, answer.text), [before, answer.text]);
  const unchanged = before === answer.text;
  const noDraft = !before;

  return (
    <div className="rounded-lg border border-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <p className="text-[12.5px] font-semibold text-zinc-700">
          발송한 답변 <span className="font-mono font-normal text-zinc-400">{answer.id}</span>
        </p>
        <Badge className={noDraft ? "bg-zinc-100 text-zinc-600" : unchanged ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-indigo-50 text-indigo-700 ring-indigo-600/15"}>
          {noDraft ? "직접 작성 (초안 없음)" : unchanged ? "초안 그대로 발송" : `초안 대비 수정량 ${pct(answer.editRatio)}`}
        </Badge>
        {!noDraft && !unchanged && (
          <div className="ml-auto flex rounded-md bg-zinc-100 p-0.5 text-[12px]">
            {(
              [
                ["diff", "변경 비교"],
                ["before", "AI 초안"],
                ["after", "발송본"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={cn("rounded px-2 py-1 transition", view === k ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="whitespace-pre-line px-4 py-3 text-[13.5px] leading-relaxed text-zinc-800">
        {noDraft || unchanged || view === "after"
          ? answer.text
          : view === "before"
            ? before
            : diff.map((p, i) => (
                <span
                  key={i}
                  className={cn(
                    p.type === "add" && "rounded bg-emerald-100 text-emerald-900",
                    p.type === "del" && "rounded bg-red-100 text-red-700 line-through",
                  )}
                >
                  {p.text}
                </span>
              ))}
      </p>
      {!noDraft && !unchanged && view === "diff" && (
        <p className="border-t border-zinc-100 px-4 py-2 text-[11.5px] text-zinc-500">
          <span className="mr-2 rounded bg-red-100 px-1 text-red-700 line-through">삭제</span>
          <span className="rounded bg-emerald-100 px-1 text-emerald-900">추가</span>
          <span className="ml-2">수정량은 별점 4점 답변의 우수 답변 후보 조건(설정 기준, 기본 30% 미만)에 쓰여요</span>
        </p>
      )}
    </div>
  );
}
