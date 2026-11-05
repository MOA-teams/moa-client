/**
 * API 클라이언트 — 화면은 이 모듈만 통해 서버와 통신한다.
 * 실제 백엔드 연동 시 NEXT_PUBLIC_API_BASE_URL 지정 + 스웨거 스펙에 맞춰 경로/타입만 수정.
 */
import type {
  Alert,
  Answer,
  Attachment,
  Category,
  CodeCandidate,
  Commit,
  AuditLog,
  DocStatus,
  DocType,
  Environment,
  GithubIssue,
  Group,
  Inquiry,
  InquiryStatus,
  KDocument,
  Message,
  IndexSummary,
  OnboardingState,
  ServiceInfo,
  TestResult,
  PushEvent,
  Rating,
  ReviewItem,
  Settings,
  Urgency,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    cache: "no-store",
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { message?: string }).message ?? "요청 실패", res.status, (data as { data?: unknown }).data);
  return data as T;
}

/* ---------------------------------- 고객 ---------------------------------- */

export interface CustomerInquiry {
  id: string;
  status: InquiryStatus;
  messages: Message[];
  rating?: Rating;
  environment: Environment;
  createdAt: string;
}

export const customerApi = {
  start: (input: {
    customerName?: string;
    customerCategory: Category | null;
    text: string;
    environment: Environment;
    attachments: Attachment[];
  }) => request<CustomerInquiry>("/inquiries", { method: "POST", json: input }),
  get: (id: string) => request<CustomerInquiry>(`/inquiries/${id}?view=customer`),
  send: (id: string, input: { text: string; attachments: Attachment[]; environment?: Environment }) =>
    request<{ inquiry: CustomerInquiry; newInquiry: boolean }>(`/inquiries/${id}/messages`, { method: "POST", json: input }),
  rate: (id: string, score: number, comment?: string) =>
    request<CustomerInquiry>(`/inquiries/${id}/rating`, { method: "POST", json: { score, comment } }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<Attachment>("/attachments", { method: "POST", body: fd });
  },
};

/* --------------------------------- 어드민 --------------------------------- */

export interface GroupInquiryBrief {
  id: string;
  text: string;
  createdAt: string;
  status: InquiryStatus;
  errorCode?: string;
  os?: string;
}

export interface GroupView extends Group {
  inquiries: GroupInquiryBrief[];
  issue?: GithubIssue;
}

export interface InquiryDetail extends Inquiry {
  group: GroupView | null;
  /** 발송된 답변 (A-06 수정 전후 비교용) */
  sentAnswer: Answer | null;
}

export interface ReviewView extends ReviewItem {
  current: string;
  suggestion: string;
  tier?: Answer["tier"];
  rating?: number | null;
}

export interface SystemState {
  codeValues: { proMonthly: number; proAnnual: number; sha: string };
  codeIndexed: boolean;
  pushed: boolean;
  commits: Commit[];
  audit: AuditLog[];
}

export type { CodeCandidate };

export const adminApi = {
  inquiries: () => request<Inquiry[]>("/inquiries"),
  inquiry: (id: string) => request<InquiryDetail>(`/inquiries/${id}`),
  open: (id: string) => request<Inquiry>(`/inquiries/${id}/open`, { method: "POST" }),
  classify: (id: string, patch: { category?: Category; urgency?: Urgency }) =>
    request<Inquiry>(`/inquiries/${id}`, { method: "PATCH", json: patch }),
  regenerate: (id: string) => request<Inquiry>(`/inquiries/${id}/draft`, { method: "POST" }),
  saveDraft: (id: string, text: string) => request<Inquiry>(`/inquiries/${id}/draft`, { method: "PATCH", json: { text } }),
  send: (id: string, text: string) => request<Inquiry>(`/inquiries/${id}/send`, { method: "POST", json: { text } }),
  close: (id: string) => request<Inquiry>(`/inquiries/${id}/close`, { method: "POST" }),

  groups: () => request<GroupView[]>("/groups"),
  createIssue: (groupId: string) => request<GithubIssue>(`/groups/${groupId}/issue`, { method: "POST" }),

  pushEvents: () => request<PushEvent[]>("/push-events"),
  reviews: () => request<ReviewView[]>("/reviews"),
  resolveReview: (id: string, action: "approve" | "dismiss", text?: string) =>
    request<ReviewItem>(`/reviews/${id}`, { method: "POST", json: { action, text } }),
  bulkApprove: (ids: string[]) => request<ReviewItem[]>("/reviews-bulk", { method: "POST", json: { ids } }),

  answers: () => request<Answer[]>("/answers"),
  decideCandidate: (id: string, action: "approve" | "reject") =>
    request<Answer>(`/answers/${id}`, { method: "POST", json: { action } }),

  documents: () => request<KDocument[]>("/documents"),
  uploadDocument: (input: { title: string; type: DocType; content: string }) =>
    request<KDocument>("/documents", { method: "POST", json: input }),
  setDocumentStatus: (id: string, status: DocStatus) =>
    request<KDocument>(`/documents/${id}`, { method: "PATCH", json: { status } }),
  updateDocument: (id: string, content: string) =>
    request<KDocument>(`/documents/${id}`, { method: "PATCH", json: { content } }),

  settings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) => request<Settings>("/settings", { method: "PATCH", json: patch }),
  system: () => request<SystemState>("/system"),

  alerts: () => request<Alert[]>("/alerts"),
  readAlerts: (ids?: string[]) => request<{ ok: true }>("/alerts/read", { method: "POST", json: { ids } }),
};

/* -------------------------------- 온보딩 -------------------------------- */

export const onboardingApi = {
  get: () => request<OnboardingState>("/onboarding"),
  patch: (patch: { completed?: boolean; githubInstalled?: boolean; step?: number; done?: boolean }) =>
    request<OnboardingState>("/onboarding", { method: "PATCH", json: patch }),
  restart: () => request<OnboardingState>("/onboarding/restart", { method: "POST" }),
  saveService: (info: ServiceInfo) => request<Settings>("/onboarding/service", { method: "POST", json: info }),
  index: () => request<IndexSummary>("/onboarding/index", { method: "POST" }),
  importAnswers: (rows: Array<{ question: string; answer: string }>) =>
    request<{ imported: number }>("/onboarding/import", { method: "POST", json: { rows } }),
  test: (text: string) => request<TestResult>("/onboarding/test", { method: "POST", json: { text } }),
};

/** 데모 전용 (발표 시나리오 트리거) */
export const demoApi = {
  push: () => request<PushEvent>("/demo/push", { method: "POST" }),
  spike: (step: number) => request<{ inquiry: Inquiry; total: number }>("/demo/spike", { method: "POST", json: { step } }),
  reset: () => request<{ ok: true }>("/demo/reset", { method: "POST" }),
};
