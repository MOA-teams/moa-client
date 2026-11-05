"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@moa/shared/utils";

/** 인증 화면 공통 레이아웃 — 왼쪽 브랜드 패널(데스크톱) + 오른쪽 폼 */
export function AuthShell({
  brand,
  aside,
  title,
  desc,
  children,
  footer,
}: {
  brand: ReactNode;
  aside?: ReactNode;
  title: string;
  desc?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-white">
      {aside && <div className="hidden w-[44%] max-w-[560px] shrink-0 lg:block">{aside}</div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-6 py-5 sm:px-10">{brand}</div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-10">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900">{title}</h1>
            {desc && <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">{desc}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-center text-[13.5px] text-zinc-500">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  hint,
  error,
  right,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; right?: ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-zinc-800">
          {label}
        </label>
        {right}
      </div>
      <input
        id={id}
        {...input}
        aria-invalid={!!error}
        className={cn(
          "mt-1.5 h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-4",
          error ? "border-red-300 focus:border-red-400 focus:ring-red-50" : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-100",
          input.className,
        )}
      />
      {error ? <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-[12.5px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: ReactNode; error?: string | null }) {
  const [show, setShow] = useState(false);
  const { label, hint, error, ...input } = props;
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-zinc-800">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          {...input}
          type={show ? "text" : "password"}
          aria-invalid={!!error}
          className={cn(
            "h-11 w-full rounded-xl border bg-white pl-3.5 pr-11 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-4",
            error ? "border-red-300 focus:border-red-400 focus:ring-red-50" : "border-zinc-200 focus:border-zinc-400 focus:ring-zinc-100",
          )}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-[12.5px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function FormAlert({ message, requestId }: { message: string | null; requestId?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-800">
      <AlertCircle className="mt-px size-4 shrink-0" />
      <div>
        {message}
        {requestId && <p className="mt-0.5 font-mono text-[10.5px] text-red-400">요청 ID {requestId}</p>}
      </div>
    </div>
  );
}

export function SubmitButton({ loading, children, className }: { loading?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-[15px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400",
        className,
      )}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

/** 전체 화면 로딩 (인증 확인 중) */
export function FullPageSpinner({ label = "확인 중이에요" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-50">
      <span className="size-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
      <p className="text-[13px] text-zinc-500">{label}</p>
    </div>
  );
}
