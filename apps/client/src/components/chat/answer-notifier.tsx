"use client";

import { Bell, BellRing, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@moa/shared/types";

/**
 * 4-5 채팅 상담: "창을 닫아도 대화 유지, 답변 시 알림".
 * - 다른 탭을 보고 있을 때 담당자 답변·정보 요청·별점 요청이 오면 브라우저 알림 + 탭 제목 표시
 * - 브라우저를 완전히 닫은 상태의 알림(Web Push)은 서버의 push 구독이 필요해 백엔드 연동 후 추가
 */

const DISMISS_KEY = "moa.chat.notifyDismissed";
const BASE_TITLE = "고객센터 채팅";

function notifiable(m: Message) {
  return m.role === "agent" || m.kind === "info_request" || m.kind === "rating_request";
}

function notifyText(m: Message) {
  if (m.kind === "rating_request") return { title: "상담이 종료되었어요", body: "답변은 만족스러우셨나요? 별점을 남겨주세요." };
  if (m.kind === "info_request") return { title: "추가 정보가 필요해요", body: m.text };
  return { title: "싱크노트 상담원이 답변했어요", body: m.text };
}

function supported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function useAnswerNotifier(inquiryId: string | null, messages: Message[]) {
  const seen = useRef<Set<string> | null>(null);
  const seenFor = useRef<string | null>(null);
  const [unread, setUnread] = useState(0);

  // 문의가 바뀌면 기준선 초기화 (처음 불러온 메시지는 알리지 않음)
  useEffect(() => {
    if (seenFor.current !== inquiryId) {
      seenFor.current = inquiryId;
      seen.current = null;
    }
  }, [inquiryId]);

  useEffect(() => {
    if (!inquiryId || messages.length === 0) return;
    if (seen.current === null) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(m.id));
    fresh.forEach((m) => seen.current!.add(m.id));
    const targets = fresh.filter(notifiable);
    if (!targets.length || document.visibilityState === "visible") return;

    setUnread((n) => n + targets.length);
    if (supported() && Notification.permission === "granted") {
      const last = targets[targets.length - 1];
      const { title, body } = notifyText(last);
      try {
        const n = new Notification(title, { body: body.slice(0, 120), tag: `moa-${inquiryId}`, icon: "/favicon.ico" });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // 일부 모바일 브라우저는 페이지에서 직접 Notification 생성 불가 → 탭 제목 표시만
      }
    }
  }, [inquiryId, messages]);

  // 탭 제목에 읽지 않은 답변 수 표시, 돌아오면 초기화
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) 새 답변 · ${BASE_TITLE}` : `${BASE_TITLE} · 모아 MOA`;
  }, [unread]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setUnread(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}

/** 첫 문의 후 알림 권한 요청 배너 */
export function NotifyPrompt({ show }: { show: boolean }) {
  const [state, setState] = useState<"hidden" | "ask" | "granted" | "denied">("hidden");

  useEffect(() => {
    if (!show || !supported()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const p = Notification.permission;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p === "default" && !dismissed) setState("ask");
  }, [show]);

  if (state === "hidden") return null;

  if (state === "granted") {
    return (
      <div className="mx-4 mt-3 flex animate-fade-up items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
        <BellRing className="size-4 shrink-0" />
        <span className="flex-1">답변이 오면 알려드릴게요. 다른 탭을 보셔도 괜찮아요.</span>
        <button onClick={() => setState("hidden")} aria-label="닫기">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="mx-4 mt-3 flex animate-fade-up items-center gap-2 rounded-xl bg-zinc-100 px-3.5 py-2.5 text-[12.5px] text-zinc-600">
        <Bell className="size-4 shrink-0" />
        <span className="flex-1">알림이 꺼져 있어요. 답변이 오면 탭 제목에 표시해 드릴게요.</span>
        <button onClick={() => setState("hidden")} aria-label="닫기">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 flex animate-fade-up items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-indigo-600 ring-1 ring-indigo-100">
        <Bell className="size-4" />
      </span>
      <p className="flex-1 text-[12.5px] leading-snug text-indigo-950">
        답변까지 평균 12분 걸려요.
        <br />
        <span className="text-indigo-700">답변이 오면 알림으로 알려드릴까요?</span>
      </p>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          onClick={async () => {
            const r = await Notification.requestPermission();
            setState(r === "granted" ? "granted" : "denied");
          }}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-indigo-500"
        >
          알림 받기
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
            setState("hidden");
          }}
          className="text-[11.5px] text-indigo-500 hover:text-indigo-700"
        >
          괜찮아요
        </button>
      </div>
    </div>
  );
}
