"use client";

import { use } from "react";
import { LIVE_INQUIRY_ID } from "@moa/shared/inquiry";
import { InquiryDetailView } from "./inquiry-detail";
import { LiveInquiryDetail } from "./live-inquiry-detail";

/** Q-1006 형식 → 백엔드 실제 문의, Q031 형식 → 데모 시나리오(mock) */
export function InquiryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = decodeURIComponent(raw);
  if (LIVE_INQUIRY_ID.test(id)) return <LiveInquiryDetail id={id} />;
  return <InquiryDetailView params={params} />;
}
