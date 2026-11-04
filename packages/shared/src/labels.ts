import type {
  AnswerTier,
  Category,
  DocStatus,
  DocType,
  InquiryStatus,
  SourceType,
  Urgency,
} from "./types";

export const CATEGORY_LABEL: Record<Category, string> = {
  usage: "이용 방법",
  account: "계정",
  billing: "결제",
  bug: "기능 오류",
  feature: "개선 요청",
  other: "기타",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export const URGENCY_LABEL: Record<Urgency, string> = {
  critical: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};

export const URGENCIES: Urgency[] = ["critical", "high", "normal", "low"];
export const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export const URGENCY_TONE: Record<Urgency, string> = {
  critical: "bg-red-50 text-red-700 ring-red-600/15",
  high: "bg-orange-50 text-orange-700 ring-orange-600/15",
  normal: "bg-zinc-100 text-zinc-700 ring-zinc-500/15",
  low: "bg-zinc-50 text-zinc-500 ring-zinc-400/15",
};

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  received: "접수",
  in_review: "담당자 확인 중",
  need_info: "추가 정보 필요",
  answered: "답변 완료",
  closed: "상담 종료",
};

export const STATUSES = Object.keys(STATUS_LABEL) as InquiryStatus[];

export const STATUS_TONE: Record<InquiryStatus, string> = {
  received: "bg-sky-50 text-sky-700 ring-sky-600/15",
  in_review: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  need_info: "bg-amber-50 text-amber-700 ring-amber-600/20",
  answered: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  policy: "정책",
  faq: "FAQ",
  spec: "기능 명세",
  release: "릴리즈 노트",
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  valid: "유효",
  deprecated: "폐기",
  expired: "만료",
  review: "재검토 필요",
};

export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  valid: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  deprecated: "bg-zinc-100 text-zinc-500 ring-zinc-500/15",
  expired: "bg-zinc-100 text-zinc-500 ring-zinc-500/15",
  review: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  document: "문서",
  best_answer: "우수 답변",
  code: "코드",
  commit: "커밋",
};

export const TIER_LABEL: Record<AnswerTier, string> = {
  best: "우수 답변",
  candidate: "우수 답변 후보",
  normal: "일반 답변",
  quality_check: "품질 점검",
};

export const SECURITY_LEVELS = [
  {
    level: 0,
    name: "연동 안 함",
    outbound: "없음",
    desc: "문서 기반으로만 동작. 변경 감지는 문서 재업로드 시 버전 비교로 대체. 코드 근거·이슈 생성 불가.",
  },
  {
    level: 1,
    name: "메타데이터만",
    outbound: "변경 파일 경로, 커밋 메시지, 변경된 함수·클래스 이름",
    desc: "코드 본문은 읽지 않음. 커밋 메시지가 부실하면 정확도 하락. 코드 근거 초안 불가, 이슈에는 파일 경로만.",
  },
  {
    level: 2,
    name: "범위 제한 연동 (기본값)",
    outbound: "선택 경로의 코드 청크 (제외 패턴·시크릿 스캔 적용 후)",
    desc: "전체 기능. 코드는 담당자 화면에만 보이고 고객 답변에는 들어가지 않음.",
  },
  {
    level: 3,
    name: "고객사 내부 실행",
    outbound: "분석 결과만 (예: \"요금 변경, 영향 영역: 결제\")",
    desc: "코드 분석 워커를 고객 GitHub Actions 또는 서버에서 실행. 해커톤에서는 구조도로만 제시.",
  },
] as const;
