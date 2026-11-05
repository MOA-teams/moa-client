"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookText,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  History,
  Link2,
  LogOut,
  Lock,
  MessageSquareText,
  Monitor,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Undo2,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { detectCodeExposure } from "@moa/shared/guard";
import {
  INQUIRY_CATEGORIES,
  INQUIRY_URGENCIES,
  adminInquiryApi,
  inquiryErrorMessage,
  newIdempotencyKey,
  reviewReasonLabel,
  analysisErrorLabel,
  VERIFICATION_CHECK_LABEL,
  type AnswerAudit,
  type AnswerBody,
  type BackendCategory,
  type BackendMessage,
  type BackendUrgency,
  type CheckStatus,
  type DraftResult,
  type Evidence,
  type InquiryDetailResponse,
} from "@moa/shared/inquiry";
import { useCursorMessages } from "@moa/shared/use-cursor-messages";
import { cn, formatDateTime, formatTime, pct } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, Notice, RemoteAttachment, RichText, Select } from "@moa/ui";
import { useReadReceipt } from "@moa/shared/use-read-receipt";
import { LIVE_STATUS_TONE, URGENCY_TONE } from "./live-inbox";

const SENDER = {
  customer: { label: "고객", icon: User, bubble: "bg-zinc-100 text-zinc-900", avatar: "bg-zinc-100 text-zinc-600" },
  ai_auto: { label: "자동 발송", icon: Bot, bubble: "bg-indigo-50/70 text-indigo-950", avatar: "bg-indigo-50 text-indigo-600" },
  agent: { label: "담당자", icon: Check, bubble: "bg-zinc-900 text-white", avatar: "bg-zinc-900 text-white" },
} as const;

const DRAFT_TONE: Record<DraftResult, string> = {
  "초안 가능": "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  "직접 확인 필요": "bg-orange-50 text-orange-700 ring-orange-600/15",
  "추가 질문 필요": "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const CHECK_TONE: Record<CheckStatus, string> = {
  통과: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  실패: "bg-red-50 text-red-700 ring-red-600/15",
  "확인 불가": "bg-amber-50 text-amber-700 ring-amber-600/20",
  미실행: "bg-zinc-100 text-zinc-500 ring-zinc-500/15",
};

type Detail = InquiryDetailResponse;

/** 초안·추천 질문이 없을 때 채우는 답변 틀 — 사실은 담당자가 확인해 채우고, 표시가 남아 있으면 발송 차단 */
const FILL_MARK = "[확인한 내용을 여기에 작성하세요]";
const answerTemplate = (summary?: string) =>
  `안녕하세요, 싱크노트입니다.\n문의 주셔서 감사합니다.\n\n${FILL_MARK}${summary ? `\n(문의 요약: ${summary})` : ""}\n\n추가로 궁금하신 점이 있으면 편하게 말씀해 주세요.`;

/** 실패한 변경 요청의 키·본문 보관 → 같은 내용 재시도는 같은 Idempotency-Key */
function useIdem<B>() {
  const ref = useRef<{ key: string; body: B } | null>(null);
  return {
    keyFor(body: B) {
      const p = ref.current;
      const key = p && JSON.stringify(p.body) === JSON.stringify(body) ? p.key : newIdempotencyKey();
      ref.current = { key, body };
      return key;
    },
    clear() {
      ref.current = null;
    },
  };
}

type Err = { msg: string; rid?: string } | null;
const toErr = (e: unknown): Err => ({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });

