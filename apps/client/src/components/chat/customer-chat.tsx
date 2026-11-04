"use client";

import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Monitor,
  Paperclip,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, customerApi, type CustomerInquiry } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { ADMIN_URL } from "@moa/shared/urls";
import { CATEGORIES, CATEGORY_LABEL, STATUS_LABEL } from "@moa/shared/labels";
import type { Attachment, Category, Environment, InquiryStatus, Message } from "@moa/shared/types";
import { cn, formatBytes, formatTime } from "@moa/shared/utils";

const STORAGE_KEY = "moa.chat.inquiryId";
const MAX_FILE = 10 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "application/pdf"];

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** C-02: 웹은 발생 환경 자동 수집 */
function detectEnv(): Environment {
  const ua = navigator.userAgent;
  const os = /Windows NT 10/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)
      ? "macOS"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "기타";
  const m =
    ua.match(/Edg\/(\d+)/) ? ["Edge", ua.match(/Edg\/(\d+)/)![1]] :
    ua.match(/Chrome\/(\d+)/) ? ["Chrome", ua.match(/Chrome\/(\d+)/)![1]] :
    ua.match(/Firefox\/(\d+)/) ? ["Firefox", ua.match(/Firefox\/(\d+)/)![1]] :
    ua.match(/Version\/(\d+).*Safari/) ? ["Safari", ua.match(/Version\/(\d+).*Safari/)![1]] : ["브라우저", ""];
  return { os, browser: `${m[0]} ${m[1]}`.trim() };
}

/** C-06: 민감정보(카드번호·주민번호) 마스킹 */
function maskSensitive(text: string) {
  let masked = false;
  const out = text
    .replace(/\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g, (_, a) => {
      masked = true;
      return `${a}-****-****-****`;
    })
    .replace(/\b(\d{6})-?([1-4])\d{6}\b/g, (_, a, b) => {
      masked = true;
      return `${a}-${b}******`;
    });
  return { out, masked };
}

const STEPS: InquiryStatus[] = ["received", "in_review", "answered", "closed"];

