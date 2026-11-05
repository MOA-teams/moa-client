/**
 * MOA Backend 인증·기업 소속 API (OpenAPI: /api/v1/auth/*, /api/v1/tenants/*)
 *
 * - 요청은 같은 출처의 `/backend/*` 로 보내고 Next rewrite가 백엔드로 넘긴다 (CORS 무관).
 * - 토큰은 localStorage에 저장. 401 INVALID_ACCESS_TOKEN이면 refresh 1회 후 재시도.
 * - refresh는 이전 토큰 재사용 불가·동시 갱신 1건만 성공 → 탭 내 single-flight + 다른 탭 갱신 감지.
 */

export type UserRole = "customer" | "agent" | "admin";

export interface AuthUser {
  user_id: number;
  email: string;
  role: UserRole;
  tenant_id?: string | null;
}

export interface Tenant {
  tenant_id: string;
  name: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  customer: "고객",
  agent: "담당자",
  admin: "관리자",
};

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "/backend";
const TOKEN_KEY = "moa.auth.tokens";

export class AuthApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

/* --------------------------------- 토큰 저장 --------------------------------- */

export const tokenStore = {
  get(): TokenPair | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as TokenPair) : null;
    } catch {
      return null;
    }
  },
  set(t: TokenPair) {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
  key: TOKEN_KEY,
};

/* ---------------------------------- 요청 ---------------------------------- */

const FALLBACK: Record<number, string> = {
  400: "입력한 값을 다시 확인해 주세요.",
  401: "로그인이 필요해요.",
  403: "접근 권한이 없어요.",
  404: "찾을 수 없어요.",
  409: "이미 존재하거나 충돌하는 요청이에요.",
};

async function raw<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AuthApiError(0, "NETWORK_ERROR", "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; request_id?: string } } | null)?.error;
    throw new AuthApiError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? FALLBACK[res.status] ?? "요청을 처리하지 못했어요.",
      err?.request_id ?? res.headers.get("X-Request-ID") ?? undefined,
    );
  }
  return data as T;
}

let refreshing: Promise<TokenPair> | null = null;

async function refreshTokens(): Promise<TokenPair> {
  if (refreshing) return refreshing;
  const current = tokenStore.get();
  if (!current) throw new AuthApiError(401, "INVALID_REFRESH_TOKEN", "다시 로그인해 주세요.");
  refreshing = raw<TokenPair>("/api/v1/auth/refresh", { method: "POST", body: { refresh_token: current.refresh_token } })
    .then((t) => {
      tokenStore.set(t);
      return t;
    })
    .catch((e) => {
      // 다른 탭이 먼저 갱신해 이전 토큰이 무효가 된 경우 → 저장소의 새 토큰 사용
      const latest = tokenStore.get();
      if (latest && latest.refresh_token !== current.refresh_token) return latest;
      // 만료·재사용 등 진짜 인증 실패일 때만 로그아웃 (네트워크 오류는 토큰 유지)
      if (e instanceof AuthApiError && e.status === 401) tokenStore.clear();
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function authed<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const tokens = tokenStore.get();
  if (!tokens) throw new AuthApiError(401, "INVALID_ACCESS_TOKEN", "로그인이 필요해요.");
  try {
    return await raw<T>(path, { ...init, token: tokens.access_token });
  } catch (e) {
    if (!(e instanceof AuthApiError) || e.status !== 401) throw e;
    // 그사이 다른 요청·탭이 이미 갱신했다면 새 access token으로 바로 재시도
    const latest = tokenStore.get();
    if (latest && latest.access_token !== tokens.access_token) return raw<T>(path, { ...init, token: latest.access_token });
    const next = await refreshTokens();
    return raw<T>(path, { ...init, token: next.access_token });
  }
}

/* ----------------------------------- API ----------------------------------- */

export const authApi = {
  health: () => raw<Record<string, string>>("/health"),

  signup: (input: { email: string; password: string; role: UserRole }) =>
    raw<{ user_id: number; email: string; role: UserRole }>("/api/v1/auth/signup", { method: "POST", body: input }),

  async login(input: { email: string; password: string }) {
    const t = await raw<TokenPair>("/api/v1/auth/login", { method: "POST", body: input });
    tokenStore.set(t);
    return t;
  },

  logout() {
    tokenStore.clear();
  },

  me: () => authed<AuthUser>("/api/v1/auth/me"),

  createTenant: (input: { tenant_id: string; name: string }) =>
    authed<Tenant>("/api/v1/tenants", { method: "POST", body: input }),

  joinTenant: (tenant_id: string) => authed<Tenant>("/api/v1/tenants/join", { method: "POST", body: { tenant_id } }),

  myTenant: () => authed<Tenant>("/api/v1/tenants/me"),
};

/* ---------------------------------- 검증 ---------------------------------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TENANT_ID_RE = /^[a-z]{1,64}$/;

export function validatePassword(pw: string) {
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 해요.";
  if (pw.length > 128) return "비밀번호는 128자 이하여야 해요.";
  return null;
}

/** 오류 코드 → 사용자 안내 문구 */
export function authErrorMessage(e: unknown): string {
  if (!(e instanceof AuthApiError)) return "알 수 없는 오류가 발생했어요.";
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않아요.",
    EMAIL_ALREADY_EXISTS: "이미 가입된 이메일이에요. 로그인해 주세요.",
    VALIDATION_ERROR: "입력한 값을 다시 확인해 주세요.",
    INVALID_ACCESS_TOKEN: "로그인이 만료되었어요. 다시 로그인해 주세요.",
    INVALID_REFRESH_TOKEN: "로그인이 만료되었어요. 다시 로그인해 주세요.",
    FORBIDDEN: "이 계정으로는 할 수 없는 작업이에요.",
    TENANT_ALREADY_EXISTS: "이미 사용 중인 기업 ID예요. 다른 ID를 입력해 주세요.",
    TENANT_ALREADY_ASSIGNED: "이미 다른 기업에 소속되어 있어요.",
    TENANT_NOT_FOUND: "해당 기업 ID를 찾을 수 없어요. 철자를 확인해 주세요.",
    TENANT_REQUIRED: "기업 소속이 필요해요.",
  };
  return map[e.code] ?? e.message;
}

/** 로그인 후 이동 경로 — 같은 앱 내부 경로만 허용 (open redirect 방지) */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
