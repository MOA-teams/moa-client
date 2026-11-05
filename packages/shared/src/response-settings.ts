/** 기업별 자동 질문·답변 정책 (GET/PATCH /api/v1/admin/settings/auto-response) */
import { authed } from "./auth";

export interface ResponseSettings {
  tenant_id: string;
  revision: number;
  questions_enabled: boolean;
  answers_enabled: boolean;
  /** 자동 추가 질문 최대 횟수 (1~3) */
  max_questions: number;
  updated_at: string | null;
  /** database: 관리자가 저장한 값, environment: 서버 환경 설정, default: 기본값 */
  source: "database" | "environment" | "default";
}

export interface ResponseSettingsUpdate {
  expected_revision: number;
  questions_enabled?: boolean | null;
  answers_enabled?: boolean | null;
  max_questions?: number | null;
}

export const responseSettingsApi = {
  get: () => authed<ResponseSettings>("/api/v1/admin/settings/auto-response"),
  update: (body: ResponseSettingsUpdate) => authed<ResponseSettings>("/api/v1/admin/settings/auto-response", { method: "PATCH", body }),
};