export function CustomerChat() {
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [env, setEnv] = useState<Environment>({});
  const [envOpen, setEnvOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Array<{ local: string; att?: Attachment; file: File; error?: string }>>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 창을 닫아도 대화 유지 (4-5)
    setInquiryId(readStored());
    setEnv(detectEnv());
    setReady(true);
  }, []);

  const { data: inquiry, setData, error: loadError } = usePolling<CustomerInquiry | null>(
    () => (inquiryId ? customerApi.get(inquiryId) : Promise.resolve(null)),
    3000,
    ready && !!inquiryId,
  );

  const lastCount = useRef(0);
  const messages = inquiry?.messages ?? [];
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    if (loadError && inquiryId) {
      // 데모 초기화 등으로 문의가 사라진 경우
      writeStored(null);
      setInquiryId(null);
    }
  }, [loadError, inquiryId]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).map((file) => {
      const error = !ACCEPT.includes(file.type)
        ? "png·jpg·pdf만 가능해요"
        : file.size > MAX_FILE
          ? "파일당 10MB까지 가능해요"
          : undefined;
      return { file, local: URL.createObjectURL(file), error };
    });
    setFiles((f) => [...f, ...next]);
    if (next.some((n) => n.file.type.startsWith("image/") && !n.error)) {
      setNotice("이미지에 카드번호·이메일 같은 개인정보가 보이지 않게 가려주세요.");
    }
    for (const n of next) {
      if (n.error) continue;
      try {
        const att = await customerApi.upload(n.file);
        setFiles((f) => f.map((x) => (x.local === n.local ? { ...x, att } : x)));
      } catch (e) {
        setFiles((f) => f.map((x) => (x.local === n.local ? { ...x, error: e instanceof Error ? e.message : "업로드 실패" } : x)));
      }
    }
  }

  async function send() {
    const uploading = files.some((f) => !f.att && !f.error);
    if (uploading || sending) return;
    const atts = files.filter((f) => f.att).map((f) => f.att!);
    if (!text.trim() && atts.length === 0) return;
    const { out, masked } = maskSensitive(text.trim());
    if (masked) setNotice("카드번호·주민번호로 보이는 내용을 가려서 보냈어요.");
    setSending(true);
    setError(null);
    try {
      if (!inquiryId) {
        const created = await customerApi.start({
          customerCategory: category,
          text: out,
          environment: env,
          attachments: atts,
        });
        writeStored(created.id);
        setInquiryId(created.id);
        setData(created);
      } else {
        const r = await customerApi.send(inquiryId, { text: out, attachments: atts, environment: env });
        if (r.newInquiry) {
          writeStored(r.inquiry.id);
          setInquiryId(r.inquiry.id);
        }
        setData(r.inquiry);
      }
      setText("");
      setFiles([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "전송하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    writeStored(null);
    setInquiryId(null);
    setData(null);
    setCategory(null);
    setText("");
    setFiles([]);
    setNotice(null);
  }

  const status = inquiry?.status;
  const closed = status === "closed";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#eef2ff,transparent_60%)] p-0 sm:p-6">
      <div className="flex h-dvh w-full max-w-[440px] flex-col overflow-hidden bg-white sm:h-[min(780px,calc(100dvh-48px))] sm:rounded-3xl sm:border sm:border-zinc-200 sm:shadow-xl sm:shadow-zinc-900/5">
        {/* 헤더 */}
        <header className="border-b border-zinc-100 px-5 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-full bg-indigo-600 text-[13px] font-bold text-white">F</span>
              <div>
                <p className="text-[15px] font-semibold text-zinc-900">플로노트 고객센터</p>
                <p className="text-[12px] text-zinc-500">평일 10:00 ~ 19:00 · 평균 응답 12분</p>
              </div>
            </div>
            {inquiryId && (
              <button onClick={newChat} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100" title="새 상담">
                <RotateCcw className="size-3.5" /> 새 상담
              </button>
            )}
          </div>
          {status && <StatusBar status={status} />}
        </header>

        {/* 메시지 */}
        <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 px-4 py-5">
          <BotBubble>
            안녕하세요, 플로노트입니다 👋
            <br />
            궁금한 점이나 불편한 점을 남겨주세요. 담당자가 확인 후 답변드려요.
          </BotBubble>

          {!inquiryId && ready && (
            <div className="animate-fade-up pl-10">
              <p className="mb-2 text-[12px] text-zinc-500">어떤 문의인가요? (선택)</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(category === c ? null : c)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] transition",
                      category === c
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageItem key={m.id} m={m} inquiry={inquiry!} onRated={setData} />
          ))}

          {closed && (
            <p className="py-2 text-center text-[12px] text-zinc-400">
              상담이 종료되었어요. 새 메시지를 보내면 새 문의로 접수됩니다.
            </p>
          )}
        </div>

        {/* 입력 */}
        <div className="border-t border-zinc-100 bg-white px-3 pb-3 pt-2">
          {notice && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="닫기">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {error && <p className="mb-2 px-1 text-[12px] text-red-600">{error}</p>}

          <div className="mb-2">
            <button
              onClick={() => setEnvOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-zinc-500 hover:text-zinc-700"
            >
              <Monitor className="size-3.5" />
              <span className="truncate">
                {env.os ?? "환경"} · {env.browser ?? "-"} 자동 수집
                {env.errorCode ? ` · ${env.errorCode}` : ""}
              </span>
              <ChevronDown className={cn("ml-auto size-3.5 transition", envOpen && "rotate-180")} />
            </button>
            {envOpen && (
              <div className="mt-1 grid grid-cols-3 gap-1.5 px-1">
                <EnvInput label="OS" value={env.os} onChange={(v) => setEnv({ ...env, os: v })} />
                <EnvInput label="브라우저·앱 버전" value={env.browser} onChange={(v) => setEnv({ ...env, browser: v })} />
                <EnvInput label="오류 코드" placeholder="E-502" value={env.errorCode} onChange={(v) => setEnv({ ...env, errorCode: v.toUpperCase() || undefined })} />
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {files.map((f) => (
                <div key={f.local} className="relative shrink-0">
                  {f.file.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.local} alt={f.file.name} className={cn("size-16 rounded-lg border object-cover", f.error ? "border-red-300 opacity-50" : "border-zinc-200")} />
                  ) : (
                    <div className={cn("flex size-16 flex-col items-center justify-center rounded-lg border bg-zinc-50 text-[10px] text-zinc-500", f.error ? "border-red-300" : "border-zinc-200")}>
                      <FileText className="mb-1 size-5" />
                      PDF
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/55 px-1 text-[9.5px] text-white">
                    {f.error ? f.error : f.att ? formatBytes(f.file.size) : "업로드 중…"}
                  </span>
                  <button
                    onClick={() => setFiles((x) => x.filter((y) => y.local !== f.local))}
                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-zinc-800 text-white"
                    aria-label="첨부 삭제"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 focus-within:border-zinc-400">
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100"
              aria-label="파일 첨부"
              title="이미지·PDF 첨부 (파일당 10MB)"
            >
              <Paperclip className="size-[18px]" />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={closed ? "새 문의를 남겨주세요" : "메시지를 입력하세요"}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] outline-none placeholder:text-zinc-400"
            />
            <button
              onClick={send}
              disabled={sending || (!text.trim() && !files.some((f) => f.att)) || files.some((f) => !f.att && !f.error)}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:bg-zinc-200 disabled:text-zinc-400"
              aria-label="보내기"
            >
              <ArrowUp className="size-[18px]" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            데모 화면 · <a href={ADMIN_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">담당자 어드민 열기</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ status }: { status: InquiryStatus }) {
  const idx = status === "need_info" ? 1 : STEPS.indexOf(status);
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const label = s === "in_review" && status === "need_info" ? STATUS_LABEL.need_info : STATUS_LABEL[s];
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={s} className="flex flex-1 flex-col gap-1">
            <div
              className={cn(
                "h-1 rounded-full",
                done ? "bg-indigo-600" : active ? (status === "need_info" ? "bg-amber-500" : "bg-indigo-600") : "bg-zinc-200",
              )}
            />
            <span className={cn("text-[11px]", active ? (status === "need_info" ? "font-semibold text-amber-600" : "font-semibold text-indigo-700") : done ? "text-zinc-500" : "text-zinc-400")}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EnvInput({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-zinc-400">{label}</span>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-zinc-200 px-2 text-[12px] outline-none focus:border-zinc-400"
      />
    </label>
  );
}

function BotBubble({ children, label, time }: { children: React.ReactNode; label?: string; time?: string }) {
  return (
    <div className="flex animate-fade-up gap-2">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">F</span>
      <div className="max-w-[80%]">
        {label && <p className="mb-1 text-[11px] text-zinc-500">{label}</p>}
        <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-zinc-800 ring-1 ring-zinc-200/70">
          {children}
        </div>
        {time && <p className="mt-1 text-[10.5px] text-zinc-400">{time}</p>}
      </div>
    </div>
  );
}

function AttachmentList({ items, dark }: { items: Attachment[]; dark?: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
      {items.map((a) =>
        a.mime.startsWith("image/") ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="max-h-40 max-w-[220px] rounded-xl border border-zinc-200 object-cover" />
          </a>
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]", dark ? "border-zinc-200 bg-white text-zinc-700" : "border-zinc-200")}
          >
            <FileText className="size-4 text-red-500" />
            <span className="max-w-[160px] truncate">{a.name}</span>
            <span className="text-zinc-400">{formatBytes(a.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

function MessageItem({ m, inquiry, onRated }: { m: Message; inquiry: CustomerInquiry; onRated: (i: CustomerInquiry) => void }) {
  const time = formatTime(m.createdAt);
  if (m.role === "customer") {
    return (
      <div className="flex animate-fade-up flex-col items-end">
        {m.text && (
          <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tr-md bg-zinc-900 px-3.5 py-2.5 text-[14px] leading-relaxed text-white">
            {m.text}
          </div>
        )}
        {m.attachments && m.attachments.length > 0 && <AttachmentList items={m.attachments} dark />}
        <p className="mt-1 text-[10.5px] text-zinc-400">{time}</p>
      </div>
    );
  }
  if (m.kind === "rating_request") {
    return <RatingCard inquiry={inquiry} onRated={onRated} />;
  }
  if (m.role === "ai") {
    return (
      <BotBubble label={m.kind === "info_request" ? "자동 안내 · 정보 요청" : "자동 안내"} time={time}>
        {m.text}
      </BotBubble>
    );
  }
  return (
    <BotBubble label="상담원" time={time}>
      {m.text}
    </BotBubble>
  );
}

/** C-04: 한 번의 탭으로 끝나는 별점 + 선택 한 줄 의견 */
function RatingCard({ inquiry, onRated }: { inquiry: CustomerInquiry; onRated: (i: CustomerInquiry) => void }) {
  const score = inquiry.rating?.score ?? null;
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [commentSent, setCommentSent] = useState(!!inquiry.rating?.comment);
  const [busy, setBusy] = useState(false);

  async function rate(s: number) {
    if (busy) return;
    setBusy(true);
    try {
      onRated(await customerApi.rate(inquiry.id, s));
    } finally {
      setBusy(false);
    }
  }
  async function sendComment() {
    if (!comment.trim() || score === null) return;
    setBusy(true);
    try {
      onRated(await customerApi.rate(inquiry.id, score, comment.trim()));
      setCommentSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[320px] animate-fade-up rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
      {score === null ? (
        <>
          <p className="text-[14px] font-semibold text-zinc-900">상담은 만족스러우셨나요?</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">별을 누르면 바로 평가가 끝나요</p>
          <div className="mt-3 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onMouseEnter={() => setHover(s)}
                onClick={() => rate(s)}
                disabled={busy}
                className={cn("text-[30px] leading-none transition-transform hover:scale-110", s <= hover ? "text-amber-400" : "text-zinc-200")}
                aria-label={`${s}점`}
              >
                ★
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="size-5" />
          </div>
          <p className="text-[14px] font-semibold text-zinc-900">평가해 주셔서 감사합니다</p>
          <p className="mt-1 text-[20px] leading-none text-amber-400">
            {"★".repeat(score)}
            <span className="text-zinc-200">{"★".repeat(5 - score)}</span>
          </p>
          {commentSent ? (
            <p className="mt-3 text-[12px] text-zinc-500">의견도 잘 전달했어요.</p>
          ) : (
            <div className="mt-3 flex gap-1.5">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="한 줄 의견 (선택)"
                className="h-8 flex-1 rounded-lg border border-zinc-200 px-2.5 text-[12.5px] outline-none focus:border-zinc-400"
              />
              <button onClick={sendComment} disabled={!comment.trim() || busy} className="h-8 rounded-lg bg-zinc-900 px-3 text-[12px] font-medium text-white disabled:bg-zinc-200 disabled:text-zinc-400">
                보내기
              </button>
            </div>
          )}
        </>
      )}
      <p className="mt-3 flex items-center justify-center gap-1 text-[10.5px] text-zinc-400">
        <Sparkles className="size-3" /> 평가는 더 나은 답변을 만드는 데 쓰여요
      </p>
    </div>
  );
}
