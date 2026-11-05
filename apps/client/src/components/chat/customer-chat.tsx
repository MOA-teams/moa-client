"use client";

import { AlertTriangle, ArrowUp, ChevronDown, FileText, Link2, LogOut, Monitor, Paperclip, RotateCcw, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { useAuth } from "@moa/shared/auth-context";
import {
  inquiryApi,
  inquiryErrorMessage,
  newIdempotencyKey,
  toBackendCategory,
  type AddMessageBody,
  type AttachmentMeta,
  type AttachmentWithUrl,
  type BackendMessage,
  type BackendStatus,
  type CreateInquiryBody,
  type InquiryEnv,
} from "@moa/shared/inquiry";
import { CATEGORIES, CATEGORY_LABEL } from "@moa/shared/labels";
import type { Category, Message } from "@moa/shared/types";
import { ADMIN_URL } from "@moa/shared/urls";
import { cn, formatBytes, formatTime } from "@moa/shared/utils";
import { RemoteAttachment } from "@moa/ui";
import { NotifyPrompt, useAnswerNotifier } from "./answer-notifier";
import { initialEnv, loginHref, readEntry, type EntryInfo } from "./entry";
import { useInquiryChat } from "./use-inquiry-chat";

const SERVICE = "싱크노트";
const STORAGE_BASE = "moa.chat.inquiry";
const MAX_FILE = 10 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "application/pdf"];

