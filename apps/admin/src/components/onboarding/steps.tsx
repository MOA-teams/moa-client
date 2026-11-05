"use client";

import "@/lib/browser-mock"; // 데모 데이터는 브라우저 안에서 처리

import {
  AlertCircle,
  BookText,
  Check,
  EyeOff,
  FileCode2,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, adminApi, onboardingApi } from "@moa/shared/api";
import {
  CATEGORY_LABEL,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  DOC_TYPE_LABEL,
  SECURITY_LEVELS,
  SOURCE_TYPE_LABEL,
  URGENCY_LABEL,
  URGENCY_TONE,
} from "@moa/shared/labels";
import type { DocType, KDocument, SecurityLevel, ServiceInfo, Settings, TestResult } from "@moa/shared/types";
import { cn, pct } from "@moa/shared/utils";
import { Badge, Button, Card, Notice, Select, Spinner } from "@moa/ui";
import type { StepProps } from "./wizard";

const inputCls =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100";
const areaCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100";

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="-mt-3 mb-6 text-[14px] leading-relaxed text-zinc-500">{children}</p>;
}

function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-zinc-800">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {hint && <span className="ml-2 text-[12px] text-zinc-400">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*                           1. 서비스 기본 정보                                 */
/* -------------------------------------------------------------------------- */

const TONES = ["친절하고 간결하게, 해결 단계는 번호로 안내", "정중하고 격식 있게", "편안한 대화체로 짧게"];