/** 백엔드 실제 문의 상세 (GET /api/v1/admin/inquiries/{id}) */
export function LiveInquiryDetail({ id }: { id: string }) {
  const { messages, latest, error, poke } = useCursorMessages(id, (iid, cursor) => adminInquiryApi.detail(iid, cursor));
  const scrollRef = useRef<HTMLDivElement>(null);

  // 백엔드는 해당 cursor 페이지에 포함된 답변만 `answers`로 내려준다.
  // 새 메시지가 없는 poll 응답에서는 배열이 비므로, 받은 답변을 answer_id 기준으로 누적한다.
  const [answerLog, setAnswerLog] = useState<{ id: string; src: Detail | null; list: AnswerAudit[] }>({ id, src: null, list: [] });
  let answerList = answerLog.list;
  if (answerLog.id !== id || answerLog.src !== latest) {
    const base = answerLog.id === id ? answerLog.list : [];
    const fresh = (latest?.answers ?? []).filter((a) => !base.some((b) => b.answer_id === a.answer_id));
    answerList = fresh.length ? [...base, ...fresh] : base;
    setAnswerLog({ id, src: latest, list: answerList });
  }
  const d = useMemo(() => (latest ? { ...latest, answers: answerList } : null), [latest, answerList]);
  // 답변 감사 기록을 아직 못 받았더라도 대화에 최종 답변 메시지가 있으면 답변한 상담으로 본다
  const hasFinalAnswerMessage = messages.some((m) => m.message_type === "최종 답변");

  // 담당자가 화면을 보고 있을 때 마지막 메시지까지 읽음 처리 → 고객 화면 '읽음'
  useReadReceipt(d ? id : null, messages.length ? messages[messages.length - 1].message_id : null, adminInquiryApi.read);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  if (error && !d) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500">
        {error.code === "INQUIRY_NOT_FOUND" ? "문의를 찾을 수 없어요. 다른 기업의 문의이거나 삭제됐을 수 있어요." : error.message}
        <div className="mt-3">
          <Link href="/" className="text-zinc-900 underline">
            인박스로
          </Link>
        </div>
      </div>
    );
  }
  if (!d) return <LoadingBlock />;

  const closed = d.status === "상담 종료";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/60" aria-label="뒤로">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[13px] text-zinc-400">{d.inquiry_id}</span>
        <h1 className="min-w-0 truncate text-lg font-semibold text-zinc-900">{d.title}</h1>
        <Badge className={LIVE_STATUS_TONE[d.status]}>{d.status}</Badge>
        {d.urgency ? <Badge className={URGENCY_TONE[d.urgency]}>긴급도 {d.urgency}</Badge> : <Badge className="bg-white text-zinc-400 ring-zinc-200">긴급도 분석 전</Badge>}
        <span className="ml-auto text-[12.5px] text-zinc-400">접수 {formatDateTime(d.created_at)}</span>
      </div>

      {d.customer_presence && !closed && <PresenceBar p={d.customer_presence} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Conversation messages={messages} scrollRef={scrollRef} customerReadId={d.customer_last_read_message_id ?? null} />
          <EnvCard d={d} />
        </div>
        <div className="space-y-5">
          <AnalysisCard d={d} onChange={poke} />
          <ClassificationCard key={`${d.revision}-${d.category}-${d.urgency}`} d={d} onChange={poke} />
          <AnswerCard d={d} hasFinalAnswerMessage={hasFinalAnswerMessage} onChange={poke} />
          {(d.status === "답변 완료" || closed) && <CloseCard d={d} onChange={poke} />}
        </div>
      </div>
    </>
  );
}

/* ------------------------------- 고객 상태 ------------------------------- */

function PresenceBar({ p }: { p: NonNullable<Detail["customer_presence"]> }) {
  if (p.status === "나감") {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        <LogOut className="size-4" />
        <span className="font-semibold">고객이 상담을 나갔어요</span>
        {p.left_at && <span className="text-amber-700">· {formatDateTime(p.left_at)}</span>}
        {p.left_reason && <span className="text-amber-700">· {p.left_reason === "new_chat" ? "새 상담을 시작함" : "창을 닫음"}</span>}
        <span className="ml-auto text-[12px] text-amber-700">답변을 보내면 고객이 돌아왔을 때 확인하고, 알림을 받아요</span>
      </div>
    );
  }
  return (
    <div className="mb-5 flex items-center gap-2 text-[12.5px] text-emerald-700">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      고객 상담 중 · 고객이 나가거나 새 상담을 시작하면 여기에 표시돼요
    </div>
  );
}

/* --------------------------------- 대화 --------------------------------- */

