"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthApiError, authApi, tokenStore, type AuthUser, type Tenant } from "./auth";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: Status;
  user: AuthUser | null;
  tenant: Tenant | null;
  /** 내 정보·기업 다시 조회 */
  reload: () => Promise<{ user: AuthUser | null; tenant: Tenant | null }>;
  login: (email: string, password: string) => Promise<{ user: AuthUser | null; tenant: Tenant | null }>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const reload = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setTenant(null);
      setStatus("anonymous");
      return { user: null, tenant: null };
    }
    try {
      const me = await authApi.me();
      let t: Tenant | null = null;
      if (me.tenant_id) {
        t = await authApi.myTenant().catch(() => ({ tenant_id: me.tenant_id!, name: me.tenant_id! }));
      }
      setUser(me);
      setTenant(t);
      setStatus("authenticated");
      return { user: me, tenant: t };
    } catch (e) {
      if (e instanceof AuthApiError && e.status === 401) tokenStore.clear();
      setUser(null);
      setTenant(null);
      setStatus("anonymous");
      return { user: null, tenant: null };
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // 다른 탭에서 로그인·로그아웃하면 동기화
    const onStorage = (e: StorageEvent) => {
      if (e.key === tokenStore.key) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      await authApi.login({ email, password });
      return reload();
    },
    [reload],
  );

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setTenant(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ status, user, tenant, reload, login, logout }), [status, user, tenant, reload, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
