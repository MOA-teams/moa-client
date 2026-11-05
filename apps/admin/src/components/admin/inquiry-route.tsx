"use client";

import { use } from "react";
import { InquiryDetailView } from "./inquiry-detail";
import { LiveInquiryDetail } from "./live-inquiry-detail";

/** 숫자 ID → 백엔드 실제 문의, Q로 시작 → 데모 시나리오(mock) */
export function InquiryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (/^\d+$/.test(id)) return <LiveInquiryDetail id={Number(id)} />;
  return <InquiryDetailView params={params} />;
}