function Conversation({
  messages,
  scrollRef,
  customerReadId,
}: {
  messages: BackendMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  customerReadId: string | null;
}) {
  // 고객이 읽은 위치까지의 담당자·자동 메시지에 '읽음'
  const readUpTo = customerReadId ? messages.findIndex((m) => m.message_id === customerReadId) : -1;
  return (
    <Card>
      <CardHeader title="대화" desc={`메시지 ${messages.length}건 · 3초마다 새 메시지 확인`} icon={<MessageSquareText className="size-4" />} />
      <div ref={scrollRef} className="scrollbar-thin max-h-[560px] space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, idx) => {
          const s = SENDER[m.sender];
          const mine = m.sender === "customer";
          return (
            <div key={m.message_id} className={cn("flex gap-2.5", !mine && "flex-row-reverse")}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", s.avatar)}>
                <s.icon className="size-3.5" />
              </span>
              <div className={cn("max-w-[82%]", !mine && "text-right")}>
                <p className="mb-1 text-[11.5px] text-zinc-500">
                  {s.label}
                  {m.message_type !== "고객 메시지" && ` · ${m.message_type}`} · {formatTime(m.sent_at)}
                  {!mine && readUpTo >= 0 && idx <= readUpTo && <span className="ml-1 font-medium text-indigo-600">· 읽음</span>}
                </p>
                {m.text && (
                  <div className={cn("inline-block rounded-xl px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed", s.bubble)}>
                    {mine ? <span className="whitespace-pre-line">{m.text}</span> : <RichText text={m.text} />}
                  </div>
                )}
                {m.attachments && m.attachments.length > 0 && (
                  <div className={cn("mt-2 flex flex-wrap gap-2", !mine && "justify-end")}>
                    {m.attachments.map((a) => (
                      <RemoteAttachment key={a.attachment_id} a={a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EnvCard({ d }: { d: Detail }) {
  const env = [
    { k: "OS", v: d.env.os },
    { k: "앱 버전", v: d.env.app_version },
    { k: "오류 코드", v: d.env.error_code, mono: true },
  ];
  return (
    <Card>
      <CardHeader title="발생 환경" desc="고객 앱이 문의 생성 시 전달" icon={<Monitor className="size-4" />} />
      <dl className="grid grid-cols-3 divide-x divide-zinc-100">
        {env.map((r) => (
          <div key={r.k} className="px-5 py-3.5">
            <dt className="text-[11.5px] text-zinc-500">{r.k}</dt>
            <dd className={cn("mt-1 truncate text-[13.5px] font-medium text-zinc-900", r.mono && "font-mono", r.mono && r.v && "text-red-600")}>{r.v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-zinc-100 px-5 py-3 text-[12.5px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Link2 className="size-3.5" />
          외부 고객 ID {d.source_customer_id ? <span className="font-mono text-zinc-800">{d.source_customer_id}</span> : <span className="text-zinc-400">없음</span>}
        </span>
        <span>
          MOA 고객 <span className="font-mono text-zinc-800">{d.customer_id}</span>
        </span>
      </div>
      {d.source_customer_id && (
        <p className="border-t border-zinc-100 px-5 py-2.5 text-[11.5px] text-zinc-400">외부 고객 ID는 싱크노트에서 전달받은 참고 정보예요. 실제 고객 확인은 로그인한 MOA 계정 기준입니다.</p>
      )}
    </Card>
  );
}

/* -------------------------------- AI 분석 -------------------------------- */

function AnalysisCard({ d, onChange }: { d: Detail; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [requested, setRequested] = useState(false);
  const idem = useIdem<{ expected_inquiry_revision: number; based_on_message_id: string }>();
  const a = d.analysis;
  const running = d.run_status === "대기" || d.run_status === "처리 중";

  async function reanalyze() {
    const body = { expected_inquiry_revision: d.revision, based_on_message_id: d.latest_customer_message_id };
    setBusy(true);
    setErr(null);
    try {
      await adminInquiryApi.analyze(d.inquiry_id, body, idem.keyFor(body));
      idem.clear();
      setRequested(true);
      onChange();
    } catch (e) {
      setErr(toErr(e));
      if (e instanceof AuthApiError && e.code === "STALE_INQUIRY_REVISION") onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="AI 분석"
        desc={d.run_status ? `실행 ${d.run_status}${d.processing_stage ? ` · ${d.processing_stage}` : ""}` : "아직 분석 결과가 없어요"}
        icon={<Sparkles className="size-4" />}
        action={
          d.status !== "상담 종료" && (
            <Button variant="outline" size="sm" onClick={reanalyze} loading={busy} disabled={running}>
              <RefreshCw className={cn("size-3.5", running && "animate-spin")} /> {running ? "분석 중" : "재분석 요청"}
            </Button>
          )
        }
      />
      <div className="space-y-3 px-5 py-4">
        {requested && running && <p className="text-[12.5px] text-indigo-700">재분석을 요청했어요. 완료되면 이 화면에 자동으로 반영돼요 (고객에게는 발송되지 않아요).</p>}
        {d.analysis_error && (
          <Notice tone="danger" icon={<AlertCircle className="size-4" />} title="AI 분석 실패">
            {analysisErrorLabel(d.analysis_error)}
            <p className="mt-1 font-mono text-[11px] opacity-60">
              {d.analysis_error}
              {d.latest_run_id && ` · ${d.latest_run_id}`}
            </p>
          </Notice>
        )}
        {a ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-zinc-800">{a.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/15">AI 분류 {a.category}</Badge>
              <Badge className={URGENCY_TONE[a.urgency]}>AI 긴급도 {a.urgency}</Badge>
              {a.normalized_error_code && <Badge className="bg-red-50 font-mono text-red-700 ring-red-600/10">{a.normalized_error_code}</Badge>}
            </div>
            {a.missing_fields && a.missing_fields.length > 0 && <p className="text-[12.5px] text-amber-700">부족한 정보: {a.missing_fields.join(", ")}</p>}
          </>
        ) : (
          !d.analysis_error && <p className="text-[13px] text-zinc-500">{running ? "AI가 문의를 분석하고 있어요." : "분석 결과가 아직 없어요. 필요하면 재분석을 요청하세요."}</p>
        )}
        {d.additional_question && (
          <div className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
            <p className="text-[11.5px] font-medium text-amber-700">AI 추천 추가 질문</p>
            {d.additional_question}
          </div>
        )}
        {d.similar_inquiries?.items && d.similar_inquiries.items.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11.5px] text-zinc-500">유사 문의 {d.similar_inquiries.reason && `· ${d.similar_inquiries.reason}`}</p>
            <div className="flex flex-wrap gap-1.5">
              {d.similar_inquiries.items.map((s) => (
                <Link key={s.inquiry_id} href={`/inquiries/${s.inquiry_id}`} className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11.5px] text-zinc-700 hover:bg-zinc-200">
                  {s.inquiry_id} · {pct(s.score)}
                </Link>
              ))}
            </div>
          </div>
        )}
        {err && <ErrLine err={err} />}
      </div>
    </Card>
  );
}

/* --------------------------------- 분류 --------------------------------- */

function ClassificationCard({ d, onChange }: { d: Detail; onChange: () => void }) {
  const initialCat = d.category ?? d.analysis?.category ?? d.customer_category;
  const initialUrg = d.urgency ?? d.analysis?.urgency ?? "보통";
  const [category, setCategory] = useState<BackendCategory>(initialCat);
  const [urgency, setUrgency] = useState<BackendUrgency>(initialUrg);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [saved, setSaved] = useState(false);
  const changed = category !== (d.category ?? null) || urgency !== (d.urgency ?? null);

  async function save() {
    if (!reason.trim()) return setErr({ msg: "변경 사유를 입력해 주세요." });
    setBusy(true);
    setErr(null);
    try {
      await adminInquiryApi.classify(d.inquiry_id, { expected_revision: d.revision, category, urgency, reason: reason.trim() });
      setSaved(true);
      setReason("");
      onChange();
    } catch (e) {
      setErr(toErr(e));
      if (e instanceof AuthApiError && e.code === "STALE_INQUIRY_REVISION") onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="분류 확정" desc="담당자가 확정하면 이후 AI 결과가 덮어쓰지 않아요" icon={<History className="size-4" />} />
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[11.5px] text-zinc-500">고객 선택</p>
          <p className="mt-1.5 text-[13.5px] font-medium text-zinc-900">{d.customer_category}</p>
        </div>
        <div>
          <p className="text-[11.5px] text-zinc-500">유형 {d.category ? "(현재)" : <span className="text-zinc-400">(미확정)</span>}</p>
          <Select aria-label="유형" className="mt-1 w-full" value={category} onChange={setCategory} options={INQUIRY_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </div>
        <div>
          <p className="text-[11.5px] text-zinc-500">긴급도 {d.urgency ? "(현재)" : <span className="text-zinc-400">(미확정)</span>}</p>
          <Select aria-label="긴급도" className="mt-1 w-full" value={urgency} onChange={setUrgency} options={INQUIRY_URGENCIES.map((u) => ({ value: u, label: u }))} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-5 py-3">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          placeholder="변경 사유 (필수, 이력에 저장)"
          className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 text-[13px] outline-none focus:border-zinc-400"
        />
        <Button size="sm" onClick={save} loading={busy} disabled={!changed && !!d.category && !!d.urgency}>
          분류 확정
        </Button>
      </div>
      {(err || saved) && (
        <div className="px-5 pb-3">
          {err ? <ErrLine err={err} /> : <p className="text-[12px] text-emerald-700">분류를 확정했어요 (revision {d.revision}).</p>}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------- 답변 --------------------------------- */

function AnswerCard({ d, hasFinalAnswerMessage, onChange }: { d: Detail; hasFinalAnswerMessage: boolean; onChange: () => void }) {
  const draft = d.draft;
  const answered = (d.answers?.length ?? 0) > 0 || hasFinalAnswerMessage;
  const closed = d.status === "상담 종료";
  // 우선순위: AI 초안 → AI 추천 질문 → 답변 틀(AI 분석이 끝났는데 둘 다 없을 때)
  const analysisDone = d.run_status === "완료" || d.run_status === "실패";
  const suggested = draft?.answer_text ?? d.additional_question ?? (analysisDone ? answerTemplate(d.analysis?.summary) : "");
  const [text, setText] = useState(suggested);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [newDraft, setNewDraft] = useState(false);
  const draftKey = draft ? `${draft.draft_id}:${draft.revision}` : d.additional_question ? `q:${d.additional_question}` : analysisDone ? `t:${d.latest_run_id}` : null;
  const shownKey = useRef(draftKey);
  const idem = useIdem<AnswerBody>();

  // 새 초안이 오면: 수정 중이 아니면 교체, 수정 중이면 알림
  useEffect(() => {
    if (draftKey === shownKey.current) return;
    shownKey.current = draftKey;
    if (!dirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(suggested);
    } else setNewDraft(true);
  }, [draftKey, suggested, dirty]);

  const exposure = useMemo(() => detectCodeExposure(text), [text]);
  const hasFillMark = text.includes(FILL_MARK) || /\(문의 요약: /.test(text);
  const unsupported = draft ? (d.verification?.unsupported_sentences ?? []).filter((s) => text.includes(s)) : [];

  async function send() {
    const useDraft = !!draft;
    const body: AnswerBody = {
      draft_id: useDraft ? draft!.draft_id : null,
      draft_revision: useDraft ? draft!.revision : null,
      expected_inquiry_revision: d.revision,
      expected_last_customer_message_id: d.latest_customer_message_id,
      expected_backend_knowledge_revision: d.backend_knowledge_revision,
      answer_text: text,
      evidence: useDraft ? draft!.evidence : ({} as Evidence),
    };
    setBusy(true);
    setErr(null);
    try {
      await adminInquiryApi.answer(d.inquiry_id, body, idem.keyFor(body));
      idem.clear();
      setDirty(false);
      onChange();
    } catch (e) {
      setErr(toErr(e));
      if (e instanceof AuthApiError && e.status === 409) onChange(); // 최신 상세 확인
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="답변"
        desc="사실은 최신 문서·코드에서, 답하는 방식은 우수 답변에서"
        icon={<Sparkles className="size-4" />}
        action={draft && <Badge className={DRAFT_TONE[draft.draft_result]}>{draft.draft_result}</Badge>}
      />
      <div className="space-y-3 px-5 py-4">
        {d.automatic_response && <AutoResponseBox r={d.automatic_response} />}
        {d.answers?.map((a) => <SentAnswer key={a.answer_id} a={a} />)}
        {hasFinalAnswerMessage && !d.answers?.length && <p className="text-[13px] text-zinc-500">보낸 답변은 위 대화에서 확인할 수 있어요.</p>}

        {!answered && !closed && (
          <>
            {!draft && (
              <Notice tone={d.run_status === "실패" ? "warn" : "info"} title={d.run_status === "실패" ? "AI 초안 없음 (분석 실패)" : d.draft_result ? `AI 판단: ${d.draft_result}` : "AI 초안이 아직 없어요"}>
                {d.run_status === "대기" || d.run_status === "처리 중"
                  ? "AI가 초안을 만드는 중이에요. 직접 작성할 수도 있어요."
                  : d.run_status === "실패"
                    ? "AI 분석이 실패해 초안이 없어요. 아래 답변 틀에 확인한 내용을 채워 직접 답변하세요."
                  : d.draft_result === "추가 질문 필요"
                    ? d.additional_question
                      ? "문의 내용이 부족해 AI가 고객에게 물어볼 질문을 준비했어요. 아래 내용을 확인·수정해서 보내세요."
                      : `문의 내용이 부족해요${d.analysis?.missing_fields?.length ? ` (부족한 정보: ${d.analysis.missing_fields.join(", ")})` : ""}. 고객에게 필요한 정보를 물어보세요.`
                    : d.draft_result === "직접 확인 필요"
                      ? "AI가 근거 문서에서 답을 찾지 못했어요. 사실을 확인해 직접 작성하거나, 문서를 보강한 뒤 재분석을 요청하세요."
                      : "근거를 확인해 직접 작성하거나, AI 재분석을 요청하세요."}
              </Notice>
            )}
            {draft?.review_reasons && draft.review_reasons.length > 0 && (
              <Notice tone="warn" icon={<AlertCircle className="size-4" />} title="직접 확인 필요">
                <ul className="list-disc space-y-0.5 pl-4">
                  {draft.review_reasons.map((r) => (
                    <li key={r}>{reviewReasonLabel(r)}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {d.verification && <VerificationBox v={d.verification} />}
            {newDraft && (
              <Notice tone="info" title="새 초안이 생성됐어요">
                <button
                  className="font-medium underline underline-offset-2"
                  onClick={() => {
                    setText(suggested);
                    setDirty(false);
                    setNewDraft(false);
                  }}
                >
                  새 초안 적용
                </button>
              </Notice>
            )}

            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDirty(true);
                }}
                rows={8}
                maxLength={10000}
                placeholder={draft ? "" : d.draft_result === "추가 질문 필요" ? "고객에게 물어볼 내용을 작성하세요" : "답변을 직접 작성하세요"}
                className={cn(
                  "w-full resize-y rounded-lg border bg-white px-3.5 py-3 text-[14px] leading-relaxed text-zinc-900 outline-none transition focus:ring-4",
                  exposure.length ? "border-red-300 focus:ring-red-100" : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-100",
                )}
              />
              {dirty && suggested && (
                <button
                  onClick={() => {
                    setText(suggested);
                    setDirty(false);
                  }}
                  className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11.5px] text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-900"
                >
                  <Undo2 className="size-3" /> {draft ? "원래 초안" : d.additional_question ? "AI 추천 질문" : "답변 틀"}
                </button>
              )}
            </div>

            {unsupported.length > 0 && (
              <Notice tone="warn" icon={<AlertTriangle className="size-4" />} title="검수 AI: 근거 없는 문장이 포함돼 있어요">
                <ul className="list-disc space-y-0.5 pl-4">
                  {unsupported.map((s) => (
                    <li key={s}>
                      <mark className="rounded bg-amber-200/70 px-0.5">{s}</mark>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
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
            {hasFillMark && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-amber-700">
                <AlertTriangle className="size-3.5" />
                {FILL_MARK} 표시와 &lsquo;(문의 요약: …)&rsquo; 줄을 확인한 내용으로 바꿔야 발송할 수 있어요.
              </p>
            )}
            {err && <ErrLine err={err} />}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p className="mr-auto text-[12px] text-zinc-500">
                <Lock className="mr-1 inline size-3" />
                {draft ? `초안 ${draft.draft_id} (rev ${draft.revision}) 기반` : d.additional_question && text === d.additional_question ? "AI 추천 질문" : "직접 작성"} · 담당자 승인 후에만 발송돼요
              </p>
              <Button onClick={send} loading={busy} disabled={!text.trim() || exposure.length > 0 || hasFillMark}>
                <Send className="size-3.5" /> 승인·발송
              </Button>
            </div>
          </>
        )}
        {!answered && closed && <p className="text-[13px] text-zinc-500">답변 없이 종료된 상담이에요.</p>}
      </div>

      {draft && !answered && <DraftSources draft={draft} />}
    </Card>
  );
}

/** 서버 자동 응대 정책 결과 */
function AutoResponseBox({ r }: { r: NonNullable<Detail["automatic_response"]> }) {
  const autoOff = r.review_reasons.includes("AUTO_RESPONSE_DISABLED");
  const text =
    r.delivery_action === "자동 답변 전송"
      ? "자동 응대 정책에 따라 AI가 고객에게 답변을 발송했어요."
      : r.delivery_action === "추가 질문 전송"
        ? "정보가 부족해 AI가 고객에게 추가 질문을 자동 발송했어요."
        : autoOff
          ? "자동 응대가 꺼져 있어 AI가 고객에게 직접 보내지 않았어요. 아래 내용을 확인하고 담당자가 발송해 주세요."
          : "AI가 확신하지 못해 담당자 검토로 넘어왔어요. 아래 사유를 확인해 주세요.";
  return (
    <Notice tone={r.requires_review ? "warn" : "info"} icon={<Bot className="size-4" />} title={`AI 자동 응대 · ${r.delivery_action}`}>
      {text}
      {r.review_reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {r.review_reasons
            .filter((x) => x !== "AUTO_RESPONSE_DISABLED")
            .map((x) => (
              <li key={x}>{reviewReasonLabel(x)}</li>
            ))}
        </ul>
      )}
      <p className="mt-1 font-mono text-[11px] opacity-60">
        {r.run_id}
        {r.message_id && ` · ${r.message_id}`}
      </p>
    </Notice>
  );
}

function VerificationBox({ v }: { v: NonNullable<Detail["verification"]> }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 text-zinc-400" />
        <span className="text-[12.5px] font-medium text-zinc-700">검수 결과</span>
        <Badge className={CHECK_TONE[v.status]}>{v.status}</Badge>
        {v.status === "미실행" && <span className="text-[12px] text-zinc-500">초안이 없어 검수하지 않았어요</span>}
      </div>
      {v.reasons && v.reasons.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-[12.5px] text-zinc-600">
          {v.reasons.map((r) => (
            <li key={r}>{reviewReasonLabel(r)}</li>
          ))}
        </ul>
      )}
      {v.checks && Object.keys(v.checks).length > 0 && (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {Object.entries(v.checks).map(([k, val]) => {
            const st = String(val) as CheckStatus;
            return (
              <div key={k} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[12px]">
                <span className="truncate text-zinc-600">{VERIFICATION_CHECK_LABEL[k] ?? k}</span>
                <Badge className={CHECK_TONE[st] ?? undefined}>{st}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DraftSources({ draft }: { draft: NonNullable<Detail["draft"]> }) {
  const docs = draft.evidence.docs ?? [];
  const code = draft.evidence.code ?? [];
  const styles = draft.style_references ?? [];
  const cites = draft.citations ?? [];
  if (!docs.length && !code.length && !styles.length && !cites.length) return null;
  return (
    <div className="space-y-3 border-t border-zinc-100 px-5 py-4">
      <p className="text-[12.5px] font-semibold text-zinc-700">출처 · 근거</p>
      {docs.length > 0 && (
        <Group title="사실 근거 (문서)">
          {docs.map((x) => (
            <Chip key={`${x.doc_id}v${x.version}`} icon={<BookText className="size-3" />}>
              {x.doc_id} v{x.version}
            </Chip>
          ))}
        </Group>
      )}
      {styles.length > 0 && (
        <Group title="형식 참고 (톤·설명 순서만)">
          {styles.map((x) => (
            <Chip key={`${x.best_id}v${x.version}`} icon={<Star className="size-3" />}>
              {x.best_id} v{x.version}
            </Chip>
          ))}
        </Group>
      )}
      {code.length > 0 && (
        <Group title="담당자 확인용 — 고객 답변에 쓰지 마세요" internal>
          {code.map((x) => (
            <Chip key={x.path} icon={<Code2 className="size-3" />} mono internal>
              {x.path}
              {x.commit_sha && `@${x.commit_sha.slice(0, 7)}`}
            </Chip>
          ))}
        </Group>
      )}
      {cites.length > 0 && (
        <Group title="인용">
          <ul className="w-full space-y-1.5">
            {cites.map((c, i) => (
              <li key={i} className="rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-zinc-700">
                &ldquo;{c.text}&rdquo;
                {c.docs && c.docs.length > 0 && <span className="ml-1 font-mono text-[11px] text-zinc-400">— {c.docs.map((x) => `${x.doc_id} v${x.version}`).join(", ")}</span>}
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  );
}

function Group({ title, children, internal }: { title: string; children: ReactNode; internal?: boolean }) {
  return (
    <div>
      <p className={cn("mb-1.5 flex items-center gap-1 text-[11.5px]", internal ? "text-violet-700" : "text-zinc-500")}>
        {internal && <Lock className="size-3" />}
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ children, icon, mono, internal }: { children: ReactNode; icon: ReactNode; mono?: boolean; internal?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] ring-1", internal ? "bg-violet-50 text-violet-700 ring-violet-600/15" : "bg-white text-zinc-700 ring-zinc-200", mono && "font-mono")}>
      {icon}
      {children}
    </span>
  );
}

function SentAnswer({ a }: { a: NonNullable<Detail["answers"]>[number] }) {
  return (
    <div className="rounded-lg border border-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <p className="text-[12.5px] font-semibold text-zinc-700">{a.delivery_mode === "자동" ? "AI 자동 발송 답변" : "발송한 답변"}</p>
        <span className="font-mono text-[11px] text-zinc-400">{a.answer_id}</span>
        <Badge className={a.delivery_mode === "자동" ? "bg-indigo-50 text-indigo-700 ring-indigo-600/15" : undefined}>{a.delivery_mode === "자동" ? "자동" : `담당자${a.agent_id ? ` ${a.agent_id}` : ""}`}</Badge>
        {a.agent_edit_ratio !== null && <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/15">초안 대비 수정량 {pct(a.agent_edit_ratio)}</Badge>}
        <span className="ml-auto text-[11.5px] text-zinc-400">{formatDateTime(a.answered_at)}</span>
      </div>
      <div className="px-4 py-3 text-[13.5px] leading-relaxed text-zinc-800">
        <RichText text={a.answer_text} />
      </div>
      {((a.evidence.docs?.length ?? 0) > 0 || (a.evidence.code?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2.5">
          {a.evidence.docs?.map((x) => (
            <Chip key={`${x.doc_id}v${x.version}`} icon={<BookText className="size-3" />}>
              {x.doc_id} v{x.version}
            </Chip>
          ))}
          {a.evidence.code?.map((x) => (
            <Chip key={x.path} icon={<Code2 className="size-3" />} mono internal>
              {x.path}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ 상담 종료·평가 ------------------------------ */

function CloseCard({ d, onChange }: { d: Detail; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const idem = useIdem<{ expected_inquiry_revision: number }>();
  const closed = d.status === "상담 종료";
  const f = d.feedback;

  async function close() {
    const body = { expected_inquiry_revision: d.revision };
    setBusy(true);
    setErr(null);
    try {
      await adminInquiryApi.close(d.inquiry_id, body, idem.keyFor(body));
      idem.clear();
      onChange();
    } catch (e) {
      setErr(toErr(e));
      if (e instanceof AuthApiError && e.status === 409) onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="상담 종료 · 고객 평가"
        desc={closed ? `종료 ${d.closed_at ? formatDateTime(d.closed_at) : ""} · 해결 상태 ${d.resolution_status ?? "미확인"}` : "종료하면 고객에게 별점 평가가 요청돼요"}
        icon={<Star className="size-4" />}
        action={
          !closed && (
            <Button size="sm" onClick={close} loading={busy}>
              <XCircle className="size-3.5" /> 상담 종료 · 평가 요청
            </Button>
          )
        }
      />
      <div className="px-5 py-4">
        {err && <ErrLine err={err} />}
        {closed &&
          (d.feedback_submitted && f ? (
            <div className="space-y-1.5">
              {f.rating !== null && (
                <p className="text-[18px] leading-none text-amber-400">
                  {"★".repeat(f.rating)}
                  <span className="text-zinc-200">{"★".repeat(5 - f.rating)}</span>
                </p>
              )}
              <p className="text-[13px] text-zinc-600">
                해결 여부: {f.resolved === null ? "응답 안 함" : f.resolved ? "해결됨" : "미해결"} · {f.resolution_status}
              </p>
              {f.comment && <p className="text-[13px] text-zinc-700">&ldquo;{f.comment}&rdquo;</p>}
              <p className="text-[11.5px] text-zinc-400">{formatDateTime(f.recorded_at)} 평가</p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-zinc-500">
              <Clock className="size-3.5" /> 고객 평가를 기다리고 있어요. 미응답 시 24시간 후 1회 재요청돼요.
            </p>
          ))}
        {!closed && !err && <p className="text-[13px] text-zinc-500">고객이 답변을 확인했다면 상담을 종료하세요. 종료만으로 해결 처리되지는 않아요.</p>}
      </div>
    </Card>
  );
}

function ErrLine({ err }: { err: NonNullable<Err> }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-red-600">
      <AlertCircle className="size-3.5" /> {err.msg}
      {err.rid && <span className="font-mono text-[10.5px] text-red-300">{err.rid}</span>}
    </p>
  );
}