export function ServiceStep({ setFooter }: StepProps) {
  const [form, setForm] = useState<ServiceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings().then((s) => setForm(s.service));
  }, []);

  useEffect(() => {
    if (!form) return;
    setFooter({
      label: "저장하고 다음",
      disabled: !form.name.trim(),
      onNext: async () => {
        try {
          await onboardingApi.saveService(form);
          return true;
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "저장하지 못했어요");
          return false;
        }
      },
    });
  }, [form, setFooter]);

  if (!form) return <Spinner />;
  const set = <K extends keyof ServiceInfo>(k: K, v: ServiceInfo[K]) => setForm({ ...form, [k]: v });
  const setPlan = (i: number, k: "name" | "price" | "features", v: string) =>
    set("plans", form.plans.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <>
      <Lead>문서가 하나도 없어도 이 정보만으로 기본 초안을 만들 수 있어요. 저장하면 &lsquo;서비스 기본 정보&rsquo; 문서로도 등록돼요.</Lead>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="서비스명" required>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 싱크노트" />
          </Field>
          <Field label="운영 시간">
            <input className={inputCls} value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="평일 10:00 ~ 19:00" />
          </Field>
        </div>
        <Field label="한 줄 소개">
          <input className={inputCls} value={form.intro} onChange={(e) => set("intro", e.target.value)} />
        </Field>

        <div>
          <p className="text-[13px] font-medium text-zinc-800">요금제</p>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="grid grid-cols-[1fr_1.3fr_2fr_36px] gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[11.5px] font-medium text-zinc-500">
              <span>이름</span>
              <span>가격</span>
              <span>포함 기능</span>
              <span />
            </div>
            {form.plans.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.3fr_2fr_36px] items-center gap-2 border-b border-zinc-50 px-3 py-2 last:border-0">
                <input className="h-8 rounded-md px-2 text-[13.5px] outline-none hover:bg-zinc-50 focus:bg-zinc-50" value={p.name} onChange={(e) => setPlan(i, "name", e.target.value)} placeholder="Pro" />
                <input className="h-8 rounded-md px-2 text-[13.5px] outline-none hover:bg-zinc-50 focus:bg-zinc-50" value={p.price} onChange={(e) => setPlan(i, "price", e.target.value)} placeholder="월 9,900원" />
                <input className="h-8 rounded-md px-2 text-[13.5px] outline-none hover:bg-zinc-50 focus:bg-zinc-50" value={p.features} onChange={(e) => setPlan(i, "features", e.target.value)} placeholder="포함 기능" />
                <button onClick={() => set("plans", form.plans.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="요금제 삭제">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => set("plans", [...form.plans, { name: "", price: "", features: "" }])}
              className="flex w-full items-center gap-1.5 px-3 py-2.5 text-[13px] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
            >
              <Plus className="size-3.5" /> 요금제 추가
            </button>
          </div>
        </div>

        <Field label="환불 정책 요약">
          <textarea className={areaCls} rows={2} value={form.refundSummary} onChange={(e) => set("refundSummary", e.target.value)} />
        </Field>
        <Field label="주요 기능">
          <textarea className={areaCls} rows={2} value={form.features} onChange={(e) => set("features", e.target.value)} />
        </Field>
        <Field label="답변 톤" hint="우수 답변이 쌓이기 전까지 초안 형식의 기준이 돼요">
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => set("tone", t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition",
                  form.tone === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <input className={cn(inputCls, "mt-2")} value={form.tone} onChange={(e) => set("tone", e.target.value)} placeholder="직접 입력" />
        </Field>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                               2. 문서 업로드                                  */
/* -------------------------------------------------------------------------- */

interface PendingDoc {
  key: string;
  file: File;
  title: string;
  type: DocType;
  state: "ready" | "uploading" | "done" | "error";
  message?: string;
}

const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as DocType[];

function guessType(name: string): DocType {
  if (/faq|질문/i.test(name)) return "faq";
  if (/release|릴리즈|변경/i.test(name)) return "release";
  if (/spec|명세|기능/i.test(name)) return "spec";
  return "policy";
}

export function DocsStep({ setFooter }: StepProps) {
  const [docs, setDocs] = useState<KDocument[] | null>(null);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => adminApi.documents().then(setDocs);
  useEffect(() => {
    load();
  }, []);

  const ready = pending.filter((p) => p.state === "ready");

  async function uploadAll() {
    for (const p of ready) {
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, state: "uploading" } : y)));
      try {
        const content = p.file.type === "application/pdf" ? `(PDF 본문 추출 예정: ${p.file.name})` : await p.file.text();
        const doc = await adminApi.uploadDocument({ title: p.title, type: p.type, content });
        setPending((x) => x.map((y) => (y.key === p.key ? { ...y, state: "done", message: doc.version > 1 ? `v${doc.version}로 갱신` : "v1 등록" } : y)));
      } catch (e) {
        setPending((x) => x.map((y) => (y.key === p.key ? { ...y, state: "error", message: e instanceof Error ? e.message : "실패" } : y)));
      }
    }
    await load();
  }

  useEffect(() => {
    setFooter({
      label: ready.length ? `${ready.length}개 업로드하고 다음` : "다음",
      onNext: async () => {
        if (ready.length) await uploadAll();
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, setFooter]);

  function add(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files)
      .filter((f) => /\.(md|pdf|txt)$/i.test(f.name))
      .map((f) => ({
        key: `${f.name}-${f.size}-${Math.random()}`,
        file: f,
        title: f.name.replace(/\.(md|pdf|txt)$/i, ""),
        type: guessType(f.name),
        state: "ready" as const,
      }));
    setPending((p) => [...p, ...list]);
  }

  const titles = new Set(docs?.map((d) => d.title));

  return (
    <>
      <Lead>
        PDF·MD를 올리고 문서 종류만 고르면 돼요. 작성일은 업로드 시각, 버전은 같은 문서를 다시 올리면 자동으로 +1, 상태는 기본 &lsquo;유효&rsquo;예요.
      </Lead>

      <input ref={fileRef} type="file" accept=".md,.pdf,.txt" multiple className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition",
          drag ? "border-zinc-900 bg-zinc-100" : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-zinc-100 text-zinc-500">
          <FileUp className="size-5" />
        </span>
        <span className="text-[14px] font-medium text-zinc-800">파일을 끌어다 놓거나 클릭해서 선택</span>
        <span className="text-[12.5px] text-zinc-500">.md · .pdf</span>
      </button>

      {pending.length > 0 && (
        <Card className="mt-4 divide-y divide-zinc-100">
          {pending.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <BookText className="size-4 shrink-0 text-zinc-400" />
              <input
                value={p.title}
                disabled={p.state !== "ready"}
                onChange={(e) => setPending((x) => x.map((y) => (y.key === p.key ? { ...y, title: e.target.value } : y)))}
                className="h-8 min-w-0 flex-1 rounded-md border border-transparent px-2 text-[13.5px] font-medium outline-none hover:border-zinc-200 focus:border-zinc-400 disabled:bg-transparent"
              />
              {p.state === "ready" && titles.has(p.title.trim()) && <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/15">새 버전으로 올라가요</Badge>}
              <Select
                aria-label="문서 종류"
                value={p.type}
                onChange={(v) => setPending((x) => x.map((y) => (y.key === p.key ? { ...y, type: v } : y)))}
                options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))}
              />
              <span className="w-24 text-right text-[12.5px]">
                {p.state === "ready" && (
                  <button onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))} className="text-zinc-400 hover:text-zinc-700">
                    삭제
                  </button>
                )}
                {p.state === "uploading" && <Spinner className="ml-auto" />}
                {p.state === "done" && (
                  <span className="text-emerald-700">
                    <Check className="mr-0.5 inline size-3.5" />
                    {p.message}
                  </span>
                )}
                {p.state === "error" && <span className="text-red-600">{p.message}</span>}
              </span>
            </div>
          ))}
          {ready.length > 0 && (
            <div className="flex justify-end px-4 py-3">
              <Button size="sm" variant="outline" onClick={uploadAll}>
                <Upload className="size-3.5" /> {ready.length}개 업로드
              </Button>
            </div>
          )}
        </Card>
      )}

      <p className="mb-2 mt-8 text-[13px] font-medium text-zinc-800">등록된 문서 {docs ? `${docs.length}개` : ""}</p>
      <Card className="divide-y divide-zinc-100">
        {!docs && (
          <div className="p-4">
            <Spinner />
          </div>
        )}
        {docs?.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-zinc-800">{d.title}</span>
            <span className="text-[12px] text-zinc-500">{DOC_TYPE_LABEL[d.type]}</span>
            <span className="w-8 font-mono text-[12px] text-zinc-500">v{d.version}</span>
            <Badge className={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
          </div>
        ))}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                         3. GitHub 연결 + 보안 레벨                            */
