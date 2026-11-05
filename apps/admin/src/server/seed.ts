import type { Answer, Commit, KDocument, Settings } from "@moa/shared/types";

/**
 * 데모용 가상 스타트업 "플로노트(FlowNote)" 시드 데이터.
 * 명세서 9장 B. 가상 스타트업(합성 데이터) 기준. 발표 시 합성 데이터임을 밝힌다.
 */

export const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const SERVICE_NAME = "플로노트";

export function seedSettings(): Settings {
  return {
    ragMode: "moa",
    similarityThreshold: 0.75,
    spikeCount: 10,
    spikeWindowMinutes: 60,
    bestAnswerAutoScore: 5,
    bestAnswerConditionalScore: 4,
    editRatioLimit: 0.3,
    autoCreateIssue: true,
    securityLevel: 2,
    repo: "flownote-demo/flownote",
    branch: "main",
    watchPaths: ["billing/", "sync/", "upload/", "auth/", "api/"],
    excludePatterns: [".env*", "*.pem", "*.key", "secrets/", "config/prod*"],
    avgResponseMinutes: 12,
    service: {
      name: SERVICE_NAME,
      intro: "어디서나 끊김 없이 동기화되는 팀 노트 앱",
      tone: "친절하고 간결하게, 해결 단계는 번호로 안내",
      hours: "평일 10:00 ~ 19:00",
      plans: [
        { name: "Free", price: "0원", features: "노트 100개, 기기 2대" },
        { name: "Pro", price: "월 9,900원 (연간 월 7,900원)", features: "노트·기기 무제한, 버전 기록 30일" },
        { name: "Team", price: "인당 월 14,900원", features: "Pro 기능 + 공유 워크스페이스, 관리자 콘솔" },
      ],
      refundSummary: "결제일로부터 7일 이내, 유료 기능 사용 이력이 없으면 전액 환불",
      features: "실시간 동기화, 오프라인 모드(베타), 공유 링크 권한, Markdown·PDF 내보내기",
    },
  };
}

