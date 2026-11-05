"use client";

import { inquiryApi } from "@moa/shared/inquiry";
import { useCursorMessages } from "@moa/shared/use-cursor-messages";

/** 고객 본인 문의 대화 (GET /api/v1/inquiries/{id}) — 3초 cursor 폴링 */
export function useInquiryChat(inquiryId: number | null) {
  const { messages, latest, error, poke } = useCursorMessages(inquiryId, (id, cursor) => inquiryApi.chat(id, cursor));
  return { messages, status: latest?.status ?? null, error, poke };
}
