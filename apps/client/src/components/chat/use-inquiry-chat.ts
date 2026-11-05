"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { inquiryApi, type BackendMessage, type BackendStatus } from "@moa/shared/inquiry";

/**
 * GET /api/v1/inquiries/{id} cursor 폴링
 * - 최초 cursor 없이 → has_more면 즉시 다음 페이지 → 아니면 3초 뒤 같은 next_cursor
 * - message_id로 중복 제거, 탭이 숨겨져도 계속(답변 알림용)
 */
export function useInquiryChat(inquiryId: number | null) {
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [error, setError] = useState<AuthApiError | null>(null);
  const cursor = useRef<string | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const pokeRef = useRef<() => void>(() => {});

  useEffect(() => {
    cursor.current = null;
    seen.current = new Set();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setStatus(null);
    setError(null);
    if (!inquiryId) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      try {
        let more = true;
        while (alive && more) {
          const r = await inquiryApi.chat(inquiryId, cursor.current);
          if (!alive) return;
          cursor.current = r.next_cursor;
          const fresh = r.messages.filter((m) => !seen.current.has(m.message_id));
          fresh.forEach((m) => seen.current.add(m.message_id));
          if (fresh.length) setMessages((prev) => [...prev, ...fresh]);
          setStatus(r.status);
          setError(null);
          more = r.has_more;
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof AuthApiError && e.code === "INVALID_CURSOR") cursor.current = null; // 처음부터 다시 (중복은 message_id로 제거)
        setError(e instanceof AuthApiError ? e : new AuthApiError(0, "UNKNOWN", "불러오지 못했어요"));
      } finally {
        running = false;
        if (alive) timer = setTimeout(tick, 3000);
      }
    };

    pokeRef.current = () => void tick();
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      pokeRef.current = () => {};
    };
  }, [inquiryId]);

  /** 메시지 전송 직후 바로 다시 읽기 */
  const poke = useCallback(() => pokeRef.current(), []);

  return { messages, status, error, poke };
}