/* -------------------------------------------------------------------------- */

const BASE_EXCLUDES = [".env*", "*.pem", "*.key", "secrets/", "config/prod*"];
const REPOS = ["flownote-demo/flownote", "flownote-demo/flownote-landing"];
const BRANCHES = ["main", "release", "develop"];

type GitForm = Pick<Settings, "securityLevel" | "repo" | "branch" | "watchPaths" | "excludePatterns">;

export function GithubStep({ state, setState, setFooter }: StepProps) {
  const [form, setForm] = useState<GitForm | null>(null);
  const [saved, setSaved] = useState<GitForm | null>(null);
  const [installing, setInstalling] = useState(false);
  const [indexing, setIndexing] = useState(0); // 0 = idle, 1~100 진행률
  const [newPattern, setNewPattern] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings().then((s) => {
      const f = { securityLevel: s.securityLevel, repo: s.repo, branch: s.branch, watchPaths: s.watchPaths, excludePatterns: s.excludePatterns };
      setForm(f);
      setSaved(f);
    });
  }, []);

  const dirs = useMemo(() => [...new Set(state.repoTree.filter((p) => p.includes("/")).map((p) => p.split("/")[0] + "/"))], [state.repoTree]);
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const needsIndex = !state.index || changed || state.index.level !== form?.securityLevel;

  async function persist() {
    if (!form) return;
    await adminApi.updateSettings(form);
    setSaved(form);
  }

  async function install() {
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 900));
    setState(await onboardingApi.patch({ githubInstalled: true }));
    setInstalling(false);
  }

  async function runIndex() {
    setError(null);
    try {
      await persist();
      for (let p = 8; p < 100; p += 13) {
        setIndexing(p);
        await new Promise((r) => setTimeout(r, 140));
      }
      const index = await onboardingApi.index();
      setState({ ...(await onboardingApi.get()), index });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "인덱싱에 실패했어요");
    } finally {
      setIndexing(0);
    }
  }

  useEffect(() => {
    if (!form) return;
    const level0 = form.securityLevel === 0;
    setFooter({
      label: level0 ? "연동 없이 계속" : "다음",
      disabled: !level0 && needsIndex,
      onNext: async () => {
        if (level0) {
          await persist();
          await onboardingApi.index();
        }
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, needsIndex, setFooter]);

  if (!form) return <Spinner />;
  const set = <K extends keyof GitForm>(k: K, v: GitForm[K]) => setForm({ ...form, [k]: v });
  const level = form.securityLevel;

  return (
    <>
      <Lead>코드가 절대 밖으로 안 나가면서 분석 성능도 최고인 방식은 없어요. 프로젝트에 맞는 레벨을 직접 고르세요. 기본값은 레벨 2예요.</Lead>

      {/* 보안 레벨 */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SECURITY_LEVELS.map((l) => {
          const active = level === l.level;
          const disabled = l.level === 3;
          return (
            <button
              key={l.level}
              disabled={disabled}
              onClick={() => set("securityLevel", l.level as SecurityLevel)}
              className={cn(
                "rounded-xl border bg-white p-4 text-left transition",
                active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
                disabled && "cursor-not-allowed opacity-55",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full border",
                    active ? "border-zinc-900 bg-zinc-900" : "border-zinc-300",
                  )}
                >
                  {active && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                <span className="text-[14px] font-semibold text-zinc-900">
                  레벨 {l.level} · {l.name}
                </span>
                {disabled && <Badge className="ml-auto">구조도만 제시</Badge>}
              </div>
              <p className="mt-2 pl-6 text-[12.5px] leading-relaxed text-zinc-500">
                <span className="text-zinc-700">외부로 나가는 것: {l.outbound}</span>
                <br />
                {l.desc}
              </p>
            </button>
          );
        })}
      </div>

      {level === 0 ? (
        <div className="mt-6">
          <Notice tone="info" icon={<AlertCircle className="size-4" />} title="GitHub 없이 문서 기반으로만 동작해요">
            변경 감지는 문서를 다시 올릴 때 버전 비교로 대신하고, 코드 근거와 이슈 생성은 쓸 수 없어요. 나중에 설정에서 언제든 연결할 수 있어요.
          </Notice>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* App 설치 */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white">
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                  <path d="M12 .5C5.73.5.75 5.48.75 11.76c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.64 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.55.23 2.7.11 2.98.72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54a11.26 11.26 0 0 0 7.68-10.67C23.25 5.48 18.27.5 12 .5Z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-zinc-900">모아 GitHub App</p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">읽기 전용으로 설치돼요. 코드 쓰기·PR 권한은 요청하지 않아요.</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/15">contents: read</Badge>
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/15">metadata: read</Badge>
                  <Badge className="bg-sky-50 text-sky-700 ring-sky-600/15">issues: write</Badge>
                </div>
              </div>
              {state.githubInstalled ? (
                <Badge className="bg-emerald-50 py-1 text-emerald-700 ring-emerald-600/20">
                  <Check className="size-3.5" /> 설치됨
                </Badge>
              ) : (
                <Button onClick={install} loading={installing}>
                  GitHub App 설치
                </Button>
              )}
            </div>
          </Card>

          {state.githubInstalled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="레포">
                  <Select aria-label="레포" className="h-10 w-full font-mono" value={form.repo} onChange={(v) => set("repo", v)} options={REPOS.map((r) => ({ value: r, label: r }))} />
                </Field>
                <Field label="감시 브랜치" hint="push가 들어오면 변경 감지">
                  <Select aria-label="브랜치" className="h-10 w-full font-mono" value={form.branch} onChange={(v) => set("branch", v)} options={BRANCHES.map((b) => ({ value: b, label: b }))} />
                </Field>
              </div>

              <div>
                <p className="text-[13px] font-medium text-zinc-800">
                  감시 경로 <span className="ml-1 text-[12px] font-normal text-zinc-400">선택한 디렉터리만 읽고 인덱싱해요</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {dirs.map((d) => {
                    const on = form.watchPaths.includes(d);
                    const ex = form.excludePatterns.some((p) => p === d || (p.endsWith("*") && d.startsWith(p.slice(0, -1))));
                    return (
                      <button
                        key={d}
                        disabled={ex}
                        onClick={() => set("watchPaths", on ? form.watchPaths.filter((x) => x !== d) : [...form.watchPaths, d])}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-[13px] transition",
                          ex
                            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                            : on
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                        )}
                      >
                        {ex ? <Lock className="size-3.5" /> : on ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[13px] font-medium text-zinc-800">
                  제외 패턴 <span className="ml-1 text-[12px] font-normal text-zinc-400">비밀값 파일은 기본 제외, 필요하면 추가</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.excludePatterns.map((p) => {
                    const base = BASE_EXCLUDES.includes(p);
                    return (
                      <span key={p} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-mono text-[12.5px] text-zinc-700 ring-1 ring-zinc-200">
                        {base && <Lock className="size-3 text-zinc-400" />}
                        {p}
                        {!base && (
                          <button onClick={() => set("excludePatterns", form.excludePatterns.filter((x) => x !== p))} aria-label={`${p} 삭제`} className="text-zinc-400 hover:text-zinc-800">
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                  <span className="inline-flex items-center gap-1">
                    <input
                      value={newPattern}
                      onChange={(e) => setNewPattern(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPattern.trim()) {
                          if (!form.excludePatterns.includes(newPattern.trim())) set("excludePatterns", [...form.excludePatterns, newPattern.trim()]);
                          setNewPattern("");
                        }
                      }}
                      placeholder="+ 패턴 추가 (Enter)"
                      className="h-7 w-40 rounded-md border border-dashed border-zinc-300 bg-transparent px-2 font-mono text-[12.5px] outline-none focus:border-zinc-500"
                    />
                  </span>
                </div>
              </div>

              {/* 인덱싱 */}
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-zinc-900">최초 인덱싱</p>
                    <p className="text-[12.5px] text-zinc-500">
                      {level === 1 ? "레벨 1: 코드 본문은 읽지 않고 경로·커밋 메시지·함수 이름만 수집해요" : "제외 패턴 적용 → 시크릿 스캔(키·토큰 마스킹) → 파일 단위 청크로 인덱싱"}
                    </p>
                  </div>
                  <Button variant={needsIndex ? "primary" : "outline"} onClick={runIndex} loading={indexing > 0} disabled={form.watchPaths.length === 0}>
                    {state.index && !needsIndex ? "다시 인덱싱" : changed && state.index ? "변경사항으로 다시 인덱싱" : "인덱싱 시작"}
                  </Button>
                </div>
                {indexing > 0 && (
                  <div className="px-5 pb-4">
                    <div className="h-1.5 rounded-full bg-zinc-100">
                      <div className="h-1.5 rounded-full bg-zinc-900 transition-all" style={{ width: `${indexing}%` }} />
                    </div>
                    <p className="mt-1.5 text-[12px] text-zinc-500">
                      {indexing < 35 ? "레포 트리 읽는 중…" : indexing < 70 ? "제외 패턴·시크릿 스캔 중…" : "청크 임베딩 중…"}
                    </p>
                  </div>
                )}
                {state.index && indexing === 0 && <IndexResult index={state.index} stale={needsIndex} />}
              </Card>
              {error && <p className="text-[13px] text-red-600">{error}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}

function IndexResult({ index, stale }: { index: NonNullable<StepProps["state"]["index"]>; stale: boolean }) {
  return (
    <div className={cn("border-t border-zinc-100 bg-zinc-50/60 px-5 py-4", stale && "opacity-50")}>
      <div className="grid grid-cols-3 gap-3">
        <Metric label={index.level === 1 ? "메타데이터 수집" : "인덱싱한 파일"} value={index.indexedFiles.length} icon={<FileCode2 className="size-4" />} />
        <Metric label="제외한 파일" value={index.excluded.length} icon={<EyeOff className="size-4" />} />
        <Metric label="마스킹한 시크릿" value={index.masked.length} icon={<KeyRound className="size-4" />} tone={index.masked.length ? "text-amber-600" : undefined} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11.5px] font-medium text-zinc-500">제외됨 (외부로 나가지 않음)</p>
          <ul className="space-y-1">
            {index.excluded.map((e) => (
              <li key={e.path} className="flex items-center gap-2 text-[12.5px]">
                <EyeOff className="size-3.5 shrink-0 text-zinc-400" />
                <span className="font-mono text-zinc-500 line-through">{e.path}</span>
                <span className="truncate text-[11.5px] text-zinc-400">{e.reason}</span>
              </li>
            ))}
            {index.outsideWatch > 0 && <li className="text-[12px] text-zinc-400">+ 감시 경로 밖 {index.outsideWatch}개 파일은 읽지 않음</li>}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-[11.5px] font-medium text-zinc-500">시크릿 스캔 (해당 줄 마스킹)</p>
          {index.masked.length ? (
            <ul className="space-y-1">
              {index.masked.map((m) => (
                <li key={m.path} className="flex items-center gap-2 text-[12.5px]">
                  <KeyRound className="size-3.5 shrink-0 text-amber-500" />
                  <span className="font-mono text-zinc-700">
                    {m.path}:{m.line}
                  </span>
                  <span className="truncate text-[11.5px] text-zinc-500">{m.kind}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-zinc-400">{index.level === 1 ? "레벨 1은 코드 본문을 읽지 않아요" : "발견된 시크릿 없음"}</p>
          )}
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-emerald-700">
        <ShieldCheck className="size-3.5" />
        {index.repo}@{index.branch} · {index.level === 1 ? "메타데이터만 수집" : `청크 ${index.chunks}개 · 코드는 담당자 화면 근거로만 사용`}
      </p>
    </div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg bg-white px-3.5 py-3 ring-1 ring-zinc-200/70">
      <p className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums text-zinc-900", tone)}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                           4. 과거 문의 CSV import                              */
/* -------------------------------------------------------------------------- */

const SAMPLE_CSV = `question,answer
"동기화가 안 돼요","안녕하세요, 싱크노트입니다. 설정 > 동기화에서 '지금 동기화'를 눌러주세요. 계속되면 로그아웃 후 다시 로그인해 주세요."
"노트를 휴지통에서 복구할 수 있나요?","네, 휴지통에서 30일간 보관돼요. 휴지통 > 노트 선택 > 복구를 눌러주세요."
"팀원 초대는 어떻게 하나요?","Team 요금제에서 워크스페이스 설정 > 멤버 > 초대하기로 이메일을 보내실 수 있어요."
"오프라인에서도 쓸 수 있나요?","설정 > 실험실에서 오프라인 모드(베타)를 켜면 인터넷 없이도 작성할 수 있어요."`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function toPairs(text: string) {
  const rows = parseCsv(text.trim());
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const qi = head.findIndex((h) => ["question", "문의", "질문"].includes(h));
  const ai = head.findIndex((h) => ["answer", "답변"].includes(h));
  const body = qi >= 0 && ai >= 0 ? rows.slice(1) : rows;
  return body.map((r) => ({ question: (r[qi >= 0 ? qi : 0] ?? "").trim(), answer: (r[ai >= 0 ? ai : 1] ?? "").trim() })).filter((p) => p.question && p.answer);
}

export function ImportStep({ state, setState, setFooter }: StepProps) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pairs = useMemo(() => toPairs(csv), [csv]);

  useEffect(() => {
    setFooter(null);
  }, [setFooter]);

  async function doImport() {
    setBusy(true);
    try {
      const r = await onboardingApi.importAnswers(pairs);
      setResult(`${r.imported}개를 우수 답변 후보로 등록했어요.`);
      setCsv("");
      setState(await onboardingApi.get());
    } catch (e) {
      setResult(e instanceof ApiError ? e.message : "가져오지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Lead>
        과거에 주고받은 문의/답변 쌍이 있다면 CSV로 올려주세요. 우수 답변 후보로 등록되지만, 별점이 없으니 담당자가 하나씩 확인하고 승인해야 해요. 없으면 건너뛰어도 돼요.
      </Lead>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet className="size-4" /> CSV 파일 선택
        </Button>
        <Button variant="ghost" onClick={() => setCsv(SAMPLE_CSV)}>
          샘플 불러오기
        </Button>
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={5}
        placeholder={'question,answer\n"환불 되나요?","결제일로부터 7일 이내면…"'}
        className={cn(areaCls, "mt-3 font-mono text-[12.5px]")}
      />

      {pairs.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <p className="text-[13px] font-medium text-zinc-800">미리보기 · {pairs.length}쌍</p>
            <Button size="sm" onClick={doImport} loading={busy}>
              후보로 가져오기
            </Button>
          </div>
          <div className="max-h-72 divide-y divide-zinc-100 overflow-y-auto">
            {pairs.map((p, i) => (
              <div key={i} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[1fr_1.6fr] sm:gap-4">
                <p className="text-[13px] font-medium text-zinc-800">{p.question}</p>
                <p className="line-clamp-2 text-[12.5px] text-zinc-500">{p.answer}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <div className="mt-4">
          <Notice tone="success" icon={<Check className="size-4" />} title={result}>
            <Link href="/best-answers" target="_blank" className="font-medium underline underline-offset-2">
              우수 답변 후보에서 승인하기 →
            </Link>
          </Notice>
        </div>
      )}
      {state.importedCount > 0 && !result && (
        <p className="mt-4 text-[13px] text-zinc-500">지금까지 {state.importedCount}개를 가져왔어요.</p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                5. 테스트 문의                                 */
/* -------------------------------------------------------------------------- */

const PRESETS = ["Pro 요금 한 달에 얼마예요?", "어제 결제했는데 환불 되나요?", "저장하면 E-502 떠요", "회사에서 SSO 로그인 되나요?", "안 돼요"];

export function TestStep({ state, setFooter }: StepProps) {
  const [text, setText] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    setFooter({ label: "세팅 완료하고 인박스로", disabled: !result && !state.steps[5] });
  }, [result, state.steps, setFooter]);

  async function run(t = text) {
    setText(t);
    setBusy(true);
    try {
      setResult(await onboardingApi.test(t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Lead>샘플 문의를 넣어 분류와 초안이 바로 나오는지 확인해요. 실제 문의로 저장되지는 않아요.</Lead>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] transition",
              text === p && result ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2 rounded-xl border border-zinc-200 bg-white p-2 focus-within:border-zinc-400">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              run();
            }
          }}
          rows={2}
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none"
          placeholder="테스트 문의를 입력하세요"
        />
        <Button onClick={() => run()} loading={busy} disabled={!text.trim()}>
          <Send className="size-3.5" /> 테스트
        </Button>
      </div>

      {result && (
        <Card className="mt-5 animate-fade-up overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3.5">
            <Sparkles className="size-4 text-indigo-500" />
            <span className="text-[13px] text-zinc-500">AI 분류</span>
            <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/15">{CATEGORY_LABEL[result.category]}</Badge>
            <Badge className={URGENCY_TONE[result.urgency]}>긴급도 {URGENCY_LABEL[result.urgency]}</Badge>
            <span className="text-[12.5px] text-zinc-400">· {result.topic}</span>
          </div>
          <div className="space-y-3 px-5 py-4">
            {result.autoInfoRequest && (
              <Notice tone="info" title="정보 수집 질문이 자동 발송돼요">
                문의 내용이 부족해 &ldquo;어떤 화면에서 안 되나요? 오류 코드나 화면 캡처를 보내주세요&rdquo;를 담당자 승인 없이 바로 보내요.
              </Notice>
            )}
            {result.draft.conflicts.length > 0 && (
              <Notice tone="danger" title="근거 충돌">
                {result.draft.conflicts.join(" / ")}
              </Notice>
            )}
            {result.draft.manualCheckReasons.length > 0 && !result.autoInfoRequest && (
              <Notice tone="warn" icon={<AlertCircle className="size-4" />} title="직접 확인 필요">
                {result.draft.manualCheckReasons.join(" ")}
              </Notice>
            )}
            {result.draft.text && (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-zinc-500">답변 초안 (담당자 승인 후 발송)</p>
                <p className="whitespace-pre-line rounded-lg bg-zinc-50 px-4 py-3 text-[14px] leading-relaxed text-zinc-800">{result.draft.text}</p>
              </div>
            )}
            {result.draft.sources.length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-zinc-500">출처</p>
                <ul className="flex flex-wrap gap-1.5">
                  {result.draft.sources.map((s) => (
                    <li key={s.id}>
                      <Badge
                        className={
                          s.role === "internal"
                            ? "bg-violet-50 text-violet-700 ring-violet-600/15"
                            : s.role === "format"
                              ? "bg-amber-50 text-amber-700 ring-amber-600/15"
                              : "bg-white text-zinc-700 ring-zinc-300/70"
                        }
                      >
                        {SOURCE_TYPE_LABEL[s.type]} · {s.title.length > 24 ? s.title.slice(0, 24) + "…" : s.title}
                        {s.docVersion ? ` v${s.docVersion}` : ""} · {pct(s.similarity)}
                        {s.role === "format" && " · 형식 참고"}
                        {s.role === "internal" && " · 담당자용"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
