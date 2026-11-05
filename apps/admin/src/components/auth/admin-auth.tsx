"use client";

import { ArrowRight, Building2, Check, GitCommitHorizontal, Headset, LogIn, LogOut, Plus, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AuthApiError,
  EMAIL_RE,
  ROLE_LABEL,
  TENANT_ID_RE,
  authApi,
  authErrorMessage,
  safeNext,
  validatePassword,
  type UserRole,
} from "@moa/shared/auth";
import { useAuth } from "@moa/shared/auth-context";
import { CLIENT_URL } from "@moa/shared/urls";
import { cn } from "@moa/shared/utils";
import { AuthField, AuthShell, FormAlert, FullPageSpinner, Logo, PasswordField, SubmitButton } from "@moa/ui";

/* --------------------------------- 공통 --------------------------------- */

function AdminAside() {
  const points = [
    { icon: Headset, title: "근거 있는 답변 초안", body: "사실은 최신 문서·코드에서, 답하는 방식은 우수 답변에서" },
    { icon: GitCommitHorizontal, title: "코드 변경을 따라가는 지식", body: "push가 들어오면 낡은 답변을 찾아 재검토 큐로" },
    { icon: ShieldCheck, title: "보안 레벨은 직접 선택", body: "읽기 전용 + 경로 제한 + 비밀값 제외가 기본" },
  ];
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-zinc-950 px-12 py-12 text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] text-zinc-300">
          <span className="size-1.5 rounded-full bg-emerald-400" /> 담당자 · 관리자용 콘솔
        </span>
        <h2 className="mt-6 text-[30px] font-semibold leading-tight tracking-tight">
          코드가 바뀌면,
          <br />
          답변 근거도 따라 바뀝니다.
        </h2>
      </div>
      <ul className="relative space-y-6">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
              <p.icon className="size-[18px] text-zinc-200" />
            </span>
            <div>
              <p className="text-[14px] font-medium">{p.title}</p>
              <p className="mt-0.5 text-[13px] text-zinc-400">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="relative text-[12px] text-zinc-500">© 모아 MOA · 해커톤 데모</p>
    </div>
  );
}

function AdminBrand() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/">
        <Logo />
      </Link>
      <a href={`${CLIENT_URL}/chat`} className="text-[13px] text-zinc-500 hover:text-zinc-900">
        고객이신가요? →
      </a>
    </div>
  );
}

/** 로그인 결과에 따라 이동할 경로 */
function routeAfterAuth(role: UserRole, hasTenant: boolean, next: string) {
  if (role === "customer") return null;
  if (!hasTenant) return `/workspace?next=${encodeURIComponent(next)}`;
  return next;
}

/* --------------------------------- 로그인 --------------------------------- */

