"use client";

import { AlertTriangle, ArrowUp, ChevronDown, FileText, History, Link2, LogOut, MessageSquare, Monitor, Paperclip, RotateCcw, X } from "lucide-react";
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
  type CustomerInquirySummary,
  type InquiryChatResponse,
  type InquiryEnv,
  type ResponseProgressState,
  LIVE_INQUIRY_ID,
} from "@moa/shared/inquiry";
import { FeedbackCard } from "./feedback-card";
import { CATEGORIES, CATEGORY_LABEL } from "@moa/shared/labels";
import type { Category, Message } from "@moa/shared/types";
import { ADMIN_URL } from "@moa/shared/urls";
import { cn, formatBytes, formatDateTime, formatTime } from "@moa/shared/utils";
import { RemoteAttachment, RichText } from "@moa/ui";
import { useReadReceipt } from "@moa/shared/use-read-receipt";
import { NotifyPrompt, useAnswerNotifier } from "./answer-notifier";
import { initialEnv, loginHref, readEntry, type EntryInfo } from "./entry";
import { useInquiryHistory } from "./inquiry-history";
import { useInquiryChat } from "./use-inquiry-chat";

const SERVICE = "싱크노트";
// v2: 문의 ID가 문자열(Q-1006)로 바뀌어 이전 숫자 저장값과 분리
const STORAGE_BASE = "moa.chat.inquiry.v2";
const MAX_FILE = 10 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "application/pdf"];

