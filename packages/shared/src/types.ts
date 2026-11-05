// 모아(MOA) 도메인 타입 — 명세서 v5 기준

export type Category = "usage" | "account" | "billing" | "bug" | "feature" | "other";
export type Urgency = "critical" | "high" | "normal" | "low";
export type InquiryStatus = "received" | "in_review" | "need_info" | "answered" | "closed";
export type RagMode = "moa" | "naive";

export interface Environment {
  os?: string;
  browser?: string;
  appVersion?: string;
  errorCode?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  /** C-09: 스크린샷에서 추출한 오류 코드 */
  extractedErrorCode?: string;
}

export type MessageRole = "customer" | "ai" | "agent" | "system";
export type MessageKind = "text" | "receipt" | "info_request" | "answer" | "rating_request" | "closed_notice";

export interface Message {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface ClassificationChange {
  at: string;
  field: "category" | "urgency";
  from: string;
  to: string;
  by: string;
}

export type SourceType = "document" | "best_answer" | "code" | "commit";

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  excerpt: string;
  similarity: number;
  /** 문서 */
  docId?: string;
  docVersion?: number;
  docStatus?: DocStatus;
  /** 우수 답변: 형식 참고용 */
  role?: "fact" | "format" | "internal";
  /** 코드 */
  filePath?: string;
  commitSha?: string;
  url?: string;
  stale?: boolean;
}

export interface Draft {
  text: string;
  originalText: string;
  sources: Source[];
  /** A-05: 근거 부족·충돌 */
  needsManualCheck: boolean;
  manualCheckReasons: string[];
  conflicts: string[];
  mode: RagMode;
  generatedAt: string;
}

export interface Rating {
  score: number | null; // null = 미평가
  comment?: string;
  requestedAt: string;
  reRequestedAt?: string;
  ratedAt?: string;
}

export interface Inquiry {
  id: string; // Q001
  customerName: string;
  customerCategory: Category | null; // 고객이 고른 힌트
  aiCategory: Category;
  category: Category; // 현재 확정 분류
  urgency: Urgency;
  status: InquiryStatus;
  summary: string;
  environment: Environment;
  messages: Message[];
  groupId?: string;
  draft?: Draft;
  sentAnswerId?: string;
  rating?: Rating;
  classificationHistory: ClassificationChange[];
  createdAt: string;
  updatedAt: string;
}

export type DocType = "policy" | "faq" | "spec" | "release";
export type DocStatus = "valid" | "deprecated" | "expired" | "review";

export interface DocVersion {
  version: number;
  content: string;
  uploadedAt: string;
}

export interface KDocument {
  id: string;
  title: string;
  type: DocType;
  version: number;
  status: DocStatus;
  content: string;
  updatedAt: string;
  history: DocVersion[];
}

export interface Evidence {
  docId?: string;
  docVersion?: number;
  filePath?: string;
  commitSha?: string;
}

export type AnswerTier = "best" | "candidate" | "normal" | "quality_check";

/** 발송된 답변 — 근거 목록·별점과 연결 (5장 답변·근거·평가 연결 구조) */
export interface Answer {
  id: string; // A012
  inquiryId?: string;
  question: string;
  text: string;
  /** A-06: 발송 시점의 AI 초안 원문 (수정 전) */
  draftText?: string;
  evidence: Evidence[];
  rating: number | null;
  editRatio: number; // 초안 대비 수정량 0~1
  tier: AnswerTier;
  isStale: boolean;
  staleReason?: string;
  lowStreak: number;
  /** 온보딩 CSV import — 별점 없음, 담당자 승인 필수 */
  imported?: boolean;
  createdAt: string;
  approvedAt?: string;
}

export interface Group {
  id: string;
  title: string;
  errorCode?: string;
  category: Category;
  inquiryIds: string[];
  firstAt: string;
  lastAt: string;
  spike: boolean;
  issueId?: string;
}

export interface CodeCandidate {
  filePath: string;
  score: number;
  reason: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  files: string[];
  at: string;
}

export interface GithubIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  groupId: string;
  body: string;
  candidates: CodeCandidate[];
  commits: Commit[];
  createdAt: string;
  auto: boolean;
}

export interface DiffChange {
  filePath: string;
  summary: string;
  excluded?: boolean;
  excludeReason?: string;
}

export interface PushEvent {
  id: string;
  branch: string;
  commit: Commit;
  summary: string;
  changes: DiffChange[];
  affectedAnswerIds: string[];
  affectedDocIds: string[];
  createdAt: string;
}

export type ReviewTargetType = "answer" | "document";
export type ReviewStatus = "pending" | "resolved" | "dismissed";

export interface ReviewItem {
  id: string;
  targetType: ReviewTargetType;
  targetId: string;
  title: string;
  reason: string;
  source: "push" | "doc_version" | "rating";
  pushEventId?: string;
  status: ReviewStatus;
  createdAt: string;
  resolvedAt?: string;
}

export type AlertType = "spike" | "issue" | "push" | "review";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export type SecurityLevel = 0 | 1 | 2 | 3;

export interface Settings {
  ragMode: RagMode;
  similarityThreshold: number;
  spikeCount: number;
  spikeWindowMinutes: number;
  bestAnswerAutoScore: number; // 기본 5
  bestAnswerConditionalScore: number; // 기본 4
  editRatioLimit: number; // 기본 0.3
  autoCreateIssue: boolean;
  securityLevel: SecurityLevel;
  repo: string;
  branch: string;
  watchPaths: string[];
  excludePatterns: string[];
  avgResponseMinutes: number;
  service: ServiceInfo;
}

export interface PricePlan {
  name: string;
  price: string;
  features: string;
}

/** 온보딩 1단계 — 문서가 하나도 없어도 이 정보만으로 기본 초안이 가능해야 한다 */
export interface ServiceInfo {
  name: string;
  intro: string;
  tone: string;
  hours: string;
  plans: PricePlan[];
  refundSummary: string;
  features: string;
}

export interface IndexSummary {
  level: SecurityLevel;
  repo: string;
  branch: string;
  indexedFiles: string[];
  chunks: number;
  excluded: Array<{ path: string; reason: string }>;
  masked: Array<{ path: string; line: number; kind: string }>;
  outsideWatch: number;
  at: string;
}

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export interface OnboardingState {
  completed: boolean;
  steps: Record<OnboardingStep, boolean>;
  githubInstalled: boolean;
  index: IndexSummary | null;
  importedCount: number;
  repoTree: string[];
}

export interface TestResult {
  category: Category;
  urgency: Urgency;
  topic: string;
  autoInfoRequest: boolean;
  draft: Draft;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}
