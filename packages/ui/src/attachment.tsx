"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { inquiryApi, type AttachmentMeta } from "@moa/shared/inquiry";
import { cn, formatBytes } from "@moa/shared/utils";

/**
 * 백엔드 첨부 — 메시지에는 메타데이터만 있으므로 표시·다운로드 직전에 presigned URL(300초)을 발급받는다.
 * URL은 저장·공유하지 않고, 열 때마다 새로 발급한다.
 */
export function RemoteAttachment({ a, align = "end" }: { a: AttachmentMeta; align?: "start" | "end" }) {
  const isImage = a.mime.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    inquiryApi
      .attachment(a.attachment_id)
      .then((r) => alive && setUrl(r.url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [a.attachment_id, isImage]);

  async function open() {
    try {
      const r = await inquiryApi.attachment(a.attachment_id);
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch {
      setFailed(true);
    }
  }

  if (isImage && url && !failed) {
    return (
      <button onClick={open} className={cn("block", align === "start" && "text-left")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={a.file_name} onError={() => setFailed(true)} className="max-h-40 max-w-[220px] rounded-xl border border-zinc-200 object-cover" />
      </button>
    );
  }
  return (
    <button onClick={open} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50">
      <FileText className={cn("size-4", isImage ? "text-indigo-500" : "text-red-500")} />
      <span className="max-w-[160px] truncate">{a.file_name}</span>
      <span className="text-zinc-400">{failed ? "다시 열기" : formatBytes(a.size)}</span>
    </button>
  );
}
