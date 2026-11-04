"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 3초 폴링 (명세 4-5: 해커톤은 3초 폴링 또는 SSE) */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 3000, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async () => {
    try {
      const d = await fetcherRef.current();
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      if (!alive || document.visibilityState === "hidden") return;
      await refresh();
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs, enabled]);

  return { data, error, loading: data === null && !error, refresh, setData };
}

/** 렌더 중 Date 사용을 피하기 위해 마운트 후 주기적으로 갱신되는 now */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const t = setInterval(update, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
