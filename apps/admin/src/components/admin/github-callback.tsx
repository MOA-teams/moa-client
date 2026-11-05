"use client";

import { AlertCircle, ArrowLeft, Check, FolderGit2, GitBranch, Lock, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { githubApi, inquiryErrorMessage, newIdempotencyKey, type AuthorizedRepository, type GitHubConnectBody } from "@moa/shared/inquiry";
import { cn } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, PageHeader } from "@moa/ui";
import { DEFAULT_EXCLUDES, GH_INSTALL_KEY, GH_LEVEL_KEY } from "./github-integration";

type Err = { msg: string; rid?: string } | null;
const toErr = (e: unknown): Err => ({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });

/** 경로 목록 → 선택용 디렉터리 (1~2단계) */
function dirsOf(paths: string[]) {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    if (parts.length > 1) set.add(`${parts[0]}/`);
    if (parts.length > 2) set.add(`${parts[0]}/${parts[1]}/`);
  }
  return [...set].sort();
}

/** 다시 연결 · App 설치 버튼 */
function RestartActions() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [installUrl] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : sessionStorage.getItem(GH_INSTALL_KEY);
    } catch {
      return null;
    }
  });

  async function restart() {
    setBusy(true);
    setErr(null);
    try {
      const r = await githubApi.start();
      try {
        sessionStorage.setItem(GH_INSTALL_KEY, r.installation_url);
      } catch {}
      window.location.href = r.authorization_url;
    } catch (e) {
      setErr(toErr(e));
      setBusy(false);
    }
  }

  async function install() {
    let url = installUrl;
    if (!url) {
      try {
        url = (await githubApi.start()).installation_url;
      } catch (e) {
        return setErr(toErr(e));
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2">
      {err && <p className="text-[12.5px] text-red-600">{err.msg}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={install}>
          GitHub App 설치하기
        </Button>
        <Button onClick={restart} loading={busy}>
          다시 연결
        </Button>
      </div>
    </div>
  );
}

/** 저장소가 없을 때: App 설치 → 다시 연결 */
function NoRepos() {
  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-[13.5px] font-medium text-zinc-900">연결할 수 있는 저장소가 없어요</p>
      <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-zinc-600">
        <li>
          <b className="font-medium text-zinc-800">MOA GitHub App</b>을 연결할 저장소(또는 조직)에 설치해야 해요. 설치할 때 &lsquo;선택한 저장소만&rsquo;을 골랐다면 연결할 저장소를 포함해 주세요.
        </li>
        <li>로그인한 GitHub 계정이 그 저장소의 관리자 권한을 가지고 있어야 목록에 나와요.</li>
        <li>설치를 마쳤으면 &lsquo;다시 연결&rsquo;을 눌러 주세요. GitHub 인증은 10분 동안만 유효해요.</li>
      </ol>
      <RestartActions />
    </div>
  );
}

/** GitHub 인증 후 돌아오는 페이지: 인증 완료 → 저장소·브랜치·경로 선택 → 연동·최초 인덱싱 */
export function GitHubCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  // App 설치 화면에서 돌아온 경우 (설치 URL에는 state가 없음)
  const installedOnly = params.get("setup_action") === "install" && !state;
  const [authId, setAuthId] = useState<string | null>(null);
  const [repos, setRepos] = useState<AuthorizedRepository[] | null>(null);
  const [repo, setRepo] = useState<AuthorizedRepository | null>(null);
  const [branches, setBranches] = useState<Array<{ name: string; sha: string }> | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [include, setInclude] = useState<string[]>([]);
  const [excludes, setExcludes] = useState<string[]>(DEFAULT_EXCLUDES);
  const [newPattern, setNewPattern] = useState("");
  // 설정 화면에서 고른 보안 레벨 (GitHub 왕복 동안 sessionStorage에 보관)
  const [level, setLevel] = useState<1 | 2>(() => {
    try {
      const l = typeof window === "undefined" ? 2 : Number(sessionStorage.getItem(GH_LEVEL_KEY));
      return l === 1 ? 1 : 2;
    } catch {
      return 2;
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const started = useRef(false);
  const pending = useRef<{ key: string; body: GitHubConnectBody } | null>(null);

  // code는 한 번만 사용 가능 → 개발 모드 이중 실행에서도 1회만 호출
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (installedOnly) return;
    if (!code || !state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErr({ msg: "GitHub에서 인증 정보를 받지 못했어요. 연결을 다시 시작해 주세요." });
      return;
    }
    githubApi
      .complete(state, code)
      .then((r) => {
        setAuthId(r.authorization_id);
        setRepos(r.repositories);
        if (r.repositories.length === 1) setRepo(r.repositories[0]);
      })
      .catch((e) => setErr(toErr(e)));
  }, [code, state, installedOnly]);

  // 저장소 → 브랜치
  useEffect(() => {
    if (!authId || !repo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBranches(null);
    setBranch(null);
    setPaths(null);
    githubApi
      .branches(authId, repo.repository_id)
      .then((r) => {
        setBranches(r.branches);
        setBranch(r.branches.some((b) => b.name === repo.default_branch) ? repo.default_branch : (r.branches[0]?.name ?? null));
      })
      .catch((e) => setErr(toErr(e)));
  }, [authId, repo]);

  // 브랜치 → 경로
  useEffect(() => {
    if (!authId || !repo || !branch) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaths(null);
    setInclude([]);
    githubApi
      .paths(authId, repo.repository_id, branch)
      .then((r) => setPaths(r.paths))
      .catch((e) => setErr(toErr(e)));
  }, [authId, repo, branch]);

  const dirs = useMemo(() => (paths ? dirsOf(paths) : []), [paths]);

  async function connect() {
    if (!authId || !repo || !branch) return;
    if (level === 2 && include.length === 0) return setErr({ msg: "레벨 2는 감시할 경로를 하나 이상 골라야 해요." });
    const body: GitHubConnectBody = {
      authorization_id: authId,
      installation_id: repo.installation_id,
      repository: repo.repository,
      watch_branch: branch,
      security_level: level,
      include_paths: include,
      exclude_patterns: excludes,
      document_bindings: [],
    };
    const prev = pending.current;
    const key = prev && JSON.stringify(prev.body) === JSON.stringify(body) ? prev.key : newIdempotencyKey();
    pending.current = { key, body };
    setBusy(true);
    setErr(null);
    try {
      await githubApi.connect(body, key);
      pending.current = null;
      try {
        sessionStorage.removeItem(GH_LEVEL_KEY);
      } catch {}
      router.replace("/settings?github=connected");
    } catch (e) {
      setErr(toErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="size-3.5" /> 설정으로
        </Link>
      </div>
      <PageHeader title="GitHub 연결" desc="인증한 저장소에서 감시할 브랜치와 경로를 고르면 최초 인덱싱을 시작해요." />

      {err && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="size-4" /> {err.msg}
          {err.rid && <span className="font-mono text-[10.5px] text-red-400">{err.rid}</span>}
        </div>
      )}

      {installedOnly && !repos && (
        <Card className="max-w-2xl p-5">
          <p className="text-[14px] font-semibold text-zinc-900">GitHub App 설치를 마쳤어요</p>
          <p className="mt-1 text-[13px] text-zinc-500">이제 GitHub 계정 인증으로 저장소를 연결해 주세요.</p>
          <div className="mt-4">
            <RestartActions />
          </div>
        </Card>
      )}
      {err && !repos && (
        <Card className="max-w-2xl p-5">
          <p className="text-[13px] leading-relaxed text-zinc-600">
            GitHub 인증은 시작 후 <b className="font-medium text-zinc-800">10분</b> 동안, 한 번만 쓸 수 있어요. 시간이 지났거나 이 페이지를 새로고침했다면 처음부터 다시 연결해 주세요. App을
            아직 설치하지 않았다면 먼저 설치하세요.
          </p>
          <div className="mt-4">
            <RestartActions />
          </div>
        </Card>
      )}
      {!repos && !err && !installedOnly && <LoadingBlock />}

      {repos && (
        <div className="grid max-w-4xl gap-5">
          {/* 1. 저장소 */}
          <Card>
            <CardHeader title="1. 저장소" desc="GitHub App이 설치된, 관리 가능한 저장소예요" icon={<FolderGit2 className="size-4" />} />
            <div className="grid gap-2 p-5 sm:grid-cols-2">
              {repos.length === 0 && <NoRepos />}
              {repos.map((r) => (
                <button
                  key={r.repository_id}
                  onClick={() => setRepo(r)}
                  className={cn("rounded-xl border px-4 py-3 text-left transition", repo?.repository_id === r.repository_id ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300")}
                >
                  <p className="font-mono text-[13.5px] text-zinc-900">{r.repository}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">기본 브랜치 {r.default_branch}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* 2. 브랜치 */}
          {repo && (
            <Card>
              <CardHeader title="2. 감시 브랜치" desc="이 브랜치에 push가 들어오면 변경을 감지해요" icon={<GitBranch className="size-4" />} />
              <div className="flex flex-wrap gap-2 p-5">
                {!branches && <LoadingBlock />}
                {branches?.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => setBranch(b.name)}
                    className={cn("rounded-lg border px-3 py-1.5 font-mono text-[13px] transition", branch === b.name ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-300")}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* 3. 경로·제외 패턴 */}
          {branch && (
            <Card>
              <CardHeader title="3. 감시 경로 · 제외 패턴" desc={`레벨 ${level}: ${level === 2 ? "선택한 경로의 코드만 읽어요" : "코드 본문 없이 메타데이터만 써요"}`} icon={<Lock className="size-4" />} />
              <div className="space-y-4 p-5">
                <div className="flex gap-2 text-[13px]">
                  {([1, 2] as const).map((l) => (
                    <button key={l} onClick={() => setLevel(l)} className={cn("rounded-lg border px-3 py-1.5 transition", level === l ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-300")}>
                      레벨 {l} · {l === 1 ? "메타데이터만" : "범위 제한 연동"}
                    </button>
                  ))}
                </div>
                {!paths ? (
                  <LoadingBlock />
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {dirs.map((d) => {
                      const on = include.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => setInclude(on ? include.filter((x) => x !== d) : [...include, d])}
                          className={cn("flex items-center gap-2 truncate rounded-lg border px-3 py-2 text-left font-mono text-[12.5px] transition", on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-300")}
                        >
                          <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-white bg-white text-zinc-900" : "border-zinc-300 bg-white")}>
                            {on && <Check className="size-3" />}
                          </span>
                          {d}
                        </button>
                      );
                    })}
                    {dirs.length === 0 && <p className="text-[13px] text-zinc-500">선택할 디렉터리가 없어요.</p>}
                  </div>
                )}
                <div>
                  <p className="text-[12px] text-zinc-500">제외 패턴 (비밀값 파일은 기본 제외)</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {excludes.map((p) => (
                      <Badge key={p} className="bg-zinc-100 font-mono text-zinc-700">
                        {p}
                        {!DEFAULT_EXCLUDES.includes(p) && (
                          <button onClick={() => setExcludes(excludes.filter((x) => x !== p))} aria-label={`${p} 삭제`}>
                            <X className="size-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                    <input
                      value={newPattern}
                      onChange={(e) => setNewPattern(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPattern.trim()) {
                          if (!excludes.includes(newPattern.trim())) setExcludes([...excludes, newPattern.trim()]);
                          setNewPattern("");
                        }
                      }}
                      placeholder="+ 패턴 (Enter)"
                      className="h-6 w-36 rounded-md border border-dashed border-zinc-300 px-2 font-mono text-[12px] outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end border-t border-zinc-100 pt-4">
                  <Button onClick={connect} loading={busy} disabled={!paths}>
                    연결하고 최초 인덱싱 시작
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
