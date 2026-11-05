"use client";

import { Bot, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError } from "@moa/shared/auth";
import { useAuth } from "@moa/shared/auth-context";
import { inquiryErrorMessage } from "@moa/shared/inquiry";
import { responseSettingsApi, type ResponseSettings } from "@moa/shared/response-settings";
import { cn, formatDateTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, Notice, Toggle } from "@moa/ui";

type Err = { msg: string; rid?: string } | null;
const toErr = (e: unknown): Err => ({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });

const SOURCE_LABEL: Record<ResponseSettings["source"], string> = {
  database: "관리자 저장값",
  environment: "서버 기본 설정",
  default: "기본값",
};

type Form = Pick<ResponseSettings, "questions_enabled" | "answers_enabled" | "max_questions">;
const pick = (s: ResponseSettings): Form => ({ questions_enabled: s.questions_enabled, answers_enabled: s.answers_enabled, max_questions: s.max_questions });

/** 기업별 AI 자동 질문·답변 정책 (GET/PATCH /api/v1/admin/settings/auto-response) */
export function AutoResponseCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [st, setSt] = useState<ResponseSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await responseSettingsApi.get();
      setSt(s);
      setForm(pick(s));
      setErr(null);
    } catch (e) {
      setErr(toErr(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const dirty = !!st && !!form && JSON.stringify(form) !== JSON.stringify(pick(st));

  async function save() {
    if (!st || !form) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const s = await responseSettingsApi.update({ expected_revision: st.revision, ...form });
      setSt(s);
      setForm(pick(s));
      setSaved(true);
    } catch (e) {
      setErr(toErr(e));
      // 다른 관리자가 먼저 바꿨으면(409) 최신 값을 다시 보여준다
      if (e instanceof AuthApiError && e.status === 409) load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="AI 자동 응대"
        desc="켜면 검수·근거·최신성 검사를 모두 통과한 경우에만 담당자 승인 없이 고객에게 바로 보내요. 하나라도 실패하면 담당자 검토로 남아요."
        icon={<Bot className="size-4" />}
        action={st && <Badge className="bg-zinc-100 text-zinc-600">{SOURCE_LABEL[st.source]}</Badge>}
      />
      <div className="space-y-4 px-5 py-4">
        {!st && !err && <LoadingBlock />}
        {err && (
          <Notice tone="danger" title="자동 응대 설정 오류">
            {err.msg}
            {err.rid && <span className="ml-1 font-mono text-[10.5px] opacity-60">{err.rid}</span>}
          </Notice>
        )}
        {st && form && (
          <>
            <Row
              title="추가 질문 자동 발송"
              desc="문의 내용이 부족할 때 AI가 만든 정보 요청 질문을 바로 보내요."
              checked={form.questions_enabled}
              disabled={!isAdmin}
              onChange={(v) => setForm({ ...form, questions_enabled: v })}
            />
            <div className={cn("flex items-center justify-between gap-4 pl-1", !form.questions_enabled && "opacity-50")}>
              <div>
                <p className="text-[13px] font-medium text-zinc-800">상담당 자동 질문 최대 횟수</p>
                <p className="text-[12px] text-zinc-500">이 횟수를 넘으면 담당자 검토로 넘겨요.</p>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!isAdmin || !form.questions_enabled}
                    onClick={() => setForm({ ...form, max_questions: n })}
                    aria-pressed={form.max_questions === n}
                    className={cn(
                      "size-8 rounded-lg border text-[13px] transition disabled:cursor-not-allowed",
                      form.max_questions === n ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <Row
              title="최종 답변 자동 발송"
              desc="AI 초안이 모든 검사를 통과하면 담당자 승인 없이 최종 답변으로 보내요."
              checked={form.answers_enabled}
              disabled={!isAdmin}
              onChange={(v) => setForm({ ...form, answers_enabled: v })}
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
              <p className="mr-auto text-[12px] text-zinc-400">
                {isAdmin ? "관리자만 변경할 수 있어요" : "담당자는 조회만 가능해요 (관리자만 변경)"}
                {st.updated_at && ` · 마지막 변경 ${formatDateTime(st.updated_at)}`}
              </p>
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-[12.5px] text-emerald-700">
                  <Check className="size-3.5" /> 저장됨
                </span>
              )}
              {isAdmin && (
                <Button onClick={save} loading={busy} disabled={!dirty}>
                  자동 응대 저장
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ title, desc, checked, disabled, onChange }: { title: string; desc: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "pointer-events-none")}>
      <div>
        <p className="text-[13.5px] font-medium text-zinc-900">{title}</p>
        <p className="text-[12px] text-zinc-500">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
