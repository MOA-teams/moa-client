"use client";

import { useEffect, useRef } from "react";

/**
 * 읽음 위치 전송 — 화면이 실제로 보이고 있을 때만 마지막 메시지 ID를 보낸다.
 * 서버는 앞으로만 이동하므로 중복 전송은 무해하지만, 같은 위치는 한 번만 보낸다.
 */
export function useReadReceipt(id: string | null, lastMessageId: string | null, send: (id: string, lastId: string) => Promise<unknown>) {
  const sent = useRef<string | null>(null);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    const trySend = () => {
      if (!id || !lastMessageId || document.visibilityState !== "visible") return;
      const key = `${id}:${lastMessageId}`;
      if (sent.current === key) return;
      sent.current = key;
      sendRef.current(id, lastMessageId).catch(() => {
        sent.current = null; // 실패하면 다음 기회에 다시
      });
    };
    trySend();
    document.addEventListener("visibilitychange", trySend);
    window.addEventListener("focus", trySend);
    return () => {
      document.removeEventListener("visibilitychange", trySend);
      window.removeEventListener("focus", trySend);
    };
  }, [id, lastMessageId]);
}
