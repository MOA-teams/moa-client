"use client";

import { AlertCircle, Archive, ArchiveRestore, BookText, CircleCheck, CircleDashed, FileUp, Flag, Loader2, Plus, RefreshCw, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AuthApiError } from "@moa/shared/auth";
import {
  DOC_STATUSES,
  DOC_TYPES,
  documentApi,
  inquiryApi,
  inquiryErrorMessage,
  newIdempotencyKey,
  type DocStatus,
  type DocType,
  type DocumentCreateBody,
  type DocumentSummary,
} from "@moa/shared/inquiry";
import { cn, formatDateTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, Empty, LoadingBlock, Select } from "@moa/ui";

type Err = { msg: string; rid?: string } | null;
const toErr = (e: unknown): Err => ({ msg: inquiryErrorMessage(e), rid: e instanceof AuthApiError ? e.requestId : undefined });

const INDEX_TONE: Record<DocumentSummary["indexing_status"], string> = {
  대기: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
  "처리 중": "bg-sky-50 text-sky-700 ring-sky-600/15",
  완료: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  실패: "bg-red-50 text-red-700 ring-red-600/15",
};

/** 타임존 포함 ISO (created_at 필수 조건) */
function localIsoWithTz(value: string) {
  const d = value ? new Date(value) : new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${p(off / 60)}:${p(off % 60)}`;
}

/** 백엔드 지식 문서 (GET/POST /api/v1/admin/documents, PATCH 상태) */
export function LiveDocuments() {
  const [filter, setFilter] = useState<DocStatus | "">("");
  const [items, setItems] = useState<DocumentSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [form, setForm] = useState<{ docId?: string; version: number; title?: string; type?: DocType } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await documentApi.list(filter || undefined);
      setItems(r.items);
      setCursor(r.next_cursor);
      setErr(null);
    } catch (e) {
      setErr(toErr(e));
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(null);
    load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await documentApi.list(filter || undefined, cursor);
      setItems((prev) => [...(prev ?? []), ...r.items.filter((x) => !prev?.some((p) => p.doc_id === x.doc_id && p.version === x.version))]);
      setCursor(r.next_cursor);
    } catch (e) {
      setErr(toErr(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // 인덱싱 진행 중이면 5초마다 확인
  const busy = items?.some((d) => d.indexing_status === "대기" || d.indexing_status === "처리 중");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="self-start overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <Select<DocStatus | ""> aria-label="상태" value={filter} onChange={setFilter} options={[{ value: "", label: "모든 상태" }, ...DOC_STATUSES.map((s) => ({ value: s, label: s }))]} />
          <span className="text-[12px] text-zinc-400">최신 버전 기준 · 과거 버전으로 자동 복귀하지 않아요</span>
          <button onClick={load} className="ml-auto grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="새로고침">
            <RefreshCw className="size-3.5" />
          </button>
          <Button size="sm" onClick={() => setForm({ version: 1 })}>
            <Plus className="size-3.5" /> 새 문서
          </Button>
        </div>
        {err && (
          <p className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
            <AlertCircle className="size-4" /> {err.msg}
          </p>
        )}
        {items === null ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <Empty icon={<BookText className="size-8" />} title="등록된 문서가 없어요" desc="정책·FAQ·기능 명세·릴리즈 노트를 올리면 AI 초안의 사실 근거가 돼요." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((d) => (
              <DocRow key={`${d.doc_id}-${d.version}`} d={d} onChange={load} onNewVersion={() => setForm({ docId: d.doc_id, version: d.version + 1, title: d.title, type: d.doc_type })} />
            ))}
          </ul>
        )}
        {items && cursor && (
          <div className="border-t border-zinc-100 px-4 py-3 text-center">
            <Button variant="outline" size="sm" onClick={more} loading={loadingMore}>
              더 보기
            </Button>
          </div>
        )}
      </Card>

      {form ? (
        <UploadForm key={`${form.docId ?? "new"}-${form.version}`} init={form} onClose={() => setForm(null)} onDone={() => (setForm(null), load())} />
      ) : (
        <Card className="self-start p-5 text-[13px] leading-relaxed text-zinc-500">
          <p className="font-medium text-zinc-800">문서는 이렇게 쓰여요</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>유효하고 검색 가능한 최신 버전만 AI 초안의 사실 근거가 돼요.</li>
            <li>같은 문서를 고치면 &lsquo;새 버전&rsquo;으로 올려요. 이전 버전은 검색에서 빠져요.</li>
            <li>폐기하면 즉시 검색에서 제외되고, 재활성화하면 재인덱싱 후 다시 검색돼요.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function DocRow({ d, onChange, onNewVersion }: { d: DocumentSummary; onChange: () => void; onNewVersion: () => void }) {
  const [action, setAction] = useState<null | "폐기" | "재검토" | "재활성화">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const active = d.status === "유효";

  async function apply() {
    if (!action || !reason.trim()) return setErr({ msg: "사유를 입력해 주세요." });
    const body =
      action === "폐기"
        ? { status: "폐기" as const, review_required: false, reason: reason.trim() }
        : action === "재검토"
          ? { status: "유효" as const, review_required: true, reason: reason.trim() }
          : { status: "유효" as const, review_required: false, reason: reason.trim() };
    setBusy(true);
    setErr(null);
    try {
      await documentApi.setStatus(d.doc_id, d.version, body);
      setAction(null);
      setReason("");
      onChange();
    } catch (e) {
      setErr(toErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <BookText className={cn("size-4 shrink-0", active ? "text-zinc-400" : "text-zinc-300")} />
        <span className={cn("text-[14px] font-medium", active ? "text-zinc-900" : "text-zinc-400 line-through")}>{d.title}</span>
        <span className="font-mono text-[11.5px] text-zinc-400">
          {d.doc_id} · v{d.version}
        </span>
        <Badge>{d.doc_type}</Badge>
        <Badge className={active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-zinc-100 text-zinc-500 ring-zinc-500/15"}>{d.status}</Badge>
        {d.review_required && (
          <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
            <Flag className="size-3" /> 재검토 필요
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[12px] text-zinc-500">
        <Badge className={INDEX_TONE[d.indexing_status]}>
          {d.indexing_status === "처리 중" ? <Loader2 className="size-3 animate-spin" /> : d.indexing_status === "완료" ? <CircleCheck className="size-3" /> : <CircleDashed className="size-3" />}
          인덱싱 {d.indexing_status}
        </Badge>
        <span className={d.searchable ? "text-emerald-700" : "text-zinc-400"}>{d.searchable ? "검색 가능" : "검색 제외"}</span>
        <span>작성 {formatDateTime(d.created_at)}</span>
        <span>업로드 {formatDateTime(d.uploaded_at)}</span>
      </div>
      {(d.indexing_error || d.sync_error) && <p className="mt-1.5 pl-6 text-[12px] text-red-600">{d.indexing_error ?? d.sync_error}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6">
        {action ? (
          <>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder={`${action} 사유 (필수)`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 text-[12.5px] outline-none focus:border-zinc-400"
            />
            <Button size="sm" onClick={apply} loading={busy}>
              {action}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setAction(null), setErr(null))}>
              취소
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onNewVersion}>
              <Upload className="size-3.5" /> 새 버전 (v{d.version + 1})
            </Button>
            {active ? (
              <>
                {!d.review_required && (
                  <Button size="sm" variant="ghost" onClick={() => setAction("재검토")}>
                    <Flag className="size-3.5" /> 재검토 표시
                  </Button>
                )}
                {d.review_required && (
                  <Button size="sm" variant="ghost" onClick={() => setAction("재활성화")}>
                    <CircleCheck className="size-3.5" /> 재검토 완료
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAction("폐기")}>
                  <Archive className="size-3.5" /> 폐기
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAction("재활성화")}>
                <ArchiveRestore className="size-3.5" /> 재활성화
              </Button>
            )}
          </>
        )}
      </div>
      {err && <p className="mt-1.5 pl-6 text-[12px] text-red-600">{err.msg}</p>}
    </li>
  );
}

function UploadForm({ init, onClose, onDone }: { init: { docId?: string; version: number; title?: string; type?: DocType }; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(init.title ?? "");
  const [type, setType] = useState<DocType>(init.type ?? "FAQ");
  const [createdAt, setCreatedAt] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ key: string; body: DocumentCreateBody } | null>(null);
  const uploaded = useRef<{ file: File; id: string } | null>(null);

  async function pick(f?: File) {
    if (!f) return;
    if (/\.(md|txt)$/i.test(f.name)) {
      setText(await f.text());
      setFile(null);
    } else {
      setFile(f);
      setText("");
    }
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr({ msg: "문서 이름을 입력해 주세요." });
    if (!file && !text.trim()) return setErr({ msg: "파일을 올리거나 내용을 입력해 주세요." });
    setBusy(true);
    setErr(null);
    try {
      let attachment_id: string | null = null;
      if (file) {
        // 같은 파일은 한 번만 업로드 (재시도 시 재사용)
        if (uploaded.current?.file !== file) uploaded.current = { file, id: (await inquiryApi.upload(file, "document")).attachment_id };
        attachment_id = uploaded.current.id;
      }
      const body: DocumentCreateBody = {
        ...(init.docId ? { doc_id: init.docId } : {}),
        version: init.version,
        doc_type: type,
        title: title.trim(),
        status: "유효",
        created_at: localIsoWithTz(createdAt),
        ...(attachment_id ? { attachment_id } : { text }),
      };
      const prev = pending.current;
      const key = prev && JSON.stringify(prev.body) === JSON.stringify(body) ? prev.key : newIdempotencyKey();
      pending.current = { key, body };
      const r = await documentApi.create(body, key);
      pending.current = null;
      setDone(`${r.doc_id} v${r.version} 접수 · 인덱싱 ${r.indexing_status}`);
      setTimeout(onDone, 900);
    } catch (e2) {
      setErr(toErr(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="self-start">
      <CardHeader
        title={init.docId ? `새 버전 올리기 · ${init.docId} v${init.version}` : "새 문서 등록"}
        desc="PDF·PNG·JPG는 파일로, MD·TXT는 내용으로 올라가요"
        icon={<FileUp className="size-4" />}
        action={
          <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100" aria-label="닫기">
            <X className="size-4" />
          </button>
        }
      />
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.md,.txt" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-[13px] text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50"
        >
          <Upload className="size-5 text-zinc-400" />
          {file ? file.name : "파일 선택 (.pdf .png .jpg .md)"}
        </button>
        <label className="block">
          <span className="text-[12px] text-zinc-500">문서 이름</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-[13.5px] outline-none focus:border-zinc-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[12px] text-zinc-500">종류</span>
            <Select aria-label="종류" className="mt-1 h-9 w-full" value={type} onChange={setType} options={DOC_TYPES.map((t) => ({ value: t, label: t }))} />
          </label>
          <label className="block">
            <span className="text-[12px] text-zinc-500">원본 작성일 (비우면 지금)</span>
            <input type="datetime-local" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-[12.5px] outline-none focus:border-zinc-400" />
          </label>
        </div>
        {!file && (
          <label className="block">
            <span className="text-[12px] text-zinc-500">내용 (직접 입력)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={200000} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400" />
          </label>
        )}
        {err && (
          <p className="text-[12.5px] text-red-600">
            {err.msg}
            {err.rid && <span className="ml-1 font-mono text-[10.5px] text-red-300">{err.rid}</span>}
          </p>
        )}
        {done && <p className="text-[12.5px] text-emerald-700">{done}</p>}
        <Button className="w-full" loading={busy} disabled={!!done}>
          {init.docId ? `v${init.version} 업로드` : "등록"}
        </Button>
      </form>
    </Card>
  );
}
