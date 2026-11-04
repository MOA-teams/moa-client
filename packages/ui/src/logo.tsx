import { cn } from "@moa/shared/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-white">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <circle cx="7" cy="12" r="3.2" fill="currentColor" opacity=".55" />
          <circle cx="17" cy="12" r="3.2" fill="currentColor" opacity=".55" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
          모아 <span className="font-medium text-zinc-400">MOA</span>
        </span>
      )}
    </span>
  );
}
