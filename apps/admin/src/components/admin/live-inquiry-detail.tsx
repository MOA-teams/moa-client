"use client";

import { ArrowLeft, Bot, Check, Clock, Link2, Lock, MessageSquareText, Monitor, Send, Sparkles, User, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  BACKEND_CATEGORY_LABEL,
  BACKEND_STATUS_LABEL,
  BACKEND_URGENCY_LABEL,
  adminInquiryApi,
  type BackendMessage,
} from "@moa/shared/inquiry";
import { useCursorMessages } from "@moa/shared/use-cursor-messages";
import { cn, formatDateTime, formatTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, Notice, RemoteAttachment } from "@moa/ui";
import { LIVE_STATUS_TONE, URGENCY_TONE } from "./live-inbox";

const SENDER = {
  customer: { label: "고객", icon: User, bubble: "bg-zinc-100 text-zinc-900", avatar: "bg-zinc-100 text-zinc-600" },
  ai_auto: { label: "자동 발송", icon: Bot, bubble: "bg-indigo-50/70 text-indigo-950", avatar: "bg-indigo-50 text-indigo-600" },
  agent: { label: "담당자", icon: Check, bubble: "bg-zinc-900 text-white", avatar: "bg-zinc-900 text-white" },
} as const;

const TYPE_LABEL: Record<BackendMessage["message_type"], string> = {
  customer_message: "",
  acknowledgement: "접수 안내",
  information_request: "정보 수집 질문",
  final_answer: "답변",
};

/** 백엔드 실제 문의 상세 (GET /api/v1/admin/inquiries/{id}) — 조회만으로 상태를 바꾸지 않음 */
export function LiveInquiryDetail({ id }: { id: number }) {
  const { messages, latest: d, error } = useCursorMessages(id, (iid, cursor) => adminInquiryApi.detail(iid, cursor));
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const env = [
    { k: "OS", v: d.env.os },
    { k: "앱 버전", v: d.env.app_version },
    { k: "오류 코드", v: d.env.error_code, mono: true },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/60" aria-label="뒤로">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[13px] text-zinc-400">#{d.inquiry_id}</span>
        <h1 className="min-w-0 truncate text-lg font-semibold text-zinc-900">{d.title}</h1>
        <Badge className={LIVE_STATUS_TONE[d.status]}>{BACKEND_STATUS_LABEL[d.status]}</Badge>
        {d.urgency ? <Badge className={URGENCY_TONE[d.urgency]}>{BACKEND_URGENCY_LABEL[d.urgency]}</Badge> : <Badge className="bg-white text-zinc-400 ring-zinc-200">긴급도 분석 전</Badge>}
        <span className="ml-auto text-[12.5px] text-zinc-400">접수 {formatDateTime(d.created_at)}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          {/* 대화 */}
          <Card>
            <CardHeader title="대화" desc={`메시지 ${messages.length}건 · 3초마다 새 메시지 확인`} icon={<MessageSquareText className="size-4" />} />
            <div ref={scrollRef} className="scrollbar-thin max-h-[560px] space-y-4 overflow-y-auto px-5 py-5">
              {messages.map((m) => {
                const s = SENDER[m.sender];
                const mine = m.sender === "customer";
                const typeLabel = TYPE_LABEL[m.message_type];
                return (
                  <div key={m.message_id} className={cn("flex gap-2.5", !mine && "flex-row-reverse")}>
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", s.avatar)}>
                      <s.icon className="size-3.5" />
                    </span>
                    <div className={cn("max-w-[82%]", !mine && "text-right")}>
                      <p className="mb-1 text-[11.5px] text-zinc-500">
                        {s.label}
                        {typeLabel && ` · ${typeLabel}`} · {formatTime(m.sent_at)}
                      </p>
                      {m.text && <div className={cn("inline-block whitespace-pre-line rounded-xl px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed", s.bubble)}>{m.text}</div>}
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

          {/* 환경 */}
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
                외부 고객 ID{" "}
                {d.source_customer_id ? <span className="font-mono text-zinc-800">{d.source_customer_id}</span> : <span className="text-zinc-400">없음</span>}
              </span>
              <span>
                MOA 고객 <span className="font-mono text-zinc-800">#{d.customer_id}</span>
              </span>
            </div>
            {d.source_customer_id && (
              <p className="border-t border-zinc-100 px-5 py-2.5 text-[11.5px] text-zinc-400">
                외부 고객 ID는 싱크노트에서 전달받은 참고 정보예요. 실제 고객 확인은 로그인한 MOA 계정 기준입니다.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {/* 분류 */}
          <Card>
            <CardHeader title="분류" desc="고객이 고른 카테고리는 힌트로만 사용해요" icon={<Sparkles className="size-4" />} />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <p className="text-[11.5px] text-zinc-500">고객 선택</p>
                <p className="mt-1.5 text-[13.5px] font-medium text-zinc-900">{BACKEND_CATEGORY_LABEL[d.customer_category]}</p>
              </div>
              <div>
                <p className="text-[11.5px] text-zinc-500">AI 분류</p>
                <p className={cn("mt-1.5 text-[13.5px] font-medium", d.category ? "text-zinc-900" : "text-zinc-400")}>
                  {d.category ? BACKEND_CATEGORY_LABEL[d.category] : "분석 전"}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] text-zinc-500">긴급도</p>
                <p className={cn("mt-1.5 text-[13.5px] font-medium", d.urgency ? "text-zinc-900" : "text-zinc-400")}>
                  {d.urgency ? BACKEND_URGENCY_LABEL[d.urgency] : "분석 전"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-zinc-100 px-5 py-3 text-[12px] text-zinc-500">
              <span>
                <Clock className="mr-1 inline size-3.5" />
                최근 변경 {formatDateTime(d.updated_at)}
              </span>
              <span>revision {d.revision}</span>
            </div>
          </Card>

          {/* 초안 — 백엔드 AI 단계 연동 전 */}
          <Card>
            <CardHeader title="답변 초안" desc="사실은 최신 문서·코드에서, 답하는 방식은 우수 답변에서" icon={<Sparkles className="size-4" />} />
            <div className="space-y-3 px-5 py-4">
              <Notice tone="info" title="AI 초안·검증은 백엔드 연동 후 표시돼요">
                지금 백엔드는 문의 접수·대화 조회까지 제공해요. 분류·초안·근거·발송·상담 종료 API가 열리면 이 영역이 활성화됩니다.
              </Notice>
              <textarea
                disabled
                rows={5}
                placeholder="AI 초안이 여기에 표시돼요"
                className="w-full resize-none rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3.5 py-3 text-[14px] text-zinc-400"
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-[12px] text-zinc-500">
                  <Lock className="mr-1 inline size-3" />
                  사실이 들어간 답변은 담당자 승인 후에만 발송돼요
                </p>
                <Button variant="ghost" size="sm" disabled>
                  <XCircle className="size-3.5" /> 상담 종료
                </Button>
                <Button size="sm" disabled>
                  <Send className="size-3.5" /> 승인·발송
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
