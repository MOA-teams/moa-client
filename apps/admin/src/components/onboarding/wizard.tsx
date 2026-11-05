"use client";

import "@/lib/browser-mock"; // 데모 데이터는 브라우저 안에서 처리

import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onboardingApi } from "@moa/shared/api";
import type { OnboardingState, OnboardingStep } from "@moa/shared/types";
import { cn } from "@moa/shared/utils";
import { Button, LoadingBlock, Logo } from "@moa/ui";
import { DocsStep, GithubStep, ImportStep, ServiceStep, TestStep } from "./steps";

export const STEPS: Array<{ no: OnboardingStep; title: string; desc: string; optional?: boolean }> = [
  { no: 1, title: "서비스 기본 정보", desc: "요금제·환불 정책·답변 톤" },
  { no: 2, title: "문서 업로드", desc: "정책·FAQ·기능 명세·릴리즈 노트" },
  { no: 3, title: "GitHub 연결 · 보안 레벨", desc: "레포·경로 선택, 최초 인덱싱" },
  { no: 4, title: "과거 문의 가져오기", desc: "CSV로 우수 답변 후보 등록", optional: true },
  { no: 5, title: "테스트 문의", desc: "분류·초안이 바로 나오는지 확인" },
];

export interface StepProps {
  state: OnboardingState;
  setState: (s: OnboardingState) => void;
  /** 단계 완료 표시 후 다음으로 */
  next: () => void;
  /** 다음 버튼을 단계 안에서 제어 */
  setFooter: (f: { label?: string; disabled?: boolean; onNext?: () => Promise<boolean | void> } | null) => void;
}

export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState<OnboardingStep>(1);
  const [footer, setFooter] = useState<Parameters<StepProps["setFooter"]>[0]>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onboardingApi.get().then((s) => {
      setState(s);
      const firstTodo = STEPS.find((x) => !s.steps[x.no] && !x.optional)?.no;
      if (!s.completed && firstTodo) setStep(firstTodo);
    });
  }, []);

  if (!state) return <LoadingBlock />;

  const meta = STEPS[step - 1];
  const doneCount = STEPS.filter((s) => state.steps[s.no]).length;

  function go(n: number) {
    setFooter(null);
    setStep(Math.min(5, Math.max(1, n)) as OnboardingStep);
    window.scrollTo({ top: 0 });
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      if (footer?.onNext) {
        const ok = await footer.onNext();
        if (ok === false) return;
      }
      if (!state!.steps[step]) setState(await onboardingApi.patch({ step, done: true }));
      if (step === 5) {
        await onboardingApi.patch({ completed: true });
        router.push("/");
        return;
      }
      go(step + 1);
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setState(await onboardingApi.restart());
    go(1);
  }

  const stepProps: StepProps = { state, setState, next, setFooter };

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 lg:flex-row">
      {/* 단계 */}
      <aside className="border-b border-zinc-200/80 bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-6 py-5">
          <Logo />
          <Link href="/" className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 lg:hidden" aria-label="닫기">
            <X className="size-4" />
          </Link>
        </div>
        <div className="px-6 pb-2">
          <p className="text-[13px] font-semibold text-zinc-900">초기 세팅</p>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
            {state.completed ? "세팅이 완료되었어요. 언제든 다시 바꿀 수 있어요." : `${doneCount}/5 단계 완료`}
          </p>
          <div className="mt-3 h-1 rounded-full bg-zinc-100">
            <div className="h-1 rounded-full bg-zinc-900 transition-all duration-500" style={{ width: `${(doneCount / 5) * 100}%` }} />
          </div>
        </div>
        <ol className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-0.5 lg:overflow-visible">
          {STEPS.map((s) => {
            const active = s.no === step;
            const done = state.steps[s.no];
            return (
              <li key={s.no} className="shrink-0">
                <button
                  onClick={() => go(s.no)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition",
                    active ? "bg-zinc-100" : "hover:bg-zinc-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-px grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                      done ? "bg-zinc-900 text-white" : active ? "bg-white text-zinc-900 ring-2 ring-zinc-900" : "bg-white text-zinc-400 ring-1 ring-zinc-300",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : s.no}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className={cn("block text-[13.5px]", active ? "font-semibold text-zinc-900" : "text-zinc-700")}>
                      {s.title}
                      {s.optional && <span className="ml-1 text-[11.5px] font-normal text-zinc-400">선택</span>}
                    </span>
                    <span className="block text-[12px] text-zinc-500">{s.desc}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="hidden space-y-1 border-t border-zinc-100 px-3 py-3 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <button onClick={restart} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
            <RotateCcw className="size-3.5" /> 처음부터 다시 보기
          </button>
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
            <ArrowLeft className="size-3.5" /> 어드민으로 돌아가기
          </Link>
        </div>
      </aside>

      {/* 내용 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 md:px-10 md:py-12">
          <p className="text-[12.5px] font-medium text-zinc-400">
            {step} / 5{meta.optional && " · 선택"}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-zinc-900">{meta.title}</h1>
          <div className="mt-6">
            {step === 1 && <ServiceStep {...stepProps} />}
            {step === 2 && <DocsStep {...stepProps} />}
            {step === 3 && <GithubStep {...stepProps} />}
            {step === 4 && <ImportStep {...stepProps} />}
            {step === 5 && <TestStep {...stepProps} />}
          </div>
        </div>

        <footer className="sticky bottom-0 border-t border-zinc-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 py-3.5 md:px-10">
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 1}>
              <ArrowLeft className="size-4" /> 이전
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {meta.optional && !state.steps[step] && (
                <Button variant="ghost" onClick={() => go(step + 1)}>
                  건너뛰기
                </Button>
              )}
              <Button onClick={next} loading={busy} disabled={footer?.disabled}>
                {footer?.label ?? (step === 5 ? "세팅 완료" : "다음")}
                {step < 5 && <ArrowRight className="size-4" />}
              </Button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
