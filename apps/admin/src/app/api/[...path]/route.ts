/**
 * 데모(mock) API — 어드민 화면은 브라우저 안에서 같은 로직을 실행하므로(src/lib/browser-mock.ts)
 * 이 Route Handler는 외부 호출·첨부 파일용으로만 남긴다. 실제 기능은 백엔드(/backend/*)를 쓴다.
 */
import { connection } from "next/server";
import { dispatch } from "@/server/dispatch";
import * as S from "@/server/store";

type Ctx = { params: Promise<{ path: string[] }> };

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "application/pdf"];

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const respond = ({ status, data }: { status: number; data: unknown }) => Response.json(data, { status });

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const { path } = await ctx.params;
  if (path[0] === "attachments" && path[1]) {
    const f = S.getFile(path[1]);
    if (!f) return Response.json({ message: "없음" }, { status: 404 });
    return new Response(new Uint8Array(f.buf), {
      headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"` },
    });
  }
  return respond(dispatch("GET", path, new URL(req.url).searchParams));
}

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path[0] === "attachments") {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ message: "파일이 없습니다" }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return Response.json({ message: "png·jpg·pdf만 첨부할 수 있어요" }, { status: 400 });
    if (file.size > MAX_FILE) return Response.json({ message: "파일당 10MB까지 첨부할 수 있어요" }, { status: 400 });
    return Response.json(S.saveFile(file.name, file.type, Buffer.from(await file.arrayBuffer())));
  }
  return respond(dispatch("POST", path, new URL(req.url).searchParams, await readJson(req)));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return respond(dispatch("PATCH", path, new URL(req.url).searchParams, await readJson(req)));
}
