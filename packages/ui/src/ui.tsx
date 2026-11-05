"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@moa/shared/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300",
  secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:text-zinc-400",
  outline: "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-400",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        VARIANT[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        className ?? "bg-zinc-100 text-zinc-700 ring-zinc-500/15",
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("rounded-xl border border-zinc-200/80 bg-white", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, desc, action, icon }: { title: ReactNode; desc?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-zinc-400">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-zinc-900">{title}</h3>
          {desc && <p className="mt-0.5 text-[12.5px] text-zinc-500">{desc}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">{title}</h1>
        {desc && <p className="mt-1 text-sm text-zinc-500">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, desc }: { icon?: ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-zinc-300">{icon}</div>}
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {desc && <p className="mt-1 text-[13px] text-zinc-500">{desc}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-zinc-400", className)} />;
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner className="size-5" />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
  "aria-label"?: string;
}) {
  // 브라우저 기본 화살표 대신 아이콘을 직접 배치 (위치·간격 일정). 크기·여백 className은 바깥 래퍼에 적용
  return (
    <span className={cn("relative inline-flex h-8 min-w-0", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-zinc-200 bg-white pl-3 pr-8 text-[13px] text-zinc-800 outline-none transition hover:border-zinc-300 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-zinc-900" : "bg-zinc-300",
      )}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function Stars({ score, size = "sm" }: { score: number | null | undefined; size?: "sm" | "md" }) {
  if (score === null || score === undefined) return <span className="text-[12px] text-zinc-400">미평가</span>;
  return (
    <span className={cn("tracking-tight text-amber-400", size === "md" ? "text-base" : "text-[13px]")} aria-label={`별점 ${score}점`}>
      {"★".repeat(score)}
      <span className="text-zinc-200">{"★".repeat(5 - score)}</span>
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const t = {
    info: "border-sky-200 bg-sky-50/70 text-sky-900",
    warn: "border-amber-200 bg-amber-50/80 text-amber-900",
    danger: "border-red-200 bg-red-50/80 text-red-900",
    success: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  }[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13px]", t)}>
      {icon && <div className="mt-px shrink-0">{icon}</div>}
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}