export function seedDocuments(): KDocument[] {
  const pricingV2 = [
    "# 요금 안내",
    "- Free: 0원 (노트 100개, 기기 2대)",
    "- Pro: 월 9,900원, 연간 결제 시 월 7,900원 (노트·기기 무제한, 버전 기록 30일)",
    "- Team: 인당 월 14,900원 (Pro 기능 + 공유 워크스페이스, 관리자 콘솔)",
    "- 요금제 변경은 설정 > 결제 관리에서 즉시 반영됩니다.",
  ].join("\n");

  const refundV3 = [
    "# 환불 정책 v3",
    "- 결제일로부터 7일 이내이고 유료 기능 사용 이력이 없으면 전액 환불합니다.",
    "- 7일이 지나면 환불되지 않으며, 해지 시 다음 결제일부터 청구되지 않습니다.",
    "- 환불 요청: 설정 > 결제 관리 > 환불 요청. 영업일 기준 3일 이내 처리됩니다.",
  ].join("\n");

  const refundV2 = refundV3.replace("v3", "v2").replaceAll("7일", "14일");

  const faq = [
    "# 자주 묻는 질문",
    "## 저장 시 E-502 오류",
    "서버에 저장하지 못했을 때 표시됩니다. 작성 내용은 기기에 임시 보관되므로 앱을 종료하지 말고 잠시 후 다시 저장해 주세요.",
    "## 첨부 시 E-413 오류",
    "첨부 파일은 파일당 20MB까지 올릴 수 있습니다. 용량을 초과하면 E-413이 표시됩니다.",
    "## E-401 / 로그인이 풀려요",
    "로그인은 30일간 유지됩니다. 기간이 지나거나 다른 기기에서 비밀번호를 바꾸면 E-401과 함께 재로그인이 필요합니다.",
    "## 결제 시 E-PAY-07",
    "카드사 승인이 거절된 경우입니다. 다른 카드로 다시 시도하거나 카드사에 문의해 주세요.",
    "## 비밀번호 변경",
    "설정 > 계정 > 보안 > 비밀번호 변경에서 바꿀 수 있습니다.",
    "## 노트 내보내기",
    "노트 우측 상단 ⋯ > 내보내기에서 Markdown 또는 PDF로 내보낼 수 있습니다. 여러 노트는 폴더 단위로 내보내세요.",
  ].join("\n");

  const shareSpec = [
    "# 기능 명세 — 공유·협업",
    "- 공유 링크 권한: 보기 / 댓글 / 편집 중 선택. 노트 우측 상단 공유 > 링크 권한에서 변경.",
    "- 워크스페이스 초대는 Team 요금제에서만 가능합니다.",
  ].join("\n");

  const release = [
    "# 릴리즈 노트 2026-10",
    "- 오프라인 모드 베타 (설정 > 실험실)",
    "- 저장 요청 배치 처리로 동기화 속도 개선",
  ].join("\n");

  const oldPricing = [
    "# 2025 요금표 (구버전)",
    "- Pro: 월 8,900원",
    "- Team: 인당 월 12,900원",
  ].join("\n");

  return [
    {
      id: "D001",
      title: "요금 안내",
      type: "policy",
      version: 2,
      status: "valid",
      content: pricingV2,
      updatedAt: ago(60 * 24 * 21),
      history: [
        { version: 1, content: pricingV2.replace("월 9,900원", "월 8,900원"), uploadedAt: ago(60 * 24 * 120) },
        { version: 2, content: pricingV2, uploadedAt: ago(60 * 24 * 21) },
      ],
    },
    {
      id: "D002",
      title: "환불 정책",
      type: "policy",
      version: 3,
      status: "valid",
      content: refundV3,
      updatedAt: ago(60 * 24 * 3),
      history: [
        { version: 2, content: refundV2, uploadedAt: ago(60 * 24 * 90) },
        { version: 3, content: refundV3, uploadedAt: ago(60 * 24 * 3) },
      ],
    },
    {
      id: "D003",
      title: "자주 묻는 질문",
      type: "faq",
      version: 1,
      status: "valid",
      content: faq,
      updatedAt: ago(60 * 24 * 40),
      history: [{ version: 1, content: faq, uploadedAt: ago(60 * 24 * 40) }],
    },
    {
      id: "D004",
      title: "기능 명세 — 공유·협업",
      type: "spec",
      version: 2,
      status: "valid",
      content: shareSpec,
      updatedAt: ago(60 * 24 * 15),
      history: [{ version: 2, content: shareSpec, uploadedAt: ago(60 * 24 * 15) }],
    },
    {
      id: "D005",
      title: "릴리즈 노트 2026-10",
      type: "release",
      version: 1,
      status: "valid",
      content: release,
      updatedAt: ago(60 * 24 * 5),
      history: [{ version: 1, content: release, uploadedAt: ago(60 * 24 * 5) }],
    },
    {
      id: "D006",
      title: "2025 요금표",
      type: "policy",
      version: 1,
      status: "deprecated",
      content: oldPricing,
      updatedAt: ago(60 * 24 * 300),
      history: [{ version: 1, content: oldPricing, uploadedAt: ago(60 * 24 * 300) }],
    },
  ];
}

export function seedCommits(): Commit[] {
  return [
    {
      sha: "a1f3c92",
      message: "sync: 저장 요청 배치 처리로 변경",
      author: "minjun",
      files: ["sync/saveHandler.ts", "sync/queue.ts"],
      at: ago(150),
    },
    {
      sha: "7be21d0",
      message: "refund: 환불 가능 기간 14일 → 7일 (정책 v3)",
      author: "seoyeon",
      files: ["billing/refund.ts"],
      at: ago(60 * 24 * 3),
    },
    {
      sha: "3c9d8e1",
      message: "upload: 첨부 용량 제한 상수 분리",
      author: "jiho",
      files: ["upload/attachment.ts"],
      at: ago(60 * 24 * 5),
    },
    {
      sha: "9e0aa47",
      message: "auth: refresh token 만료 처리 개선",
      author: "minjun",
      files: ["auth/session.ts"],
      at: ago(60 * 24 * 6),
    },
  ];
}

