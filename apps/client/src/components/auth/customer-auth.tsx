"use client";

import { ArrowRight, Headset, LogIn, LogOut, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AuthApiError,
  EMAIL_RE,
  ROLE_LABEL,
  authApi,
  authErrorMessage,
  safeNext,
  validatePassword,
} from "@moa/shared/auth";
import { useAuth } from "@moa/shared/auth-context";
import { ADMIN_URL } from "@moa/shared/urls";
import { AuthField, AuthShell, FormAlert, FullPageSpinner, PasswordField, SubmitButton } from "@moa/ui";

/** 이 고객센터 위젯이 속한 기업 ID — 고객은 로그인 후 자동으로 이 기업에 연결된다 */
export const WIDGET_TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "syncnote";

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-indigo-600 text-[13px] font-bold text-white">F</span>
      <span className="text-[15px] font-semibold text-zinc-900">플로노트 고객센터</span>
    </Link>
  );
}

function Aside() {
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden bg-indigo-600 px-12 text-white">
      <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-80 rounded-full bg-indigo-400/40 blur-3xl" />
      <div className="relative">
        <h2 className="text-[28px] font-semibold leading-tight tracking-tight">
          궁금한 점은
          <br />
          채팅으로 편하게 물어보세요.
        </h2>
        <p className="mt-3 text-[14px] text-indigo-100">로그인하면 이전 상담 내역과 답변 알림을 이어서 받을 수 있어요.</p>
        <div className="mt-10 space-y-3">
          <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-md bg-white px-4 py-2.5 text-[14px] text-zinc-900 shadow-lg shadow-indigo-900/20">
            저장하면 E-502 오류가 떠요
          </div>
          <div className="flex gap-2">
            <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-white/15">
              <Headset className="size-4" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white/15 px-4 py-2.5 text-[14px] leading-relaxed backdrop-blur">
              불편을 드려 죄송합니다. 작성하신 내용은 기기에 임시 보관되어 있어요. 1~2분 뒤 다시 저장해 주세요.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- 로그인 --------------------------------- */

export function CustomerLogin() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/chat");
  const { login, status, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; rid?: string } | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "customer") router.replace(next);
  }, [status, user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError({ msg: "이메일 형식을 확인해 주세요." });
    if (!password) return setError({ msg: "비밀번호를 입력해 주세요." });
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError({ msg: authErrorMessage(err), rid: err instanceof AuthApiError ? err.requestId : undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brand={<Brand />}
      aside={<Aside />}
      title="로그인"
      desc="상담을 시작하려면 로그인해 주세요."
      footer={
        <>
          처음이신가요?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-600 underline-offset-4 hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="이메일" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <PasswordField label="비밀번호" autoComplete="current-password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormAlert message={error?.msg ?? null} requestId={error?.rid} />
        <SubmitButton loading={loading} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300">
          <LogIn className="size-4" /> 로그인
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

/* -------------------------------- 회원가입 -------------------------------- */

export function CustomerSignup() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/chat");
  const { login } = useAuth();
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
      await authApi.signup({ email: email.trim(), password, role: "customer" });
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError({
        msg: authErrorMessage(err),
        rid: err instanceof AuthApiError ? err.requestId : undefined,
        code: err instanceof AuthApiError ? err.code : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brand={<Brand />}
      aside={<Aside />}
      title="회원가입"
      desc="이메일로 간단하게 가입하고 바로 상담을 시작하세요."
      footer={
        <>
          이미 계정이 있나요?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-600 underline-offset-4 hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="이메일" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={emailErr} />
        <PasswordField label="비밀번호" autoComplete="new-password" placeholder="8자 이상" value={password} onChange={(e) => setPassword(e.target.value)} error={pwErr} hint="8~128자" />
        <PasswordField label="비밀번호 확인" autoComplete="new-password" placeholder="한 번 더 입력" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmErr} />
        <FormAlert message={error?.msg ?? null} requestId={error?.rid} />
        {error?.code === "EMAIL_ALREADY_EXISTS" && (
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="block text-center text-[13px] font-medium text-indigo-600 underline underline-offset-4">
            로그인하러 가기
          </Link>
        )}
        <SubmitButton loading={loading} className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300">
          가입하고 상담 시작 <ArrowRight className="size-4" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ------------------------------ 채팅 접근 보호 ------------------------------ */

function Notice({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#eef2ff,transparent_60%)] px-5">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-xl shadow-zinc-900/5">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-indigo-50 text-indigo-600">
          <MessageCircle className="size-5" />
        </span>
        <p className="mt-4 text-[16px] font-semibold text-zinc-900">{title}</p>
        <div className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-500">{children}</div>
        <div className="mt-6 space-y-2">{actions}</div>
      </div>
    </div>
  );
}

/** /chat: 로그인한 고객만. 기업 미소속이면 위젯 기업으로 자동 연결 */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user, tenant, reload, logout } = useAuth();
  const [joinError, setJoinError] = useState<{ code: string; msg: string } | null>(null);
  const joining = useRef(false);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login?next=/chat");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !user || user.role !== "customer" || tenant || joining.current) return;
    joining.current = true;
    authApi
      .joinTenant(WIDGET_TENANT_ID)
      .then(() => reload())
      .catch((e) => setJoinError({ code: e instanceof AuthApiError ? e.code : "UNKNOWN", msg: authErrorMessage(e) }))
      .finally(() => {
        joining.current = false;
      });
  }, [status, user, tenant, reload]);

  const signOut = () => {
    logout();
    router.replace("/login?next=/chat");
  };

  if (status === "authenticated" && user && user.role !== "customer") {
    return (
      <Notice
        title={`${ROLE_LABEL[user.role]} 계정이에요`}
        actions={
          <>
            <a href={ADMIN_URL} className="flex h-10 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-medium text-white">
              콘솔로 이동
            </a>
            <button onClick={signOut} className="h-10 w-full rounded-xl text-[14px] text-zinc-600 hover:bg-zinc-100">
              고객 계정으로 로그인
            </button>
          </>
        }
      >
        {user.email} 계정은 담당자 콘솔에서 사용해요.
      </Notice>
    );
  }

  if (status === "authenticated" && user && tenant && tenant.tenant_id !== WIDGET_TENANT_ID) {
    return (
      <Notice
        title="다른 기업 고객 계정이에요"
        actions={
          <button onClick={signOut} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-[14px] font-medium text-white">
            <LogOut className="size-4" /> 다른 계정으로 로그인
          </button>
        }
      >
        {user.email} 계정은 &lsquo;{tenant.name}&rsquo; 고객으로 연결되어 있어요. 플로노트 상담은 다른 계정으로 이용해 주세요.
      </Notice>
    );
  }

  if (joinError) {
    return (
      <Notice
        title={joinError.code === "TENANT_NOT_FOUND" ? "고객센터가 아직 준비 중이에요" : "고객센터에 연결하지 못했어요"}
        actions={
          <>
            <button onClick={() => (setJoinError(null), reload())} className="flex h-10 w-full items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-medium text-white">
              다시 시도
            </button>
            <button onClick={signOut} className="h-10 w-full rounded-xl text-[14px] text-zinc-600 hover:bg-zinc-100">
              로그아웃
            </button>
          </>
        }
      >
        {joinError.code === "TENANT_NOT_FOUND" ? "상담 창구가 아직 열리지 않았어요. 잠시 후 다시 시도해 주세요." : joinError.msg}
        {joinError.code === "TENANT_NOT_FOUND" && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5 text-left text-[12px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-700">운영자 안내</span> · 콘솔에서 관리자가 기업 ID{" "}
            <code className="rounded bg-white px-1 font-mono text-zinc-700 ring-1 ring-zinc-200">{WIDGET_TENANT_ID}</code>로 기업을 만들어야 고객이 연결돼요.{" "}
            <a href={`${ADMIN_URL}/signup`} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 underline underline-offset-2">
              콘솔에서 만들기
            </a>
          </div>
        )}
      </Notice>
    );
  }

  if (status !== "authenticated" || !tenant) return <FullPageSpinner label={status === "authenticated" ? "고객센터에 연결하는 중이에요" : "확인 중이에요"} />;
  return <>{children}</>;
}

/** 랜딩 헤더용 로그인 상태 */
export function NavAuth() {
  const { status, user, logout } = useAuth();
  if (status === "loading") return <span className="h-9 w-20" />;
  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-1">
        <span className="hidden px-2 text-[13px] text-zinc-500 sm:inline">{user.email}</span>
        <button onClick={logout} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
          로그아웃
        </button>
      </div>
    );
  }
  return (
    <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
      로그인
    </Link>
  );
}