function readStored(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && LIVE_INQUIRY_ID.test(v) ? v : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, id: string | null) {
  try {
    if (id) localStorage.setItem(key, id);
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
    id: m.message_id,
    role: m.sender === "customer" ? "customer" : m.sender === "agent" ? "agent" : "ai",
    kind: m.message_type === "접수 안내" ? "receipt" : m.message_type === "정보 수집 질문" ? "info_request" : m.message_type === "최종 답변" ? "answer" : "text",
    text: m.text,
    createdAt: m.sent_at,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 화면에 쓸 진행 상태. 서버 response_progress가 기준이고 프론트는 추정하지 않는다.
 * - 방금 보낸 메시지(expected)를 서버가 아직 반영하지 않았으면 이전 결과 대신 analyzing
 * - 기준 고객 메시지가 아직 로드되지 않았거나 알고 있는 최신 고객 메시지보다 이전 기준이면 활성 상태로 쓰지 않음
 * - 최신 여부는 누적 메시지의 서버 순서로 판단 (ID 숫자 파싱 X)
 */
function resolveProgress(
  inquiryId: string | null,
  live: InquiryChatResponse | null,
  raw: BackendMessage[],
  expected: { inquiryId: string; messageId: string | null } | null,
): ResponseProgressState | null {
  if (!inquiryId) return null;
  const exp = expected?.inquiryId === inquiryId ? expected : null;
  if (!live) return exp ? "analyzing" : null; // 접수 직후 첫 조회 전
  if (live.status === "상담 종료") return "closed";
  const p = live.response_progress;
  if (!p) return null; // 구버전 응답: status·메시지만 표시

  const order = new Map<string, number>();
  raw.forEach((m, i) => {
    if (m.sender === "customer") order.set(m.message_id, i);
  });
  const basis = p.based_on_message_id;
  const basisAt = basis ? order.get(basis) : undefined;
  if (basis && basisAt === undefined) return exp ? "analyzing" : null;

  if (exp?.messageId) {
    const mine = order.get(exp.messageId);
    const caughtUp = basis === exp.messageId || (basisAt !== undefined && mine !== undefined && basisAt > mine);
    if (!caughtUp) return "analyzing";
  }
  if (basisAt !== undefined && basisAt < Math.max(-1, ...order.values())) return null;
  return p.state;
}

interface Stage {
  idx: number;
  /** 두 번째 단계 이름 (AI 확인 중·담당자 확인 중·추가 정보 필요) */
  label: string;
  desc: string;
  warn: boolean;
}

const STAGE_DESC = ["문의가 접수됐어요", "문의 내용을 확인하고 있어요", "답변을 확인해 주세요", "상담이 마무리됐어요"];

/** 상단 진행 바·사이드 패널 표시 — response_progress 우선, 없으면 기존 status */
function stageOf(status: BackendStatus, progress: ResponseProgressState | null): Stage {
  const base = { label: "확인 중", warn: false };
  if (status === "상담 종료" || progress === "closed") return { ...base, idx: 3, desc: STAGE_DESC[3] };
  switch (progress) {
    case "analyzing":
      return { idx: 1, label: "AI 확인 중", desc: "AI가 문의 내용을 확인하고 있어요", warn: false };
    case "awaiting_customer":
      return { idx: 1, label: "추가 정보 필요", desc: "요청한 정보를 채팅으로 보내주세요", warn: true };
    case "waiting_agent":
      return { idx: 1, label: "담당자 확인 중", desc: "담당자에게 전달했어요. 확인 후 답변드릴게요", warn: false };
    case "answered":
      return { ...base, idx: 2, desc: STAGE_DESC[2] };
  }
  if (status === "추가 정보 필요") return { idx: 1, label: "추가 정보 필요", desc: "요청한 정보를 채팅으로 보내주세요", warn: true };
  if (status === "담당자 확인 중") return { idx: 1, label: "담당자 확인 중", desc: STAGE_DESC[1], warn: false };
  const idx = status === "답변 완료" ? 2 : 0;
  return { ...base, idx, desc: STAGE_DESC[idx] };
}

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

  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [env, setEnv] = useState<InquiryEnv>({ os: null, app_version: null, error_code: null });
  const [envOpen, setEnvOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 실패한 요청의 키·본문 보관 → 같은 내용 재시도는 같은 Idempotency-Key
  const pendingCreate = useRef<{ key: string; body: CreateInquiryBody } | null>(null);
  const pendingMessage = useRef<{ key: string; inquiryId: string; body: AddMessageBody } | null>(null);
  // 방금 접수된 고객 메시지 기준 — 서버 진행 상태가 이 메시지(또는 더 최신 메시지)를 기준으로 바뀌기 전까지
  // 이전 메시지의 '답변 완료'·이관 안내를 새 결과처럼 보여주지 않음. messageId null = 새 문의(첫 응답이면 충분)
  const [expected, setExpected] = useState<{ inquiryId: string; messageId: string | null } | null>(null);

  useEffect(() => {
    // 외부(싱크노트)에서 진입 정보와 함께 들어오면 기존 상담에 이어 보내지 않고 새 문의 흐름
    // query 없는 일반 재접속은 기존 상담 복원
     
    setInquiryId(entry.hasEntry ? null : readStored(storageKey));
    setEnv(initialEnv(entry));
    setReady(true);
  }, [entry, storageKey]);

  const chat = useInquiryChat(inquiryId);

  // 지난 상담 목록 (서버 GET /api/v1/inquiries)
  const history = useInquiryHistory(!!user);
  const refreshHistory = history.refresh;
  // 보고 있는 상담의 상태가 바뀌면 목록도 첫 페이지부터 다시 조회
  useEffect(() => {
    if (chat.status) refreshHistory();
  }, [chat.status, refreshHistory]);
  // 목록의 현재 상담 상태는 3초 폴링 중인 대화 응답이 더 최신
  const historyItems = useMemo(
    () => history.items.map((h) => (h.inquiry_id === inquiryId && chat.status ? { ...h, status: chat.status } : h)),
    [history.items, inquiryId, chat.status],
  );
  const messages = useMemo(() => chat.messages.map(toMessage), [chat.messages]);
  // 고정 접수 안내는 화면에서만 숨김 (원본은 cursor·읽음·알림 계산에 그대로 사용)
  const visibleMessages = useMemo(() => messages.filter((m) => m.kind !== "receipt"), [messages]);
  // 문의 전환 직후 한 번은 이전 문의의 응답이 남아 있으므로 현재 문의 응답만 사용
  const live = chat.latest && chat.latest.inquiry_id === inquiryId ? chat.latest : null;
  const progress = useMemo(() => resolveProgress(inquiryId, live, chat.messages, expected), [inquiryId, live, chat.messages, expected]);
  const stage = live ? stageOf(live.status, progress) : null;

  // 서버가 analyzing을 오래 유지하면 지연 안내만 추가 (시간 경과로 이관 처리하지 않음)
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (progress !== "analyzing") return;
    const t = setTimeout(() => setSlow(true), 45_000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [progress, expected]);
  const rawById = useMemo(() => new Map(chat.messages.map((m) => [m.message_id, m])), [chat.messages]);
  useAnswerNotifier(inquiryId, messages);

  // 담당자가 읽은 위치까지의 내 메시지에 '읽음'
  const msgIndex = useMemo(() => new Map(messages.map((m, i) => [m.id, i])), [messages]);
  const agentRead = chat.latest?.agent_last_read_message_id ?? null;
  const readUpTo = agentRead ? (msgIndex.get(agentRead) ?? -1) : -1;

  // 화면을 보고 있을 때 마지막 메시지까지 읽음 처리
  useReadReceipt(inquiryId, messages.length ? messages[messages.length - 1].id : null, inquiryApi.read);

  // 상담 이탈·복귀 기록: 들어오면 returned, 창을 닫으면 left (keepalive)
  const presenceId = chat.status && chat.status !== "상담 종료" ? inquiryId : null;
  useEffect(() => {
    if (!presenceId) return;
    inquiryApi.sessionEvent(presenceId, "returned").catch(() => {});
    const onHide = () => {
      inquiryApi.sessionEvent(presenceId, "left", { keepalive: true }).catch(() => {});
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) inquiryApi.sessionEvent(presenceId, "returned").catch(() => {});
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [presenceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, progress]);

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

  async function createInquiry(message: string, attachments: string[]) {
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
    setExpected({ inquiryId: r.inquiry_id, messageId: null });
    writeStored(storageKey, r.inquiry_id);
    refreshHistory();
    setInquiryId(r.inquiry_id);
    // 생성 성공 후 진입 query 제거 (실패 시에는 유지)
    if (params.toString()) router.replace("/chat", { scroll: false });
  }

  async function addMessage(id: string, body: AddMessageBody) {
    const prev = pendingMessage.current;
    const key = prev && prev.inquiryId === id && same(prev.body, body) ? prev.key : newIdempotencyKey();
    pendingMessage.current = { key, inquiryId: id, body };
    const r = await inquiryApi.addMessage(id, body, key);
    pendingMessage.current = null;
    setExpected({ inquiryId: id, messageId: r.message_id });
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
      if (!inquiryId || chat.status === "상담 종료") {
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

  function leaveAndLogout() {
    if (inquiryId && chat.status !== "상담 종료") inquiryApi.sessionEvent(inquiryId, "left", { keepalive: true }).catch(() => {});
    logout();
  }

  function resetComposer() {
    pendingCreate.current = null;
    pendingMessage.current = null;
    setExpected(null);
    setCategory(null);
    setText("");
    setFiles([]);
    setNotice(null);
    setError(null);
  }

  function newChat() {
    // 담당자에게 '새 상담을 시작해 나감'으로 표시
    if (inquiryId && chat.status !== "상담 종료") inquiryApi.sessionEvent(inquiryId, "new_chat").catch(() => {});
    writeStored(storageKey, null);
    setInquiryId(null);
    resetComposer();
    setHistoryOpen(false);
  }

  /** 지난 상담 열기 — 진행 중이면 이어서 대화, 종료됐으면 내용 확인 후 새 메시지는 새 문의로 접수 */
  function openInquiry(id: string) {
    setHistoryOpen(false);
    if (id === inquiryId) return;
    if (inquiryId && chat.status !== "상담 종료") inquiryApi.sessionEvent(inquiryId, "left", { keepalive: true }).catch(() => {});
    writeStored(storageKey, id);
    setInquiryId(id);
    resetComposer();
  }

  const status = chat.status;
  const closed = status === "상담 종료";
  const uploading = files.some((f) => !f.att && !f.error);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#eef2ff,transparent_60%)] p-0 sm:p-6 md:block md:bg-zinc-50 md:p-0">
      <div className="flex h-dvh w-full max-w-[440px] overflow-hidden bg-white sm:h-[min(780px,calc(100dvh-48px))] sm:rounded-3xl sm:border sm:border-zinc-200 sm:shadow-xl sm:shadow-zinc-900/5 md:h-dvh md:max-w-none md:rounded-none md:border-0 md:shadow-none">
        {/* 데스크톱 사이드 패널 */}
        <SidePanel
          entry={entry}
          stage={stage}
          inquiryId={inquiryId}
          email={user?.email}
          history={historyItems}
          historyMore={history.hasMore ? { loading: history.loading, onMore: history.loadMore } : null}
          onOpenInquiry={openInquiry}
          onNewChat={newChat}
          onLogout={() => {
            leaveAndLogout();
            router.replace(loginHref("/login", "/chat"));
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
        {/* 헤더 */}
        <header className="border-b border-zinc-100 px-5 pb-3 pt-4 md:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar size="md" />
              <div>
                <p className="text-[15px] font-semibold text-zinc-900">{SERVICE} 고객센터</p>
                <p className="text-[12px] text-zinc-500">평일 10:00 ~ 19:00 · 담당자 확인 후 답변</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {historyItems.length > 0 && (
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100", historyOpen && "bg-zinc-100 text-zinc-800")}
                  aria-expanded={historyOpen}
                  title="지난 상담"
                >
                  <History className="size-3.5" /> 기록
                </button>
              )}
              {inquiryId && (
                <button onClick={newChat} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100" title="새 상담">
                  <RotateCcw className="size-3.5" /> 새 상담
                </button>
              )}
              <button
                onClick={() => {
                  leaveAndLogout();
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
          {stage && <StatusBar stage={stage} />}
          {historyOpen && (
            <div className="mt-3 max-h-[50dvh] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5">
              <HistoryList items={historyItems} activeId={inquiryId} onOpen={openInquiry} more={history.hasMore ? { loading: history.loading, onMore: history.loadMore } : null} />
            </div>
          )}
        </header>
        <div className="hidden items-center gap-4 border-b border-zinc-100 px-8 py-4 md:flex">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900">{!inquiryId ? "새 문의" : closed ? "지난 상담" : "상담 중"}</p>
            <p className="text-[12.5px] text-zinc-500">{inquiryId ? `문의 번호 ${inquiryId}` : "궁금한 점을 남기면 담당자가 확인 후 답변드려요"}</p>
          </div>
          {stage && (
            <div className="ml-auto w-[420px]">
              <StatusBar stage={stage} />
            </div>
          )}
        </div>
        <div className="md:mx-auto md:w-full md:max-w-3xl">
          <NotifyPrompt show={!!inquiryId && !closed} />
        </div>

        {/* 메시지 */}
        <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto bg-zinc-50/50 px-4 py-5 md:px-8 md:py-8">
          <div className="space-y-3 md:mx-auto md:max-w-3xl md:space-y-4">
          {entry.hasEntry && (
            <div className="md:hidden">
              <EntryCard entry={entry} />
            </div>
          )}

          <BotBubble>
            안녕하세요, {SERVICE}입니다 👋
            <br />
            궁금한 점이나 불편한 점을 남겨주세요.
            <br />
            AI가 먼저 답변드리고, 확인이 더 필요하면 담당자가 이어서 답변드려요.
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

          {visibleMessages.map((m) => (
            <MessageItem key={m.id} m={m} attachments={rawById.get(m.id)?.attachments ?? []} read={m.role === "customer" && readUpTo >= 0 && msgIndex.get(m.id)! <= readUpTo} />
          ))}

          {/* 진행 말풍선 — 화면 표시용 (저장·알림 대상 아님) */}
          {progress === "analyzing" && (
            <BotBubble label="AI">
              <TypingDots />
              {slow && <span className="mt-1 block text-[12px] text-zinc-500">답변을 준비하는 데 시간이 조금 걸리고 있어요. 잠시만 기다려 주세요.</span>}
            </BotBubble>
          )}
          {progress === "waiting_agent" && (
            <BotBubble>
              <span role="status">담당자에게 전달했어요. 확인 후 답변드릴게요.</span>
            </BotBubble>
          )}

          {chat.error && chat.error.code !== "INQUIRY_NOT_FOUND" && (
            <p className="text-center text-[12px] text-zinc-400">대화를 불러오는 중 문제가 생겼어요. 잠시 후 자동으로 다시 시도해요.</p>
          )}
          {closed && inquiryId && chat.latest?.feedback_requested && (
            <FeedbackCard inquiryId={inquiryId} submitted={!!chat.latest.feedback_submitted} feedback={chat.latest.feedback ?? null} onDone={chat.poke} />
          )}
          {closed && <p className="py-2 text-center text-[12px] text-zinc-400">상담이 종료되었어요. 새 메시지를 보내면 새 문의로 접수됩니다.</p>}
          </div>
        </div>

        {/* 입력 */}
        <div className="border-t border-zinc-100 bg-white px-3 pb-3 pt-2 md:px-8 md:pb-5 md:pt-3">
          <div className="md:mx-auto md:max-w-3xl">
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
                  {[env.os, env.app_version && `앱 ${env.app_version}`, env.error_code].filter(Boolean).join(" · ") || "발생 환경"}
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
          <p className="mt-2 text-center text-[11px] text-zinc-400 md:hidden">
            데모 화면 ·{" "}
            <a href={ADMIN_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              담당자 어드민 열기
            </a>
          </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- 하위 컴포넌트 --------------------------------- */

const STEPS = ["접수", "확인 중", "답변 완료", "상담 종료"] as const;
const stepLabel = (stage: Stage, i: number) => (i === 1 ? stage.label : STEPS[i]);

/** 데스크톱·태블릿(md 768px 이상) 왼쪽 패널 — 고객센터 정보·진행 상태·진입 정보·계정 */
function SidePanel({
  entry,
  stage,
  inquiryId,
  email,
  history,
  historyMore,
  onOpenInquiry,
  onNewChat,
  onLogout,
}: {
  entry: EntryInfo;
  stage: Stage | null;
  inquiryId: string | null;
  email?: string;
  history: CustomerInquirySummary[];
  historyMore: HistoryMore;
  onOpenInquiry: (id: string) => void;
  onNewChat: () => void;
  onLogout: () => void;
}) {
  const idx = stage?.idx ?? -1;
  const needs = !!stage?.warn;
  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-r border-zinc-200/80 bg-white md:flex">
      <div className="flex items-center gap-3 px-7 pb-6 pt-7">
        <Avatar size="md" />
        <div>
          <p className="text-[16px] font-semibold text-zinc-900">{SERVICE} 고객센터</p>
          <p className="text-[12.5px] text-zinc-500">평일 10:00 ~ 19:00</p>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-7 pb-6">
        {entry.hasEntry && <EntryCard entry={entry} />}

        <section>
          <p className="mb-3 text-[12px] font-semibold text-zinc-500">상담 진행</p>
          {stage ? (
            <ol className="relative space-y-4">
              {STEPS.map((s, i) => {
                const active = i === idx;
                const done = i < idx;
                return (
                  <li key={s} className="relative flex gap-3">
                    {i < STEPS.length - 1 && <span className={cn("absolute left-[9px] top-6 h-[calc(100%-4px)] w-px", done ? "bg-indigo-600" : "bg-zinc-200")} />}
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border-2",
                        done ? "border-indigo-600 bg-indigo-600" : active ? (needs ? "border-amber-500 bg-white" : "border-indigo-600 bg-white") : "border-zinc-200 bg-white",
                      )}
                    >
                      {done && <span className="size-1.5 rounded-full bg-white" />}
                      {active && <span className={cn("size-2 rounded-full", needs ? "bg-amber-500" : "bg-indigo-600")} />}
                    </span>
                    <div>
                      <p className={cn("text-[13.5px]", active ? (needs ? "font-semibold text-amber-700" : "font-semibold text-zinc-900") : done ? "text-zinc-700" : "text-zinc-400")}>
                        {stepLabel(stage, i)}
                      </p>
                      {active && <p className="mt-0.5 text-[12px] text-zinc-500">{stage.desc}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[13px] leading-relaxed text-zinc-500">메시지를 보내면 바로 접수되고, 진행 상황이 여기에 표시돼요.</p>
          )}
          {inquiryId && <p className="mt-4 font-mono text-[11.5px] text-zinc-400">문의 번호 {inquiryId}</p>}
        </section>

        {history.length > 0 && (
          <section>
            <p className="mb-2 text-[12px] font-semibold text-zinc-500">지난 상담</p>
            <HistoryList items={history} activeId={inquiryId} onOpen={onOpenInquiry} more={historyMore} />
          </section>
        )}

        <section className="rounded-xl bg-zinc-50 px-4 py-3.5 text-[12.5px] leading-relaxed text-zinc-600">
          <p className="mb-1.5 font-semibold text-zinc-700">이렇게 남겨주시면 빨라요</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>오류 코드나 화면 캡처를 함께 보내주세요</li>
            <li>캡처에 개인정보가 보이면 가려주세요</li>
            <li>창을 닫아도 대화는 그대로 남아요</li>
          </ul>
        </section>
      </div>

      <div className="space-y-1 border-t border-zinc-100 px-4 py-3">
        {inquiryId && (
          <button onClick={onNewChat} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-600 hover:bg-zinc-100">
            <RotateCcw className="size-4" /> 새 상담 시작
          </button>
        )}
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-[12px] font-semibold uppercase text-zinc-600">{email?.[0] ?? "?"}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-600">{email}</span>
          <button onClick={onLogout} className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="로그아웃" title="로그아웃">
            <LogOut className="size-4" />
          </button>
        </div>
        <a href={ADMIN_URL} target="_blank" rel="noreferrer" className="block px-3 pt-1 text-[11.5px] text-zinc-400 hover:text-zinc-600">
          데모 화면 · 담당자 어드민 열기
        </a>
      </div>
    </aside>
  );
}

type HistoryMore = { loading: boolean; onMore: () => void } | null;

/** 이 계정으로 남긴 상담 목록 (최근 접수순, 서버 기준) */
function HistoryList({ items, activeId, onOpen, more }: { items: CustomerInquirySummary[]; activeId: string | null; onOpen: (id: string) => void; more: HistoryMore }) {
  return (
    <ul className="space-y-0.5">
      {items.map((h) => {
        const active = h.inquiry_id === activeId;
        return (
          <li key={h.inquiry_id}>
            <button
              onClick={() => onOpen(h.inquiry_id)}
              aria-current={active ? "true" : undefined}
              className={cn("flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition", active ? "bg-indigo-50" : "hover:bg-zinc-100")}
            >
              <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", active ? "text-indigo-600" : "text-zinc-400")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", active ? "font-semibold text-indigo-900" : "text-zinc-800")}>{h.title || `문의 ${h.inquiry_id}`}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="font-mono">{h.inquiry_id}</span>
                  <span>· {formatDateTime(h.created_at)}</span>
                  {h.status && <span className={cn(h.status === "상담 종료" ? "text-zinc-400" : h.status === "답변 완료" ? "text-indigo-600" : "text-amber-600")}>· {h.status}</span>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {more && (
        <li>
          <button onClick={more.onMore} disabled={more.loading} className="w-full rounded-lg px-2.5 py-2 text-center text-[12px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-60">
            {more.loading ? "불러오는 중…" : "이전 상담 더 보기"}
          </button>
        </li>
      )}
    </ul>
  );
}

function StatusBar({ stage }: { stage: Stage }) {
  const { idx, warn: needs } = stage;
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={s} className="flex flex-1 flex-col gap-1">
            <div className={cn("h-1 rounded-full", done ? "bg-indigo-600" : active ? (needs ? "bg-amber-500" : "bg-indigo-600") : "bg-zinc-200")} />
            <span className={cn("text-[11px]", active ? (needs ? "font-semibold text-amber-600" : "font-semibold text-indigo-700") : done ? "text-zinc-500" : "text-zinc-400")}>
              {stepLabel(stage, i)}
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

/** AI 처리 중 — 마운트 시 한 번만 안내 (폴링마다 다시 읽지 않음) */
function TypingDots() {
  return (
    <span className="moa-typing" role="status" aria-live="polite">
      <span className="sr-only">AI가 답변을 준비하고 있어요.</span>
      {[0, 150, 300].map((delay) => (
        <span key={delay} aria-hidden="true" className="moa-typing-dot" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

/** 발송 주체 라벨 — sender와 message_type을 함께 보고 결정 (본문 내용으로 추정하지 않음) */
function senderLabel(m: Message) {
  if (m.role === "agent") return "담당자 답변";
  if (m.kind === "info_request") return "AI · 추가 질문";
  if (m.kind === "answer") return "AI 답변";
  return "자동 안내";
}

function MessageItem({ m, attachments, read }: { m: Message; attachments: AttachmentMeta[]; read?: boolean }) {
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
        <p className="mt-1 text-[10.5px] text-zinc-400">
          {read && <span className="mr-1 font-medium text-indigo-600">읽음</span>}
          {time}
        </p>
      </div>
    );
  }
  return (
    <BotBubble label={senderLabel(m)} time={time}>
      <RichText text={m.text} />
    </BotBubble>
  );
}
