"use client";

import { Archive, ArchiveRestore, BookText, ChevronDown, FileUp, History, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError, adminApi } from "@moa/shared/api";
import { usePolling } from "@moa/shared/hooks";
import { LiveDocuments } from "./live-documents";
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, DOC_TYPE_LABEL } from "@moa/shared/labels";
import type { DocType, KDocument } from "@moa/shared/types";
import { cn, formatDateTime } from "@moa/shared/utils";
import { Badge, Button, Card, CardHeader, LoadingBlock, PageHeader, Select } from "@moa/ui";

const TYPES = Object.keys(DOC_TYPE_LABEL) as DocType[];

export function DocumentsView() {
  const [tab, setTab] = useState<"live" | "demo">("live");
  return (
    <>
      <PageHeader title="문서" desc="정책·FAQ·기능 명세·릴리즈 노트. 새 버전이 올라오면 이전 버전은 검색에서 빠지고, 그 문서를 근거로 쓴 답변은 재검토로 내려가요." />
      <div className="mb-5 flex w-fit gap-1 rounded-lg bg-zinc-200/50 p-1 text-[13px]">
        {(
          [
            ["live", "실제 문서"],
            ["demo", "데모 시나리오"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("rounded-md px-3.5 py-1.5 transition", tab === k ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "live" ? <LiveDocuments /> : <MockDocuments />}
    </>
  );
}

/** 데모 시나리오(mock) — 요금 변경 push 재검토 장면용 */
function MockDocuments() {
  const { data, refresh } = usePolling(() => adminApi.documents(), 4000);
  const [open, setOpen] = useState<string | null>(null);

  if (!data) return <LoadingBlock />;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="self-start overflow-hidden">
          <div className="hidden grid-cols-[1fr_96px_64px_110px_130px] gap-3 border-b border-zinc-100 bg-zinc-50/60 px-5 py-2.5 text-[11.5px] font-medium text-zinc-500 md:grid">
            <span>문서</span>
            <span>종류</span>
            <span>버전</span>
            <span>상태</span>
            <span className="text-right">작성일</span>
          </div>
          <ul className="divide-y divide-zinc-100">
            {data.map((d) => (
              <DocRow key={d.id} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} onChange={refresh} />
            ))}
          </ul>
        </Card>
        <UploadCard onDone={refresh} titles={data.map((d) => d.title)} />
      </div>
    </>
  );
}

function DocRow({ d, open, onToggle, onChange }: { d: KDocument; open: boolean; onToggle: () => void; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const inactive = d.status === "deprecated" || d.status === "expired";
  async function setStatus() {
    setBusy(true);
    try {
      await adminApi.setDocumentStatus(d.id, inactive ? "valid" : "deprecated");
      onChange();
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      <button onClick={onToggle} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-50 md:grid-cols-[1fr_96px_64px_110px_130px]">
        <span className="flex min-w-0 items-center gap-2.5">
          <BookText className={cn("size-4 shrink-0", inactive ? "text-zinc-300" : "text-zinc-400")} />
          <span className={cn("truncate text-[14px] font-medium", inactive ? "text-zinc-400 line-through" : "text-zinc-900")}>{d.title}</span>
          <span className="font-mono text-[11px] text-zinc-400">{d.id}</span>
          <ChevronDown className={cn("size-3.5 shrink-0 text-zinc-400 transition", open && "rotate-180")} />
        </span>
        <span className="hidden text-[13px] text-zinc-600 md:block">{DOC_TYPE_LABEL[d.type]}</span>
        <span className="hidden font-mono text-[13px] text-zinc-600 md:block">v{d.version}</span>
        <span>
          <Badge className={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
        </span>
        <span className="hidden text-right text-[12px] text-zinc-400 md:block">{formatDateTime(d.updatedAt)}</span>
      </button>
      {open && (
        <div className="animate-fade-up border-t border-zinc-100 bg-zinc-50/50 px-5 py-4">
          <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white px-4 py-3 font-sans text-[13px] leading-relaxed text-zinc-700">{d.content}</pre>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="mr-auto flex items-center gap-1.5 text-[12px] text-zinc-500">
              <History className="size-3.5" />
              {d.history.map((h) => `v${h.version} (${formatDateTime(h.uploadedAt)})`).join(" → ")}
            </p>
            {(d.status === "valid" || inactive) && (
              <Button size="sm" variant="outline" onClick={setStatus} loading={busy}>
                {inactive ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                {inactive ? "유효로 복원" : "폐기 (검색 즉시 제외)"}
              </Button>
            )}
          </div>
          {d.status === "review" && <p className="mt-2 text-[12px] text-amber-700">코드 변경과 충돌해 재검토 중이에요. 변경 감지·재검토 화면에서 새 버전을 반영하세요.</p>}
        </div>
      )}
    </li>
  );
}

function UploadCard({ onDone, titles }: { onDone: () => void; titles: string[] }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocType>("faq");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.(md|txt|pdf)$/i, ""));
    if (f.type === "application/pdf") setContent(`(PDF 본문 추출 예정: ${f.name})`);
    else setContent(await f.text());
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const doc = await adminApi.uploadDocument({ title, type, content });
      setMsg({ ok: true, text: doc.version > 1 ? `'${doc.title}' v${doc.version}로 갱신했어요` : `'${doc.title}'을 등록했어요` });
      setTitle("");
      setContent("");
      setFileName(null);
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "업로드 실패" });
    } finally {
      setBusy(false);
    }
  }

  const isUpdate = titles.includes(title.trim());

  return (
    <Card className="self-start">
      <CardHeader title="문서 업로드" desc="PDF·MD 업로드 후 종류만 선택. 작성일은 업로드 시각" icon={<FileUp className="size-4" />} />
      <div className="space-y-3 px-5 py-4">
        <input ref={fileRef} type="file" accept=".md,.txt,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-[13px] text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50"
        >
          <Upload className="size-5 text-zinc-400" />
          {fileName ?? "파일 선택 (.md, .pdf)"}
        </button>
        <label className="block">
          <span className="text-[12px] text-zinc-500">문서 이름</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 요금 안내"
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-[13.5px] outline-none focus:border-zinc-400"
          />
          {isUpdate && <span className="mt-1 block text-[11.5px] text-indigo-600">같은 이름의 문서가 있어요 → 새 버전으로 올라가요</span>}
        </label>
        <label className="block">
          <span className="text-[12px] text-zinc-500">종류</span>
          <Select aria-label="종류" className="mt-1 h-9 w-full" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} />
        </label>
        <label className="block">
          <span className="text-[12px] text-zinc-500">내용</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
          />
        </label>
        {msg && <p className={cn("text-[12.5px]", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>}
        <Button className="w-full" onClick={submit} loading={busy} disabled={!title.trim() || !content.trim()}>
          {isUpdate ? "새 버전 업로드" : "업로드"}
        </Button>
      </div>
    </Card>
  );
}