export function AdminLogin() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { login, logout, status, user, tenant } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);
  const [customerBlocked, setCustomerBlocked] = useState(false);

  // 이미 로그인된 상태면 바로 이동
  useEffect(() => {
    if (status === "authenticated" && user && user.role !== "customer") {
      router.replace(routeAfterAuth(user.role, !!tenant, next)!);
    }
  }, [status, user, tenant, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCustomerBlocked(false);
    if (!EMAIL_RE.test(email.trim())) return setError({ msg: "이메일 형식을 확인해 주세요." });
    if (!password) return setError({ msg: "비밀번호를 입력해 주세요." });
    setLoading(true);
    try {
      const r = await login(email.trim(), password);
      if (!r.user) throw new AuthApiError(401, "INVALID_ACCESS_TOKEN", "로그인 정보를 확인하지 못했어요.");
      if (r.user.role === "customer") {
        logout();
        setCustomerBlocked(true);
        return;
      }
      router.replace(routeAfterAuth(r.user.role, !!r.tenant, next)!);
    } catch (err) {
      setError({ msg: authErrorMessage(err), rid: err instanceof AuthApiError ? err.requestId : undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brand={<AdminBrand />}
      aside={<AdminAside />}
      title="콘솔에 로그인"
      desc="담당자·관리자 계정으로 로그인하세요."
      footer={
        <>
          아직 계정이 없나요?{" "}
          <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-zinc-900 underline-offset-4 hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="이메일" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <PasswordField label="비밀번호" autoComplete="current-password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        {customerBlocked && (
          <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
            고객 계정은 콘솔을 사용할 수 없어요.{" "}
            <a href={`${CLIENT_URL}/chat`} className="font-medium underline underline-offset-2">
              고객센터 채팅으로 이동
            </a>
          </div>
        )}
        <FormAlert message={error?.msg ?? null} requestId={error?.rid} />
        <SubmitButton loading={loading}>
          <LogIn className="size-4" /> 로그인
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

/* -------------------------------- 회원가입 -------------------------------- */

const ROLE_OPTIONS: Array<{ role: Exclude<UserRole, "customer">; title: string; desc: string }> = [
  { role: "agent", title: "담당자", desc: "문의를 확인하고 초안을 검토·발송해요. 기존 기업에 참여합니다." },
  { role: "admin", title: "관리자", desc: "기업을 만들고 문서·GitHub·보안 설정을 관리해요." },
];

export function AdminSignup() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { login } = useAuth();
  const [role, setRole] = useState<Exclude<UserRole, "customer">>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string; code?: string } | null>(null);

  const emailErr = touched && !EMAIL_RE.test(email.trim()) ? "이메일 형식을 확인해 주세요." : null;
  const pwErr = touched ? validatePassword(password) : null;
  const confirmErr = touched && confirm !== password ? "비밀번호가 일치하지 않아요." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!EMAIL_RE.test(email.trim()) || validatePassword(password) || confirm !== password) return;
    setLoading(true);
    try {
      await authApi.signup({ email: email.trim(), password, role });
      // 가입 응답에는 토큰이 없으므로 이어서 로그인
      await login(email.trim(), password);
      router.replace(`/workspace?next=${encodeURIComponent(next)}`);
    } catch (err) {
      setError({ msg: authErrorMessage(err), rid: err instanceof AuthApiError ? err.requestId : undefined, code: err instanceof AuthApiError ? err.code : undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brand={<AdminBrand />}
      aside={<AdminAside />}
      title="콘솔 계정 만들기"
      desc="가입 후 기업을 만들거나 기존 기업에 참여해요."
      footer={
        <>
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-medium text-zinc-900 underline-offset-4 hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <p className="text-[13px] font-medium text-zinc-800">역할</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((o) => (
              <button
                key={o.role}
                type="button"
                onClick={() => setRole(o.role)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  role === o.role ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <span className="flex items-center justify-between text-[14px] font-semibold text-zinc-900">
                  {o.title}
                  {role === o.role && (
                    <span className="grid size-4 place-items-center rounded-full bg-zinc-900 text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-zinc-500">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <AuthField label="이메일" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} error={emailErr} />
        <PasswordField label="비밀번호" autoComplete="new-password" placeholder="8자 이상" value={password} onChange={(e) => setPassword(e.target.value)} error={pwErr} hint="8~128자. 앞뒤 공백도 비밀번호에 포함돼요." />
        <PasswordField label="비밀번호 확인" autoComplete="new-password" placeholder="한 번 더 입력" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmErr} />
        <FormAlert message={error?.msg ?? null} requestId={error?.rid} />
        {error?.code === "EMAIL_ALREADY_EXISTS" && (
          <Link href="/login" className="block text-center text-[13px] font-medium text-zinc-900 underline underline-offset-4">
            로그인하러 가기
          </Link>
        )}
        <SubmitButton loading={loading}>가입하고 계속</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ------------------------------- 기업 설정 ------------------------------- */

export function WorkspaceSetup() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { status, user, tenant, reload, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mode, setMode] = useState<"create" | "join">("create");
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);
  // 제출 후에는 submit이 이동을 결정 (새 기업 → 온보딩). 아래 자동 이동과 겹치지 않게
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    if (status === "anonymous") router.replace("/login?next=/workspace");
    if (status === "authenticated" && user?.role === "customer") router.replace("/login");
    if (status === "authenticated" && tenant) router.replace(next);
  }, [status, user, tenant, next, router]);

  const effectiveMode = isAdmin ? mode : "join";
  const idErr = tenantId && !TENANT_ID_RE.test(tenantId) ? "영문 소문자 a~z만 1~64자로 입력해 주세요." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!TENANT_ID_RE.test(tenantId)) return setError({ msg: "기업 ID는 영문 소문자 a~z만 1~64자예요." });
    if (effectiveMode === "create" && !name.trim()) return setError({ msg: "기업 이름을 입력해 주세요." });
    setLoading(true);
    submitted.current = true;
    try {
      if (effectiveMode === "create") {
        await authApi.createTenant({ tenant_id: tenantId, name: name.trim() });
        await reload();
        router.replace("/onboarding"); // 새 기업 → 초기 세팅으로
      } else {
        await authApi.joinTenant(tenantId);
        await reload();
        router.replace(next);
      }
    } catch (err) {
      submitted.current = false;
      setError({ msg: authErrorMessage(err), rid: err instanceof AuthApiError ? err.requestId : undefined });
    } finally {
      setLoading(false);
    }
  }

  if (status !== "authenticated" || !user || tenant) return <FullPageSpinner />;

  return (
    <AuthShell
      brand={
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={() => (logout(), router.replace("/login"))} className="flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900">
            <LogOut className="size-3.5" /> 로그아웃
          </button>
        </div>
      }
      aside={<AdminAside />}
      title={isAdmin ? "기업 연결하기" : "기업에 참여하기"}
      desc={
        <>
          <span className="font-medium text-zinc-700">{user.email}</span> · {ROLE_LABEL[user.role]}
          <br />
          {isAdmin ? "새 기업을 만들거나, 이미 있는 기업 ID로 참여하세요." : "관리자에게 받은 기업 ID를 입력하세요."}
        </>
      }
    >
      {isAdmin && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-[13.5px]">
          {(
            [
              ["create", "새 기업 만들기", Plus],
              ["join", "기존 기업 참여", Building2],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => (setMode(k), setError(null))}
              className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 transition", mode === k ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {effectiveMode === "create" && (
          <AuthField label="기업 이름" placeholder="예: 플로노트" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} hint="고객에게 보이는 이름이에요. 1~100자" />
        )}
        <AuthField
          label="기업 ID"
          placeholder="예: syncnote"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value.toLowerCase().replace(/\s/g, ""))}
          maxLength={64}
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          error={idErr}
          hint={effectiveMode === "create" ? "영문 소문자만, 나중에 바꿀 수 없어요. 담당자·고객이 이 ID로 참여해요." : "영문 소문자 a~z"}
        />
        <FormAlert message={error?.msg ?? null} requestId={error?.rid} />
        <SubmitButton loading={loading}>
          {effectiveMode === "create" ? "기업 만들고 초기 세팅 시작" : "참여하기"} <ArrowRight className="size-4" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ----------------------------- 접근 보호 (가드) ----------------------------- */

/** 콘솔·온보딩: 로그인 + 담당자/관리자 + 기업 소속 필요 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user, tenant, logout } = useAuth();

  useEffect(() => {
    if (status === "anonymous") {
      const here = window.location.pathname + window.location.search;
      router.replace(`/login${here !== "/" ? `?next=${encodeURIComponent(here)}` : ""}`);
    } else if (status === "authenticated" && user && user.role !== "customer" && !tenant) {
      router.replace(`/workspace?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [status, user, tenant, router]);

  if (status === "authenticated" && user?.role === "customer") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-5">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-7 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-amber-50 text-amber-600">
            <Star className="size-5" />
          </span>
          <p className="mt-4 text-[16px] font-semibold text-zinc-900">고객 계정이에요</p>
          <p className="mt-1.5 text-[13.5px] text-zinc-500">{user.email} 계정은 콘솔을 사용할 수 없어요.</p>
          <div className="mt-6 space-y-2">
            <a href={`${CLIENT_URL}/chat`} className="flex h-10 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-medium text-white">
              고객센터 채팅으로
            </a>
            <button onClick={() => (logout(), router.replace("/login"))} className="h-10 w-full rounded-xl text-[14px] text-zinc-600 hover:bg-zinc-100">
              다른 계정으로 로그인
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (status !== "authenticated" || !tenant) return <FullPageSpinner />;
  return <>{children}</>;
}
