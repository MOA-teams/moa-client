/**
 * 데모(mock) API 라우팅 — 서버 Route Handler와 브라우저 내 실행이 함께 쓴다.
 * Vercel 서버리스는 인스턴스마다 메모리가 달라 데모 상태가 사라지거나 섞이므로,
 * 어드민 화면에서는 브라우저 안에서 이 함수를 직접 호출한다 (src/lib/browser-mock.ts).
 */
import * as S from "./store";

export interface MockResult {
  status: number;
  data: unknown;
}

const ok = (data: unknown): MockResult => ({ status: 200, data });
const notFound = (): MockResult => ({ status: 404, data: { message: "Not found" } });

export function dispatch(method: string, path: string[], query: URLSearchParams, body: Record<string, unknown> = {}): MockResult {
  const [a, b, c] = path;
  const p = body;
  try {
    if (method === "GET") {
      if (a === "inquiries" && !b) return ok(S.listInquiries());
      if (a === "inquiries" && b && !c) {
        const inq = S.getInquiry(b);
        if (query.get("view") === "customer") return ok(S.customerView(inq));
        return ok({
          ...inq,
          group: S.listGroups().find((g) => g.id === inq.groupId) ?? null,
          sentAnswer: S.db().answers.find((x) => x.id === inq.sentAnswerId) ?? null,
        });
      }
      if (a === "groups") return ok(S.listGroups());
      if (a === "reviews") return ok(S.listReviews());
      if (a === "push-events") return ok(S.db().pushEvents);
      if (a === "documents") return ok(S.listDocuments());
      if (a === "answers") return ok(S.listAnswers());
      if (a === "settings") return ok(S.getSettings());
      if (a === "system") return ok(S.getSystemState());
      if (a === "alerts") return ok(S.listAlerts());
      if (a === "onboarding") return ok(S.getOnboarding());
      return notFound();
    }

    if (method === "POST") {
      if (a === "inquiries" && !b) {
        const input = p as unknown as Parameters<typeof S.createInquiry>[0];
        if (!input.text?.trim() && !input.attachments?.length) return { status: 400, data: { message: "내용을 입력하세요" } };
        return ok(S.customerView(S.createInquiry({ ...input, text: input.text ?? "", attachments: input.attachments ?? [] })));
      }
      if (a === "inquiries" && b) {
        switch (c) {
          case "messages": {
            const r = S.addCustomerMessage(b, String(p.text ?? ""), (p.attachments as never) ?? [], p.environment as never);
            return ok({ inquiry: S.customerView(r.inquiry), newInquiry: r.newInquiry });
          }
          case "open":
            return ok(S.openInquiry(b));
          case "draft":
            return ok(S.regenerateDraft(b));
          case "send":
            return ok(S.sendAnswer(b, String(p.text ?? "")));
          case "close":
            return ok(S.closeInquiry(b));
          case "rating":
            return ok(S.customerView(S.rateInquiry(b, Number(p.score), p.comment ? String(p.comment) : undefined)));
        }
      }
      if (a === "groups" && b && c === "issue") return ok(S.createIssue(b));
      if (a === "reviews" && b) return ok(S.resolveReview(b, p.action as "approve" | "dismiss", p.text as string | undefined));
      if (a === "reviews-bulk") return ok(((p.ids as string[]) ?? []).map((id) => S.resolveReview(id, "approve")));
      if (a === "answers" && b) return ok(S.decideCandidate(b, p.action as "approve" | "reject"));
      if (a === "documents" && !b) {
        if (!String(p.title ?? "").trim()) return { status: 400, data: { message: "문서 이름을 입력하세요" } };
        return ok(S.uploadDocument(p as never));
      }
      if (a === "alerts" && b === "read") {
        S.markAlertsRead(p.ids as string[] | undefined);
        return ok({ ok: true });
      }
      if (a === "onboarding") {
        if (b === "service") return ok(S.saveServiceInfo(p as never));
        if (b === "index") return ok(S.runInitialIndex());
        if (b === "import") return ok(S.importPastAnswers((p.rows as never) ?? []));
        if (b === "test") return ok(S.testInquiry(String(p.text ?? "")));
        if (b === "restart") return ok(S.restartOnboarding());
      }
      if (a === "demo") {
        if (b === "push") return ok(S.simulatePricePush());
        if (b === "spike") return ok({ inquiry: S.spikeStep(Number(p.step)), total: S.SPIKE_SCRIPT.length });
        if (b === "reset") {
          S.resetDB();
          return ok({ ok: true });
        }
      }
      return notFound();
    }

    if (method === "PATCH") {
      if (a === "inquiries" && b && !c) return ok(S.updateClassification(b, p as never));
      if (a === "inquiries" && b && c === "draft") return ok(S.saveDraft(b, String(p.text ?? "")));
      if (a === "settings") return ok(S.updateSettings(p as never));
      if (a === "onboarding") return ok(S.patchOnboarding(p as never));
      if (a === "documents" && b) {
        if (p.status) return ok(S.setDocumentStatus(b, p.status as never));
        if (typeof p.content === "string") return ok(S.updateDocument(b, p.content));
      }
      return notFound();
    }
    return notFound();
  } catch (e) {
    if (e instanceof S.StoreError) return { status: e.status, data: { message: e.message, data: e.data } };
    console.error(e);
    return { status: 500, data: { message: "데모 데이터 처리 중 오류가 났어요" } };
  }
}