function readStored(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, id: number | null) {
  try {
    if (id) localStorage.setItem(key, String(id));
    else localStorage.removeItem(key);
  } catch {}
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

/** 백엔드 메시지 → 화면·알림용 메시지 */
function toMessage(m: BackendMessage): Message {
  return {
    id: String(m.message_id),
    role: m.sender === "customer" ? "customer" : m.sender === "agent" ? "agent" : "ai",
    kind: m.message_type === "acknowledgement" ? "receipt" : m.message_type === "information_request" ? "info_request" : "text",
    text: m.text,
    createdAt: m.sent_at,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface PendingFile {
  local: string;
  file: File;
  att?: AttachmentWithUrl;
  error?: string;
}

export function CustomerChat() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // 진입 query는 첫 렌더 기준으로 고정 (성공 후 주소에서 제거해도 이번 상담에는 유지)
  const [entry] = useState<EntryInfo>(() => readEntry(new URLSearchParams(params.toString())));
  const storageKey = `${STORAGE_BASE}:${user?.user_id ?? "anon"}`;

  const [inquiryId, setInquiryId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [env, setEnv] = useState<InquiryEnv>({ os: null, app_version: null, error_code: null });
  const [envOpen, setEnvOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 실패한 요청의 키·본문 보관 → 같은 내용 재시도는 같은 Idempotency-Key
  const pendingCreate = useRef<{ key: string; body: CreateInquiryBody } | null>(null);
  const pendingMessage = useRef<{ key: string; inquiryId: number; body: AddMessageBody } | null>(null);

  useEffect(() => {
    // 외부(싱크노트)에서 진입 정보와 함께 들어오면 기존 상담에 이어 보내지 않고 새 문의 흐름
    // query 없는 일반 재접속은 기존 상담 복원
     
    setInquiryId(entry.hasEntry ? null : readStored(storageKey));
    setEnv(initialEnv(entry));
    setReady(true);
  }, [entry, storageKey]);

  const chat = useInquiryChat(inquiryId);
  const messages = useMemo(() => chat.messages.map(toMessage), [chat.messages]);
  const rawById = useMemo(() => new Map(chat.messages.map((m) => [String(m.message_id), m])), [chat.messages]);
  useAnswerNotifier(inquiryId ? String(inquiryId) : null, messages);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // 저장된 상담이 없어졌거나 내 것이 아니면(404) 새 상담으로
  useEffect(() => {
    if (chat.error?.code === "INQUIRY_NOT_FOUND" && inquiryId) {
      writeStored(storageKey, null);
       
      setInquiryId(null);
    }
  }, [chat.error, inquiryId, storageKey]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: PendingFile[] = Array.from(list).map((file) => ({
      file,
      local: URL.createObjectURL(file),
      error: !ACCEPT.includes(file.type) ? "png·jpg·pdf만 가능해요" : file.size > MAX_FILE ? "파일당 10MB까지 가능해요" : undefined,
    }));
    setFiles((f) => [...f, ...next].slice(0, 10));
    if (next.some((n) => n.file.type.startsWith("image/") && !n.error)) {
      setNotice("이미지에 카드번호·이메일 같은 개인정보가 보이지 않게 가려주세요.");
    }
    for (const n of next) {
      if (n.error) continue;
      try {
        const att = await inquiryApi.upload(n.file);
        setFiles((f) => f.map((x) => (x.local === n.local ? { ...x, att } : x)));
      } catch (e) {
        setFiles((f) => f.map((x) => (x.local === n.local ? { ...x, error: inquiryErrorMessage(e) } : x)));
      }
    }
  }

  async function createInquiry(message: string, attachments: number[]) {
    const body: CreateInquiryBody = {
      message,
      env: { ...env },
      attachments,
      ...(entry.cid ? { source_customer_id: entry.cid } : {}),
      ...(toBackendCategory(category) ? { customer_category: toBackendCategory(category) } : {}),
    };
    const prev = pendingCreate.current;
    const key = prev && same(prev.body, body) ? prev.key : newIdempotencyKey();
    pendingCreate.current = { key, body };
    const r = await inquiryApi.create(body, key);
    pendingCreate.current = null;
    writeStored(storageKey, r.inquiry_id);
    setInquiryId(r.inquiry_id);
    // 생성 성공 후 진입 query 제거 (실패 시에는 유지)
    if (params.toString()) router.replace("/chat", { scroll: false });
  }

  async function addMessage(id: number, body: AddMessageBody) {
    const prev = pendingMessage.current;
    const key = prev && prev.inquiryId === id && same(prev.body, body) ? prev.key : newIdempotencyKey();
    pendingMessage.current = { key, inquiryId: id, body };
    await inquiryApi.addMessage(id, body, key);
    pendingMessage.current = null;
    chat.poke();
  }

  async function send() {
    if (sending || files.some((f) => !f.att && !f.error)) return;
    const attachments = files.filter((f) => f.att).map((f) => f.att!.attachment_id);
    if (!text.trim()) {
      if (attachments.length) setError({ msg: "첨부와 함께 보낼 메시지를 입력해 주세요." });
      return;
    }
    const { out, masked } = maskSensitive(text);
    if (masked) setNotice("카드번호·주민번호로 보이는 내용을 가려서 보냈어요.");
    setSending(true);
    setError(null);
    try {
      if (!inquiryId || chat.status === "closed") {
        await createInquiry(out, attachments);
      } else {
        try {
          await addMessage(inquiryId, { text: out, attachments });
        } catch (e) {
          // 종료됐거나 사라진 상담 → 새 문의로 접수
          if (e instanceof AuthApiError && (e.code === "INQUIRY_CLOSED" || e.code === "INQUIRY_NOT_FOUND")) {
            pendingMessage.current = null;
            await createInquiry(out, attachments);
          } else throw e;
        }
      }
      setText("");
      setFiles([]);
    } catch (e) {
      // 실패 시 입력·첨부·진입 정보·요청 키를 그대로 유지 → 다시 보내기
      setError({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    writeStored(storageKey, null);
    pendingCreate.current = null;
    pendingMessage.current = null;
    setInquiryId(null);
    setCategory(null);
    setText("");
    setFiles([]);
    setNotice(null);
    setError(null);
  }

  const status = chat.status;
  const closed = status === "closed";
  const uploading = files.some((f) => !f.att && !f.error);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#eef2ff,transparent_60%)] p-0 sm:p-6">
      <div className="flex h-dvh w-full max-w-[440px] flex-col overflow-hidden bg-white sm:h-[min(780px,calc(100dvh-48px))] sm:rounded-3xl sm:border sm:border-zinc-200 sm:shadow-xl sm:shadow-zinc-900/5">
        {/* 헤더 */}
        <header className="border-b border-zinc-100 px-5 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar size="md" />
              <div>
                <p className="text-[15px] font-semibold text-zinc-900">{SERVICE} 고객센터</p>
                <p className="text-[12px] text-zinc-500">평일 10:00 ~ 19:00 · 담당자 확인 후 답변</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {inquiryId && (
                <button onClick={newChat} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100" title="새 상담">
                  <RotateCcw className="size-3.5" /> 새 상담
                </button>
              )}
              <button
                onClick={() => {
                  logout();
                  router.replace(loginHref("/login", "/chat"));
                }}
                className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                title={user ? `${user.email} 로그아웃` : "로그아웃"}
                aria-label="로그아웃"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
          {status && <StatusBar status={status} />}
        </header>
        <NotifyPrompt show={!!inquiryId && !closed} />

        {/* 메시지 */}
        <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 px-4 py-5">
          {entry.hasEntry && <EntryCard entry={entry} />}

          <BotBubble>
            안녕하세요, {SERVICE}입니다 👋
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
                      category === c ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageItem key={m.id} m={m} attachments={rawById.get(m.id)?.attachments ?? []} />
          ))}

          {chat.error && chat.error.code !== "INQUIRY_NOT_FOUND" && (
            <p className="text-center text-[12px] text-zinc-400">대화를 불러오는 중 문제가 생겼어요. 잠시 후 자동으로 다시 시도해요.</p>
          )}
          {closed && <p className="py-2 text-center text-[12px] text-zinc-400">상담이 종료되었어요. 새 메시지를 보내면 새 문의로 접수됩니다.</p>}
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
          {error && (
            <div className="mb-2 flex items-center gap-2 px-1 text-[12px] text-red-600">
              <span className="flex-1">
                {error.msg}
                {error.rid && <span className="ml-1 font-mono text-[10px] text-red-300">{error.rid}</span>}
              </span>
              <button onClick={send} disabled={sending} className="shrink-0 font-medium underline underline-offset-2">
                다시 보내기
              </button>
            </div>
          )}

          {!inquiryId && (
            <div className="mb-2">
              <button
                onClick={() => setEnvOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-zinc-500 hover:text-zinc-700"
              >
                <Monitor className="size-3.5" />
                <span className="truncate">
                  {[env.os, env.app_version && `v${env.app_version}`, env.error_code].filter(Boolean).join(" · ") || "발생 환경"}
                  {entry.hasEntry ? " · 앱에서 전달" : " · 자동 수집"}
                </span>
                <ChevronDown className={cn("ml-auto size-3.5 transition", envOpen && "rotate-180")} />
              </button>
              {envOpen && (
                <div className="mt-1 grid grid-cols-3 gap-1.5 px-1">
                  <EnvInput label="OS" value={env.os} max={200} onChange={(v) => setEnv({ ...env, os: v || null })} />
                  <EnvInput label="앱 버전" value={env.app_version} max={100} onChange={(v) => setEnv({ ...env, app_version: v || null })} />
                  <EnvInput label="오류 코드" placeholder="E-502" value={env.error_code} max={100} onChange={(v) => setEnv({ ...env, error_code: v.toUpperCase() || null })} />
                </div>
              )}
            </div>
          )}

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
                  <span className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/55 px-1 text-[9.5px] text-white" title={f.error}>
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
              disabled={files.length >= 10}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 disabled:text-zinc-300"
              aria-label="파일 첨부"
              title="이미지·PDF 첨부 (파일당 10MB, 최대 10개)"
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
              maxLength={10000}
              placeholder={closed ? "새 문의를 남겨주세요" : "메시지를 입력하세요"}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] outline-none placeholder:text-zinc-400"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim() || uploading}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:bg-zinc-200 disabled:text-zinc-400"
              aria-label="보내기"
            >
              <ArrowUp className="size-[18px]" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            데모 화면 ·{" "}
            <a href={ADMIN_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              담당자 어드민 열기
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- 하위 컴포넌트 --------------------------------- */

const STEPS: Array<{ key: BackendStatus; label: string }> = [
  { key: "received", label: "접수" },
  { key: "in_review", label: "담당자 확인 중" },
  { key: "answered", label: "답변 완료" },
  { key: "closed", label: "상담 종료" },
];

function StatusBar({ status }: { status: BackendStatus }) {
  const needs = status === "needs_info";
  const idx = needs ? 1 : STEPS.findIndex((s) => s.key === status);
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={s.key} className="flex flex-1 flex-col gap-1">
            <div className={cn("h-1 rounded-full", done ? "bg-indigo-600" : active ? (needs ? "bg-amber-500" : "bg-indigo-600") : "bg-zinc-200")} />
            <span className={cn("text-[11px]", active ? (needs ? "font-semibold text-amber-600" : "font-semibold text-indigo-700") : done ? "text-zinc-500" : "text-zinc-400")}>
              {needs && i === 1 ? "추가 정보 필요" : s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 싱크노트 앱에서 넘어온 진입 정보 */
function EntryCard({ entry }: { entry: EntryInfo }) {
  const chips = [entry.os, entry.appVersion && `앱 ${entry.appVersion}`].filter(Boolean) as string[];
  return (
    <div className="animate-fade-up rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-900">
        <Link2 className="size-3.5" /> {SERVICE}에서 연결됨
      </p>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-indigo-800 ring-1 ring-indigo-100">
              {c}
            </span>
          ))}
        </div>
      )}
      {entry.errorCode && (
        <p className="mt-2 text-[12.5px] text-indigo-900">
          <span className="rounded bg-red-100 px-1 py-px font-mono text-[11.5px] font-semibold text-red-700">{entry.errorCode}</span> 오류 정보가 함께
          전달돼요
        </p>
      )}
    </div>
  );
}

function Avatar({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-indigo-600 font-bold text-white", size === "md" ? "size-9 text-[13px]" : "mt-0.5 size-8 text-[11px]")}>
      S
    </span>
  );
}

function EnvInput({ label, value, onChange, placeholder, max }: { label: string; value: string | null; onChange: (v: string) => void; placeholder?: string; max: number }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-zinc-400">{label}</span>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        maxLength={max}
        onChange={(e) => onChange(e.target.value.trim())}
        className="h-7 rounded-md border border-zinc-200 px-2 text-[12px] outline-none focus:border-zinc-400"
      />
    </label>
  );
}

function BotBubble({ children, label, time }: { children: React.ReactNode; label?: string; time?: string }) {
  return (
    <div className="flex animate-fade-up gap-2">
      <Avatar />
      <div className="max-w-[80%]">
        {label && <p className="mb-1 text-[11px] text-zinc-500">{label}</p>}
        <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-zinc-800 ring-1 ring-zinc-200/70">{children}</div>
        {time && <p className="mt-1 text-[10.5px] text-zinc-400">{time}</p>}
      </div>
    </div>
  );
}

function MessageItem({ m, attachments }: { m: Message; attachments: AttachmentMeta[] }) {
  const time = formatTime(m.createdAt);
  if (m.role === "customer") {
    return (
      <div className="flex animate-fade-up flex-col items-end">
        {m.text && <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tr-md bg-zinc-900 px-3.5 py-2.5 text-[14px] leading-relaxed text-white">{m.text}</div>}
        {attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {attachments.map((a) => (
              <RemoteAttachment key={a.attachment_id} a={a} />
            ))}
          </div>
        )}
        <p className="mt-1 text-[10.5px] text-zinc-400">{time}</p>
      </div>
    );
  }
  return (
    <BotBubble label={m.role === "ai" ? (m.kind === "info_request" ? "자동 안내 · 정보 요청" : "자동 안내") : "상담원"} time={time}>
      {m.text}
    </BotBubble>
  );
}
