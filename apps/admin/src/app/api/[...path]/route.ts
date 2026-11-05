/**
 * Mock API (임시). 실제 백엔드 스웨거가 나오면 이 파일과 src/server/ 를 삭제하고
 * src/lib/api.ts 의 엔드포인트만 맞추면 된다.
 */
import { connection } from "next/server";
import * as S from "@/server/store";

type Ctx = { params: Promise<{ path: string[] }> };

const json = (data: unknown, status = 200) => Response.json(data, { status });

function fail(e: unknown) {
  if (e instanceof S.StoreError) return json({ message: e.message, data: e.data }, e.status);
  console.error(e);
  return json({ message: "서버 오류" }, 500);
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const { path } = await ctx.params;
  const [a, b, c] = path;
  const url = new URL(req.url);
  try {
    if (a === "inquiries" && !b) return json(S.listInquiries());
    if (a === "inquiries" && b && !c) {
      const inq = S.getInquiry(b);
      if (url.searchParams.get("view") === "customer") return json(S.customerView(inq));
      return json({
        ...inq,
        group: S.listGroups().find((g) => g.id === inq.groupId) ?? null,
        sentAnswer: S.db().answers.find((x) => x.id === inq.sentAnswerId) ?? null,
      });
    }
    if (a === "groups") return json(S.listGroups());
    if (a === "reviews") return json(S.listReviews());
    if (a === "push-events") return json(S.db().pushEvents);
    if (a === "documents") return json(S.listDocuments());
    if (a === "answers") return json(S.listAnswers());
    if (a === "settings") return json(S.getSettings());
    if (a === "system") return json(S.getSystemState());
    if (a === "alerts") return json(S.listAlerts());
    if (a === "onboarding") return json(S.getOnboarding());
    if (a === "attachments" && b) {
      const f = S.getFile(b);
      if (!f) return json({ message: "없음" }, 404);
      return new Response(new Uint8Array(f.buf), {
        headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"` },
      });
    }
    return json({ message: "Not found" }, 404);
  } catch (e) {
    return fail(e);
  }
}

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "application/pdf"];

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const [a, b, c] = path;
  try {
    if (a === "attachments") {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ message: "파일이 없습니다" }, 400);
      if (!ALLOWED.includes(file.type)) return json({ message: "png·jpg·pdf만 첨부할 수 있어요" }, 400);
      if (file.size > MAX_FILE) return json({ message: "파일당 10MB까지 첨부할 수 있어요" }, 400);
      const buf = Buffer.from(await file.arrayBuffer());
      return json(S.saveFile(file.name, file.type, buf));
    }
    if (a === "inquiries" && !b) {
      const input = await body<Parameters<typeof S.createInquiry>[0]>(req);
      if (!input.text?.trim() && !input.attachments?.length) return json({ message: "내용을 입력하세요" }, 400);
      return json(S.customerView(S.createInquiry({ ...input, text: input.text ?? "" })));
    }
    if (a === "inquiries" && b) {
      const p = await body<Record<string, unknown>>(req);
      switch (c) {
        case "messages": {
          const r = S.addCustomerMessage(b, String(p.text ?? ""), (p.attachments as never) ?? [], p.environment as never);
          return json({ inquiry: S.customerView(r.inquiry), newInquiry: r.newInquiry });
        }
        case "open":
          return json(S.openInquiry(b));
        case "draft":
          return json(S.regenerateDraft(b));
        case "send":
          return json(S.sendAnswer(b, String(p.text ?? "")));
        case "close":
          return json(S.closeInquiry(b));
        case "rating":
          return json(S.customerView(S.rateInquiry(b, Number(p.score), p.comment ? String(p.comment) : undefined)));
      }
    }
    if (a === "groups" && b && c === "issue") return json(S.createIssue(b));
    if (a === "reviews" && b) {
      const p = await body<{ action: "approve" | "dismiss"; text?: string }>(req);
      return json(S.resolveReview(b, p.action, p.text));
    }
    if (a === "reviews-bulk") {
      const p = await body<{ ids: string[] }>(req);
      return json(p.ids.map((id) => S.resolveReview(id, "approve")));
    }
    if (a === "answers" && b) {
      const p = await body<{ action: "approve" | "reject" }>(req);
      return json(S.decideCandidate(b, p.action));
    }
    if (a === "documents" && !b) {
      const p = await body<{ title: string; type: never; content: string }>(req);
      if (!p.title?.trim()) return json({ message: "문서 이름을 입력하세요" }, 400);
      return json(S.uploadDocument(p));
    }
    if (a === "alerts" && b === "read") {
      const p = await body<{ ids?: string[] }>(req);
      S.markAlertsRead(p.ids);
      return json({ ok: true });
    }
    if (a === "onboarding") {
      const p = await body<Record<string, unknown>>(req);
      if (b === "service") return json(S.saveServiceInfo(p as never));
      if (b === "index") return json(S.runInitialIndex());
      if (b === "import") return json(S.importPastAnswers((p.rows as never) ?? []));
      if (b === "test") return json(S.testInquiry(String(p.text ?? "")));
      if (b === "restart") return json(S.restartOnboarding());
    }
    if (a === "demo") {
      if (b === "push") return json(S.simulatePricePush());
      if (b === "spike") {
        const p = await body<{ step: number }>(req);
        return json({ inquiry: S.spikeStep(p.step), total: S.SPIKE_SCRIPT.length });
      }
      if (b === "reset") {
        S.resetDB();
        return json({ ok: true });
      }
    }
    return json({ message: "Not found" }, 404);
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const [a, b, c] = path;
  try {
    const p = await body<Record<string, unknown>>(req);
    if (a === "inquiries" && b && !c) return json(S.updateClassification(b, p as never));
    if (a === "inquiries" && b && c === "draft") return json(S.saveDraft(b, String(p.text ?? "")));
    if (a === "settings") return json(S.updateSettings(p as never));
    if (a === "onboarding") return json(S.patchOnboarding(p as never));
    if (a === "documents" && b) {
      if (p.status) return json(S.setDocumentStatus(b, p.status as never));
      if (typeof p.content === "string") return json(S.updateDocument(b, p.content));
    }
    return json({ message: "Not found" }, 404);
  } catch (e) {
    return fail(e);
  }
}
