"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inquiryApi, type CustomerInquirySummary } from "@moa/shared/inquiry";

/**
 * 고객 본인의 지난 상담 목록 (GET /api/v1/inquiries)
 * - 서버가 계정 기준으로 반환하므로 기기·브라우저가 바뀌어도 같은 목록
 * - 새 문의·상태 변화는 cursor 없이 첫 페이지를 다시 조회해 반영 (서버 권장 방식)
 * - '더 보기'는 next_cursor로 다음 페이지를 이어 붙임
 */
export function useInquiryHistory(enabled: boolean) {
  const [items, setItems] = useState<CustomerInquirySummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const r = await inquiryApi.list(null);
      if (!alive.current) return;
      // 첫 페이지로 교체하되, 이미 불러온 뒤쪽 페이지는 유지
      setItems((prev) => {
        const head = new Set(r.items.map((x) => x.inquiry_id));
        const tail = prev.slice(r.items.length).filter((x) => !head.has(x.inquiry_id));
        return [...r.items, ...tail];
      });
      setNextCursor((c) => c ?? r.next_cursor);
      setHasMore((h) => h || r.has_more);
      setError(false);
    } catch {
      if (alive.current) setError(true);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const r = await inquiryApi.list(nextCursor);
      if (!alive.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.inquiry_id));
        return [...prev, ...r.items.filter((x) => !seen.has(x.inquiry_id))];
      });
      setNextCursor(r.next_cursor);
      setHasMore(r.has_more);
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [nextCursor, loading]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => {
      alive.current = false;
    };
  }, [enabled, refresh]);

  return { items, hasMore, loading, error, refresh, loadMore };
}
