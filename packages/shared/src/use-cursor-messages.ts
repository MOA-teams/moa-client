"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError } from "./auth";
import type { BackendMessage } from "./inquiry";

interface Page {
  messages: BackendMessage[];
  next_cursor: string;
  has_more: boolean;
}

/**
 * 문의 대화 cursor 폴링 (고객 조회·담당자 상세 공통 규칙)
 * - 최초 cursor 없이 → has_more면 즉시 다음 페이지 → 아니면 3초 뒤 같은 next_cursor
 * - message_id로 중복 제거, INVALID_CURSOR면 처음부터 다시
 * - latest: 마지막 응답 전체 (상태·메타 필드 표시용)
 */
export function useCursorMessages<P extends Page>(id: number | null, fetchPage: (id: number, cursor: string | null) => Promise<P>, intervalMs = 3000) {
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [latest, setLatest] = useState<P | null>(null);
  const [error, setError] = useState<AuthApiError | null>(null);
  const cursor = useRef<string | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const pokeRef = useRef<() => void>(() => {});
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  useEffect(() => {
    cursor.current = null;
    seen.current = new Set();
    setMessages([]);
    setLatest(null);
    setError(null);
    if (!id) return;

    let alive = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      try {
        let more = true;
        while (alive && more) {
          const r = await fetchRef.current(id, cursor.current);
          if (!alive) return;
          cursor.current = r.next_cursor;
          const fresh = r.messages.filter((m) => !seen.current.has(m.message_id));
          fresh.forEach((m) => seen.current.add(m.message_id));
          if (fresh.length) setMessages((prev) => [...prev, ...fresh]);
          setLatest(r);
          setError(null);
          more = r.has_more;
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof AuthApiError && e.code === "INVALID_CURSOR") cursor.current = null;
        setError(e instanceof AuthApiError ? e : new AuthApiError(0, "UNKNOWN", "불러오지 못했어요"));
      } finally {
        running = false;
        if (alive) timer = setTimeout(tick, intervalMs);
      }
    };

    pokeRef.current = () => void tick();
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      pokeRef.current = () => {};
    };
  }, [id, intervalMs]);

  const poke = useCallback(() => pokeRef.current(), []);
  return { messages, latest, error, poke };
}