/** 코드 인덱스(레벨 2: 감시 경로의 코드 청크) — 담당자 확인용 */
export const CODE_INDEX: Record<string, string> = {
  "billing/pricing.ts": "export const PRO_MONTHLY = {PRO};\nexport const PRO_ANNUAL_MONTHLY = {ANNUAL};",
  "billing/refund.ts": "export const REFUND_WINDOW_DAYS = 7;\nif (daysSince(paidAt) > REFUND_WINDOW_DAYS) throw new RefundError('E-REF-01')",
  "sync/saveHandler.ts":
    "const res = await queue.flushBatch(pending)\nif (!res.ok) return fail('E-502') // 배치 실패 시 전체 롤백",
  "sync/queue.ts": "export async function flushBatch(items) { /* 최대 50건 묶어서 전송 */ }",
  "upload/attachment.ts": "export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024 // 초과 시 E-413",
  "auth/session.ts": "export const SESSION_DAYS = 30\nif (expired(token)) throw new AuthError('E-401')",
  "api/client.ts": "retry({ attempts: 2, on: [502, 503] })",
};

const GREET = `안녕하세요, ${SERVICE_NAME}입니다.`;
const CLOSE = "추가로 궁금하신 점이 있으면 편하게 말씀해 주세요.";

/** 발송된 과거 답변 — 근거 목록(문서 ID·버전, 코드 경로·커밋 SHA) + 별점 */
export function seedAnswers(): Answer[] {
  const list: Answer[] = [];
  const base = (n: number) => `A${String(n).padStart(3, "0")}`;

  list.push({
    id: "A003",
    question: "저장이 안 되고 E-502가 떠요",
    text: `${GREET} 저장 중 오류로 불편을 드려 죄송합니다. 작성하신 내용은 기기에 임시 보관되어 있어요.\n1) 앱을 종료하지 말고\n2) 1~2분 뒤 다시 저장해 주세요.\n계속되면 이 채팅으로 알려주시면 바로 확인하겠습니다. ${CLOSE}`,
    evidence: [{ docId: "D003", docVersion: 1 }],
    rating: 5,
    editRatio: 0.08,
    tier: "best",
    isStale: false,
    lowStreak: 0,
    createdAt: ago(60 * 24 * 30),
    approvedAt: ago(60 * 24 * 29),
  });

  list.push({
    id: "A005",
    question: "노트를 PDF로 내보낼 수 있나요?",
    text: `${GREET} 네, 가능해요.\n1) 노트 우측 상단 ⋯ 메뉴\n2) 내보내기\n3) PDF 선택 순서로 진행해 주세요. ${CLOSE}`,
    evidence: [{ docId: "D003", docVersion: 1 }],
    rating: 5,
    editRatio: 0.05,
    tier: "best",
    isStale: false,
    lowStreak: 0,
    createdAt: ago(60 * 24 * 25),
    approvedAt: ago(60 * 24 * 24),
  });

  // 명세 2장 근거 원칙 예시: 과거 우수 답변 "14일 이내 환불…"
  list.push({
    id: "A012",
    question: "환불 받을 수 있나요?",
    text: `${GREET} 이용에 불편을 드려 죄송합니다. 결제일로부터 14일 이내이고 유료 기능 사용 이력이 없으시면 전액 환불해 드려요.\n1) 설정 > 결제 관리\n2) 환불 요청\n3) 사유 선택 순서로 진행해 주세요.\n처리까지 영업일 기준 3일 걸립니다. ${CLOSE}`,
    evidence: [{ docId: "D002", docVersion: 2 }, { filePath: "billing/refund.ts", commitSha: "5d1e0aa" }],
    rating: 5,
    editRatio: 0.1,
    tier: "best",
    isStale: true,
    staleReason: "근거 문서 '환불 정책'이 v2 → v3로 갱신됨 (형식 참고만 가능)",
    lowStreak: 0,
    createdAt: ago(60 * 24 * 60),
    approvedAt: ago(60 * 24 * 59),
  });

  // 요금 관련 과거 답변 23개 (명세 4-3: "답변 23개 낡았을 수 있음")
  const pricingQs = [
    "Pro 요금이 얼마예요?",
    "연간 결제하면 얼마나 할인돼요?",
    "프로 플랜 가격 알려주세요",
    "학생 할인 있나요? Pro 가격이 궁금해요",
    "Free에서 Pro로 바꾸면 얼마죠?",
    "월 구독료가 얼마인가요",
    "Pro 연간이랑 월간 차이가 뭔가요",
    "요금제 비교해주세요",
    "Pro 결제 금액 확인 부탁드립니다",
    "팀원 2명인데 Pro랑 Team 중 뭐가 싸요?",
    "Pro 가격 오른다는 얘기 있던데 지금 얼마예요?",
    "다음 달 결제 금액이 얼마로 나오나요",
    "연간 결제 시 총액이 얼마예요",
    "Pro 무료 체험 끝나면 얼마 결제되나요",
    "프로 요금 부가세 포함인가요",
    "Pro 월 결제 가격",
    "요금이 얼마인지 알려주세요",
    "기업용 말고 개인 Pro 가격이요",
    "Pro 업그레이드 비용",
    "연간 Pro 월 환산 금액",
    "Pro 요금제 가격 정책",
    "결제하기 전에 가격 확인하고 싶어요",
    "Pro 쓰면 한 달에 얼마 나가요?",
  ];
  pricingQs.forEach((q, i) => {
    const isBest = i === 0;
    list.push({
      id: base(21 + i),
      question: q,
      text:
        i % 3 === 1
          ? `${GREET} 연간 결제 시 Pro는 월 7,900원으로 이용하실 수 있어요(월간 결제는 월 9,900원). 설정 > 결제 관리에서 바로 변경할 수 있습니다. ${CLOSE}`
          : `${GREET} Pro 요금제는 월 9,900원이며, 연간 결제 시 월 7,900원이에요. 노트와 기기를 무제한으로 쓰실 수 있습니다. ${CLOSE}`,
      evidence:
        i % 2 === 0
          ? [{ docId: "D001", docVersion: 2 }, { filePath: "billing/pricing.ts", commitSha: "c07e1b2" }]
          : [{ docId: "D001", docVersion: 2 }],
      rating: isBest ? 5 : [5, 4, 4, 3, 5][i % 5],
      editRatio: 0.1,
      tier: isBest ? "best" : "normal",
      isStale: false,
      lowStreak: 0,
      createdAt: ago(60 * 24 * (40 - i)),
      approvedAt: isBest ? ago(60 * 24 * 39) : undefined,
    });
  });

  list.push({
    id: "A007",
    question: "첨부하면 E-413 떠요",
    text: `${GREET} 첨부 파일은 파일당 20MB까지 올릴 수 있어요. 용량을 줄이거나 나눠서 올려주세요. ${CLOSE}`,
    evidence: [{ docId: "D003", docVersion: 1 }, { filePath: "upload/attachment.ts", commitSha: "3c9d8e1" }],
    rating: 3,
    editRatio: 0.2,
    tier: "normal",
    isStale: false,
    lowStreak: 0,
    createdAt: ago(60 * 24 * 10),
  });

  return list;
}

/** 데모 레포 파일 트리 — 제외 패턴·시크릿 스캔 시연용 파일 포함 (명세 9장 B) */
export const REPO_TREE: string[] = [
  "billing/pricing.ts",
  "billing/plans.ts",
  "billing/refund.ts",
  "billing/legacyGateway.ts",
  "sync/saveHandler.ts",
  "sync/queue.ts",
  "sync/conflictResolver.ts",
  "upload/attachment.ts",
  "auth/session.ts",
  "auth/oauth.ts",
  "api/client.ts",
  "web/pages/index.tsx",
  "web/components/Editor.tsx",
  "scripts/seed.ts",
  ".env.example",
  "config/prod.pricing.ts",
  "secrets/stripe.key",
  "certs/server.pem",
  "README.md",
];

/** 시크릿 스캔에 걸리는 가짜 키 (데모용) */
export const SECRET_LINES: Array<{ path: string; line: number; kind: string }> = [
  { path: "billing/legacyGateway.ts", line: 12, kind: "결제 API 키 (sk_live_…)" },
  { path: "auth/oauth.ts", line: 8, kind: "OAuth client secret" },
  { path: "scripts/seed.ts", line: 3, kind: "DB 비밀번호" },
];
