"use client";

import { Building2, Check, FileClock, GitBranch, Lock, Plus, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { adminApi } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { SECURITY_LEVELS } from "@moa/shared/labels";
import type { SecurityLevel, Settings } from "@moa/shared/types";
import { cn, formatDateTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, Notice, PageHeader, Toggle } from "@moa/ui";

const BASE_EXCLUDES = [".env*", "*.pem", "*.key", "secrets/", "config/prod*"];

export function SettingsView() {
  const { data, refresh } = usePolling(async () => {
    const [settings, system] = await Promise.all([adminApi.settings(), adminApi.system()]);
    return { settings, system };
  }, 5000);
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPattern, setNewPattern] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  if (!data || !form) return <LoadingBlock />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setForm({ ...form, [k]: v });
    setSaved(false);
  };

  async function save(patch?: Partial<Settings>) {
    setSaving(true);
    try {
      const s = await adminApi.updateSettings(patch ?? form!);
      setForm(s);
      setSaved(true);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);

  return (
    <>
      <PageHeader
        title="설정 · 보안"
        desc="코드 연동 범위는 고객사가 보안 레벨로 직접 골라요. 기본값은 레벨 2(읽기 전용 + 경로 제한)."
        action={
          <div className="flex items-center gap-3">
            {saved && !dirty && (
              <span className="flex items-center gap-1 text-[12.5px] text-emerald-700">
                <Check className="size-3.5" /> 저장됨
              </span>
            )}
            <Button onClick={() => save()} loading={saving} disabled={!dirty}>
              변경사항 저장
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* 보안 레벨 */}
        <Card className="xl:col-span-2">
          <CardHeader title="코드 보안 레벨" desc="보안과 분석 성능은 트레이드오프예요. 프로젝트에 맞는 레벨을 고르세요." icon={<ShieldCheck className="size-4" />} />
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
            {SECURITY_LEVELS.map((l) => {
              const active = form.securityLevel === l.level;
              const disabled = l.level === 3;
              return (
                <button
                  key={l.level}
                  disabled={disabled}
                  onClick={() => set("securityLevel", l.level as SecurityLevel)}
                  className={cn(
                    "relative flex flex-col rounded-xl border p-4 text-left transition",
                    active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-zinc-400">레벨 {l.level}</span>
                    {active && (
                      <span className="grid size-5 place-items-center rounded-full bg-zinc-900 text-white">
                        <Check className="size-3" />
                      </span>
                    )}
                    {disabled && <Badge>구조도만 제시</Badge>}
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold text-zinc-900">{l.name}</p>
                  <p className="mt-2 text-[11.5px] font-medium text-zinc-500">외부로 나가는 것</p>
                  <p className="text-[12.5px] text-zinc-700">{l.outbound}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{l.desc}</p>
                </button>
              );
            })}
          </div>
          {form.securityLevel !== data.settings.securityLevel && form.securityLevel < 2 && (
            <div className="px-5 pb-5">
              <Notice tone="warn" title="저장하면 코드 인덱스·청크를 즉시 삭제해요 (S-08)">
                레벨 {form.securityLevel}에서는 코드 본문을 읽지 않아요. {form.securityLevel === 0 ? "변경 감지는 문서 재업로드 시 버전 비교로 대체되고, 이슈 생성이 불가합니다." : "커밋 메시지·변경 파일 경로로만 영향 분석을 하고, 이슈에는 파일 경로만 들어가요."}
              </Notice>
            </div>
          )}
        </Card>

        {/* GitHub */}
        <Card>
          <CardHeader
            title="GitHub 연동"
            desc={data.system.codeIndexed ? "코드 인덱스 활성 · 감시 경로만 인덱싱" : "코드 인덱스 없음"}
            icon={<GitBranch className="size-4" />}
          />
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-[12px] text-zinc-500">GitHub App 권한 (S-01)</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/15">contents: read</Badge>
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/15">metadata: read</Badge>
                <Badge className="bg-sky-50 text-sky-700 ring-sky-600/15">issues: write</Badge>
                <Badge className="bg-zinc-100 text-zinc-400 line-through">contents: write</Badge>
                <Badge className="bg-zinc-100 text-zinc-400 line-through">pull_requests</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="레포">
                <input value={form.repo} onChange={(e) => set("repo", e.target.value)} className={inputCls + " font-mono"} />
              </Field>
              <Field label="감시 브랜치">
                <input value={form.branch} onChange={(e) => set("branch", e.target.value)} className={inputCls + " font-mono"} />
              </Field>
            </div>
            <Field label="감시 경로 (S-02) — 쉼표로 구분">
              <input
                value={form.watchPaths.join(", ")}
                onChange={(e) => set("watchPaths", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className={inputCls + " font-mono"}
              />
            </Field>
            <div>
              <p className="text-[12px] text-zinc-500">제외 패턴 (S-03) — 기본 패턴은 해제할 수 없어요</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {form.excludePatterns.map((p) => {
                  const base = BASE_EXCLUDES.includes(p);
                  return (
                    <span key={p} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 font-mono text-[12px] text-zinc-700">
                      {base && <Lock className="size-3 text-zinc-400" />}
                      {p}
                      {!base && (
                        <button onClick={() => set("excludePatterns", form.excludePatterns.filter((x) => x !== p))} aria-label={`${p} 삭제`}>
                          <X className="size-3 text-zinc-400 hover:text-zinc-800" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="예: internal/**"
                  className={inputCls + " font-mono"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={!newPattern.trim()}
                  onClick={() => {
                    if (!form.excludePatterns.includes(newPattern.trim())) set("excludePatterns", [...form.excludePatterns, newPattern.trim()]);
                    setNewPattern("");
                  }}
                >
                  <Plus className="size-3.5" /> 추가
                </Button>
              </div>
            </div>
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[12px] leading-relaxed text-zinc-500">
              인덱싱 전 시크릿 스캔으로 API 키·토큰 패턴을 마스킹하거나 파일을 제외해요. 코드는 담당자 화면 근거로만 보이고, 고객 발송 초안에 섞이면 발송이 차단돼요 (S-04).
            </p>
          </div>
        </Card>

        {/* 임계값 */}
        <Card>
          <CardHeader title="임계값" desc="데모 데이터로 튜닝하는 초기값" icon={<SlidersHorizontal className="size-4" />} />
          <div className="space-y-4 px-5 py-4">
            <Range label="근거 유사도 임계값" hint="미달 시 초안 대신 '직접 확인 필요'" value={form.similarityThreshold} min={0.5} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set("similarityThreshold", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="급증 기준 건수">
                <input type="number" min={2} value={form.spikeCount} onChange={(e) => set("spikeCount", Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="급증 판단 시간 (분)">
                <input type="number" min={5} value={form.spikeWindowMinutes} onChange={(e) => set("spikeWindowMinutes", Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="자동 후보 별점">
                <input type="number" min={1} max={5} value={form.bestAnswerAutoScore} onChange={(e) => set("bestAnswerAutoScore", Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="조건부 후보 별점">
                <input type="number" min={1} max={5} value={form.bestAnswerConditionalScore} onChange={(e) => set("bestAnswerConditionalScore", Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <Range label="조건부 후보 수정량 한도" hint="담당자 수정량이 이 값 미만이면 후보" value={form.editRatioLimit} min={0.1} max={0.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("editRatioLimit", v)} />
            <Row label="급증 시 GitHub 이슈 자동 생성" desc="레벨 1 이상">
              <Toggle checked={form.autoCreateIssue} onChange={(v) => set("autoCreateIssue", v)} label="이슈 자동 생성" />
            </Row>
            <Row label="일반 RAG 모드 (비교 측정용)" desc="버전 관리·재검토·근거 원칙 끄기">
              <Toggle checked={form.ragMode === "naive"} onChange={(v) => set("ragMode", v ? "naive" : "moa")} label="일반 RAG 모드" />
            </Row>
          </div>
        </Card>

        {/* 서비스 정보 */}
        <Card>
          <CardHeader title="서비스 기본 정보" desc="문서가 없어도 이 정보만으로 기본 초안이 가능해야 해요" icon={<Building2 className="size-4" />} />
          <div className="space-y-3 px-5 py-4">
            <Field label="서비스명">
              <input value={form.service.name} onChange={(e) => set("service", { ...form.service, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="한 줄 소개">
              <input value={form.service.intro} onChange={(e) => set("service", { ...form.service, intro: e.target.value })} className={inputCls} />
            </Field>
            <Field label="답변 톤">
              <input value={form.service.tone} onChange={(e) => set("service", { ...form.service, tone: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="운영 시간">
                <input value={form.service.hours} onChange={(e) => set("service", { ...form.service, hours: e.target.value })} className={inputCls} />
              </Field>
              <Field label="평균 응답 (분) — 접수 안내에 표시">
                <input type="number" value={form.avgResponseMinutes} onChange={(e) => set("avgResponseMinutes", Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
          </div>
        </Card>

        {/* 감사 로그 */}
        <Card>
          <CardHeader title="감사 로그" desc="누가 언제 어떤 코드를 조회했는지, AI가 어떤 코드를 근거로 썼는지 (S-07)" icon={<FileClock className="size-4" />} />
          <ul className="scrollbar-thin max-h-[360px] divide-y divide-zinc-50 overflow-y-auto px-2 py-1">
            {data.system.audit.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-zinc-400">기록이 없어요</li>}
            {data.system.audit.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2.5 px-3 py-2 text-[12.5px]">
                <span className="w-24 shrink-0 text-[11px] text-zinc-400">{formatDateTime(l.at)}</span>
                <span className="shrink-0 font-medium text-zinc-700">{l.actor}</span>
                <span className="min-w-0 flex-1 text-zinc-600">{l.action}</span>
                <span className="truncate font-mono text-[11px] text-zinc-400">{l.target}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13.5px] outline-none focus:border-zinc-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13.5px] text-zinc-900">{label}</p>
        {desc && <p className="text-[12px] text-zinc-500">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Range({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] text-zinc-900">{label}</span>
        <span className="font-mono text-[13px] font-semibold text-zinc-900">{format(value)}</span>
      </div>
      {hint && <p className="text-[12px] text-zinc-500">{hint}</p>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-zinc-900" />
    </div>
  );
}
