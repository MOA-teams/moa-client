"use client";

import {
  Bell,
  BookText,
  Bug,
  GitCommitHorizontal,
  Inbox,
  MessageCircle,
  RotateCcw,
  Rocket,
  Settings as SettingsIcon,
  Siren,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { adminApi, demoApi } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { CLIENT_URL } from "@moa/shared/urls";
import type { Alert } from "@moa/shared/types";
import { cn, timeAgo } from "@moa/shared/utils";
import { Logo } from "@moa/ui";
import { Toggle } from "@moa/ui";

const NAV = [
  { href: "/", label: "문의 인박스", icon: Inbox, key: "inbox" },
  { href: "/groups", label: "문의 그룹", icon: Bug, key: "groups" },
  { href: "/changes", label: "변경 감지·재검토", icon: GitCommitHorizontal, key: "reviews" },
  { href: "/best-answers", label: "우수 답변", icon: Star, key: "candidates" },
  { href: "/documents", label: "문서", icon: BookText, key: "docs" },
  { href: "/settings", label: "설정·보안", icon: SettingsIcon, key: "settings" },
] as const;

interface ShellData {
  alerts: Alert[];
  ragMode: "moa" | "naive";
  counts: Record<string, number>;
}

async function loadShell(): Promise<ShellData> {
  const [alerts, settings, inquiries, reviews, answers, groups] = await Promise.all([
    adminApi.alerts(),
    adminApi.settings(),
    adminApi.inquiries(),
    adminApi.reviews(),
    adminApi.answers(),
    adminApi.groups(),
  ]);
  return {
    alerts,
    ragMode: settings.ragMode,
    counts: {
      inbox: inquiries.filter((i) => i.status === "received" || i.status === "in_review").length,
      reviews: reviews.filter((r) => r.status === "pending").length,
      candidates: answers.filter((a) => a.tier === "candidate").length,
      groups: groups.filter((g) => g.spike).length,
    },
  };
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, refresh } = usePolling(loadShell, 3000);
  const [bellOpen, setBellOpen] = useState(false);
  const [toasts, setToasts] = useState<Alert[]>([]);
  const seen = useRef<Set<string> | null>(null);

  // 새 알림 → 토스트
  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.alerts.map((a) => a.id));
      return;
    }
    const fresh = data.alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    if (fresh.length) {
      setToasts((t) => [...fresh, ...t].slice(0, 4));
      fresh.forEach((a) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), 8000));
    }
  }, [data]);

  const unread = data?.alerts.filter((a) => !a.read).length ?? 0;
  const naive = data?.ragMode === "naive";

  async function toggleMode(v: boolean) {
    await adminApi.updateSettings({ ragMode: v ? "naive" : "moa" });
    refresh();
  }

  async function reset() {
    await demoApi.reset();
    seen.current = null;
    setToasts([]);
    refresh();
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh bg-zinc-50">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:flex">
        <div className="px-5 py-5">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="mx-3 mb-3 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/70">
          <p className="text-[11px] text-zinc-500">고객사</p>
          <p className="text-[13px] font-semibold text-zinc-900">플로노트</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-zinc-400">flownote-demo/flownote</p>
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <SideNav counts={data?.counts} />
        </Suspense>
        <div className="space-y-1 border-t border-zinc-100 p-3">
          <Link href="/onboarding" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-600 hover:bg-zinc-100">
            <Rocket className="size-4" /> 초기 세팅
          </Link>
          <a href={`${CLIENT_URL}/chat`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-600 hover:bg-zinc-100">
            <MessageCircle className="size-4" /> 고객 채팅 열기
          </a>
          <button onClick={reset} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-zinc-600 hover:bg-zinc-100">
            <RotateCcw className="size-4" /> 데모 데이터 초기화
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur md:px-6">
          <div className="lg:hidden">
            <Link href="/">
              <Logo compact />
            </Link>
          </div>
          <Suspense fallback={null}>
            <MobileNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ring-1",
                naive ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-zinc-600 ring-zinc-200",
              )}
              title="비교 측정용: 버전 관리·재검토·근거 원칙을 끈 일반 RAG"
            >
              <span className="hidden sm:inline">{naive ? "일반 RAG 모드 (비교용)" : "일반 RAG 모드"}</span>
              <span className="sm:hidden">일반 RAG</span>
              <Toggle checked={naive} onChange={toggleMode} label="일반 RAG 모드" />
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setBellOpen((v) => !v);
                  if (!bellOpen && unread) adminApi.readAlerts().then(refresh);
                }}
                className="relative grid size-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                aria-label="알림"
              >
                <Bell className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-11 w-[340px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                    <p className="text-[13px] font-semibold">알림</p>
                    <button onClick={() => setBellOpen(false)} aria-label="닫기">
                      <X className="size-4 text-zinc-400" />
                    </button>
                  </div>
                  <div className="scrollbar-thin max-h-96 overflow-y-auto">
                    {data?.alerts.length ? (
                      data.alerts.map((a) => (
                        <Link
                          key={a.id}
                          href={a.href}
                          onClick={() => setBellOpen(false)}
                          className="flex gap-3 border-b border-zinc-50 px-4 py-3 hover:bg-zinc-50"
                        >
                          <AlertIcon type={a.type} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-zinc-900">{a.title}</p>
                            <p className="mt-0.5 text-[12px] text-zinc-500">{a.body}</p>
                            <p className="mt-1 text-[11px] text-zinc-400">{timeAgo(a.createdAt)}</p>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <p className="px-4 py-10 text-center text-[13px] text-zinc-400">알림이 없어요</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {naive && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-[12.5px] text-amber-800">
            일반 RAG 모드: 버전 관리·재검토·근거 원칙이 꺼져 있어요. 발표 지표 비교용이며, 같은 모델·같은 문서로 초안을 만듭니다.
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[360px] flex-col gap-2">
        {toasts.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              "pointer-events-auto flex animate-fade-up gap-3 rounded-xl border bg-white p-4 shadow-lg",
              t.type === "spike" ? "border-red-200" : "border-zinc-200",
            )}
          >
            <AlertIcon type={t.type} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-zinc-900">{t.title}</p>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">{t.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AlertIcon({ type }: { type: Alert["type"] }) {
  const map = {
    spike: { icon: Siren, cls: "bg-red-50 text-red-600" },
    issue: { icon: Bug, cls: "bg-violet-50 text-violet-600" },
    push: { icon: GitCommitHorizontal, cls: "bg-sky-50 text-sky-600" },
    review: { icon: RotateCcw, cls: "bg-amber-50 text-amber-600" },
  }[type];
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", map.cls)}>
      <map.icon className="size-4" />
    </span>
  );
}

function SideNav({ counts }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  return (
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/inquiries") : pathname.startsWith(n.href);
            const count = counts?.[n.key];
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition",
                  active ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {!!count && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold",
                      n.key === "groups" ? "bg-red-500 text-white" : active ? "bg-white/20 text-white" : "bg-zinc-200/80 text-zinc-700",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
          <nav className="flex gap-1 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-md p-2", pathname === n.href ? "bg-zinc-900 text-white" : "text-zinc-500")} aria-label={n.label}>
                <n.icon className="size-4" />
              </Link>
            ))}
          </nav>
  );
}
