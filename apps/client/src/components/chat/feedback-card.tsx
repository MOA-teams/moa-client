"use client";

import { Check, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { inquiryApi, inquiryErrorMessage, newIdempotencyKey, type FeedbackBody, type FeedbackResponse } from "@moa/shared/inquiry";
import { cn } from "@moa/shared/utils";

/**
 * C-04 상담 종료 후 평가 (POST /api/v1/inquiries/{id}/feedback, 최초 1회)
 * - 해결 여부·한 줄 의견은 선택, 별을 누르는 순간 함께 제출 → 한 번의 탭으로 끝
 * - 별점과 해결 여부는 독립 (별점이 해결을 대신하지 않음)
 */
export function FeedbackCard({
  inquiryId,
  submitted,
  feedback,
  onDone,
}: {
  inquiryId: string;
  submitted: boolean;
  feedback: FeedbackResponse | null;
  onDone: () => void;
}) {
  const [hover, setHover] = useState(0);
  const [resolved, setResolved] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<FeedbackResponse | null>(null);
  const pending = useRef<{ key: string; body: FeedbackBody } | null>(null);

  async function submit(rating: number) {
    if (busy) return;
    const body: FeedbackBody = {
      rating,
      ...(resolved !== null ? { resolved } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    const prev = pending.current;
    const key = prev && JSON.stringify(prev.body) === JSON.stringify(body) ? prev.key : newIdempotencyKey();
    pending.current = { key, body };
    setBusy(true);
    setError(null);
    try {
      setLocal(await inquiryApi.feedback(inquiryId, body, key));
      pending.current = null;
      onDone();
    } catch (e) {
      if (e instanceof AuthApiError && e.code === "FEEDBACK_ALREADY_SUBMITTED") onDone();
      else setError(inquiryErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const done = local ?? (submitted ? feedback : null);
  if (done || submitted) {
    const r = done?.rating ?? null;
    return (
      <div className="mx-auto w-full max-w-[320px] animate-fade-up rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
        <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="size-5" />
        </div>
        <p className="text-[14px] font-semibold text-zinc-900">평가해 주셔서 감사합니다</p>
        {r !== null && (
          <p className="mt-1 text-[20px] leading-none text-amber-400">
            {"★".repeat(r)}
            <span className="text-zinc-200">{"★".repeat(5 - r)}</span>
          </p>
        )}
        {done?.resolved !== null && done?.resolved !== undefined && (
          <p className="mt-2 text-[12px] text-zinc-500">{done.resolved ? "문제가 해결됐다고 알려주셨어요" : "아직 해결되지 않았다고 알려주셨어요"}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[340px] animate-fade-up rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
      <p className="text-[14px] font-semibold text-zinc-900">상담은 만족스러우셨나요?</p>
      <p className="mt-0.5 text-[12px] text-zinc-500">별을 누르면 바로 평가가 끝나요</p>

      <div className="mt-3 flex justify-center gap-1.5">
        {(
          [
            [true, "해결됐어요"],
            [false, "아직이에요"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            onClick={() => setResolved(resolved === v ? null : v)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition",
              resolved === v ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        placeholder="한 줄 의견 (선택)"
        className="mt-2 h-8 w-full rounded-lg border border-zinc-200 px-2.5 text-[12.5px] outline-none focus:border-zinc-400"
      />

      <div className="mt-3 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onMouseEnter={() => setHover(s)}
            onClick={() => submit(s)}
            disabled={busy}
            className={cn("text-[30px] leading-none transition-transform hover:scale-110 disabled:opacity-50", s <= hover ? "text-amber-400" : "text-zinc-200")}
            aria-label={`${s}점으로 평가`}
          >
            ★
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-red-600">
          {error} 별을 다시 눌러 주세요.
        </p>
      )}
      <p className="mt-3 flex items-center justify-center gap-1 text-[10.5px] text-zinc-400">
        <Sparkles className="size-3" /> 평가는 더 나은 답변을 만드는 데 쓰여요 · 한 번만 남길 수 있어요
      </p>
    </div>
  );
}
