"use client";

import { AlertCircle, Check, ExternalLink, GitBranch, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { useAuth } from "@moa/shared/auth-context";
import { githubApi, inquiryErrorMessage, newIdempotencyKey, type GitHubConnectBody, type GitHubStatus } from "@moa/shared/inquiry";
import { SECURITY_LEVELS } from "@moa/shared/labels";
import { cn, formatDateTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock } from "@moa/ui";

export const GH_LEVEL_KEY = "moa.github.pendingLevel";
export const DEFAULT_EXCLUDES = [".env*", "*.pem", "*.key", "secrets/", "config/prod*"];

type Err = { msg: string; rid?: string } | null;
const toErr = (e: unknown): Err => ({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });

/** 기업 GitHub 연동 상태·보안 레벨·연결 시작 (GET/POST /api/v1/admin/integrations/github*) */
export function GitHubIntegrationCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [st, setSt] = useState<GitHubStatus | null>(null);
  const [level, setLevel] = useState<0 | 1 | 2>(2);
  const [busy, setBusy] = useState<null | "start" | "save">(null);
  const [err, setErr] = useState<Err>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const pending = useRef<{ key: string; body: GitHubConnectBody } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await githubApi.status();
      setSt(s);
      setErr(null);
      return s;
    } catch (e) {
      setErr(toErr(e));
      return null;
    }
  }, []);

  useEffect(() => {
    // 서버 응답 후 현재 레벨로 초기화 (비동기 콜백)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then((s) => s && setLevel(Math.min(2, s.security_level) as 0 | 1 | 2));
  }, [load]);

  // 인덱싱 진행 중이면 5초마다 상태 확인
  const running = !!st && /처리|대기|인덱싱|동기화 중/.test(st.status);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [running, load]);

  async function start() {
    setBusy("start");
    setErr(null);
    try {
      const r = await githubApi.start();
      try {
        sessionStorage.setItem(GH_LEVEL_KEY, String(level));
      } catch {}
      // GitHub 인증 → 등록된 callback(/integrations/github/callback)으로 돌아옴
      window.location.href = r.authorization_url;
    } catch (e) {
      setErr(toErr(e));
      setBusy(null);
    }
  }

  async function saveLevel0() {
    const body: GitHubConnectBody = { security_level: 0, exclude_patterns: st?.exclude_patterns ?? DEFAULT_EXCLUDES };
    const prev = pending.current;
    const key = prev && JSON.stringify(prev.body) === JSON.stringify(body) ? prev.key : newIdempotencyKey();
    pending.current = { key, body };
    setBusy("save");
    setErr(null);
    try {
      const r = await githubApi.connect(body, key);
      pending.current = null;
      setSaved(`레벨 0으로 저장했어요 (${r.status})`);
      load();
    } catch (e) {
      setErr(toErr(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="GitHub 연동"
        desc="코드 연동 범위는 보안 레벨로 직접 골라요. 코드는 담당자 화면 근거로만 쓰이고 고객 답변에는 들어가지 않아요."
        icon={<GitBranch className="size-4" />}
        action={
          <button onClick={load} className="grid size-8 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="새로고침">
            <RefreshCw className={cn("size-4", running && "animate-spin")} />
          </button>
        }
      />
      {!st && !err ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5 p-5">
          {st && (
            <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="상태">
                <Badge className={st.status === "연동 안 함" ? "bg-zinc-100 text-zinc-600" : st.error_code ? "bg-red-50 text-red-700 ring-red-600/15" : "bg-emerald-50 text-emerald-700 ring-emerald-600/15"}>
                  {running && <Loader2 className="size-3 animate-spin" />}
                  {st.status}
                </Badge>
              </Stat>
              <Stat label="저장소 · 감시 브랜치">
                <span className="font-mono">{st.repository ? `${st.repository}@${st.watch_branch}` : "—"}</span>
              </Stat>
              <Stat label="보안 레벨">레벨 {st.security_level}</Stat>
              <Stat label="코드 분석">{st.analysis_provider === "external_llm" ? "외부 LLM" : "사용 안 함"}</Stat>
              <Stat label="감시 경로">
                <span className="font-mono text-[12px]">{st.include_paths.length ? st.include_paths.join(" ") : "—"}</span>
              </Stat>
              <Stat label="제외 패턴">
                <span className="font-mono text-[12px]">{st.exclude_patterns.join(" ")}</span>
              </Stat>
              <Stat label="마지막 동기화">
                {st.last_synced_at ? `${formatDateTime(st.last_synced_at)}${st.last_synced_sha ? ` · ${st.last_synced_sha.slice(0, 7)}` : ""}` : "—"}
              </Stat>
              <Stat label="오류">{st.error_code ? <span className="text-red-600">{inquiryErrorMessage(new AuthApiError(0, st.error_code, st.error_code))}</span> : "없음"}</Stat>
              {Object.keys(st.report ?? {}).length > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="text-[11.5px] text-zinc-500">인덱싱 리포트</p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-white p-3 font-mono text-[11.5px] text-zinc-700 ring-1 ring-zinc-200">{JSON.stringify(st.report, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-[13px] font-medium text-zinc-800">보안 레벨</p>
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              {SECURITY_LEVELS.map((l) => {
                const disabled = l.level === 3 || !isAdmin;
                const active = level === l.level;
                return (
                  <button
                    key={l.level}
                    disabled={disabled}
                    onClick={() => setLevel(l.level as 0 | 1 | 2)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition",
                      active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
                      disabled && !active && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-zinc-400">레벨 {l.level}</span>
                      {active && (
                        <span className="grid size-5 place-items-center rounded-full bg-zinc-900 text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                      {l.level === 3 && <Badge>미지원</Badge>}
                    </div>
                    <p className="mt-1.5 text-[14px] font-semibold text-zinc-900">{l.name}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{l.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {err && (
            <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
              <AlertCircle className="size-4" /> {err.msg}
              {err.rid && <span className="font-mono text-[10.5px] text-red-400">{err.rid}</span>}
            </p>
          )}
          {saved && <p className="text-[12.5px] text-emerald-700">{saved}</p>}

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
            <p className="mr-auto flex items-center gap-1.5 text-[12px] text-zinc-500">
              {isAdmin ? <ShieldCheck className="size-3.5" /> : <Lock className="size-3.5" />}
              {isAdmin ? "읽기 전용 GitHub App · 코드 쓰기·PR 권한 없음" : "연동 설정은 관리자만 바꿀 수 있어요"}
            </p>
            {isAdmin &&
              (level === 0 ? (
                <Button onClick={saveLevel0} loading={busy === "save"}>
                  레벨 0으로 저장 (GitHub 없이)
                </Button>
              ) : (
                <Button onClick={start} loading={busy === "start"}>
                  <ExternalLink className="size-3.5" /> GitHub 연결 시작
                </Button>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-zinc-500">{label}</p>
      <div className="mt-1 truncate font-medium text-zinc-900">{children}</div>
    </div>
  );
}
