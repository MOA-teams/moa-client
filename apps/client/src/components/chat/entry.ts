/**
 * 싱크노트 "문의하기" 진입 정보
 *   /chat?cid=U-2001&os=iOS%2018&app_version=2.4.0&error_code=E-502&from=...
 * - cid → source_customer_id (문자열 그대로, 최대 128자)
 * - os / app_version / error_code → env (전달값 우선, 없을 때만 브라우저 감지값·null)
 */
import type { InquiryEnv } from "@moa/shared/inquiry";

export interface EntryInfo {
  cid: string | null;
  os: string | null;
  appVersion: string | null;
  errorCode: string | null;
  /** 진입 query가 하나라도 있으면 새 문의 흐름 */
  hasEntry: boolean;
}

const LIMIT = { cid: 128, os: 200, app_version: 100, error_code: 100 } as const;

function pick(params: URLSearchParams, key: keyof typeof LIMIT) {
  const v = params.get(key);
  if (v === null) return null;
  const t = v.trim();
  // 길이 초과 값은 잘라서 다른 값으로 바꾸지 않고 버린다 (cid는 식별자라 변형 금지)
  if (!t || t.length > LIMIT[key]) return null;
  return t;
}

export function readEntry(params: URLSearchParams): EntryInfo {
  const cid = pick(params, "cid");
  const os = pick(params, "os");
  const appVersion = pick(params, "app_version");
  const errorCode = pick(params, "error_code");
  return { cid, os, appVersion, errorCode, hasEntry: !!(cid || os || appVersion || errorCode) };
}

/** 브라우저에서 감지 가능한 OS (전달값이 없을 때만 사용) */
export function detectOs(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return `iOS ${ua.match(/OS (\d+)_/)?.[1] ?? ""}`.trim();
  if (/Android/.test(ua)) return `Android ${ua.match(/Android (\d+)/)?.[1] ?? ""}`.trim();
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** 진입값 우선, 없는 항목만 감지값·null로 보완 (백엔드 env 필드만) */
export function initialEnv(entry: EntryInfo): InquiryEnv {
  return {
    os: entry.os ?? detectOs(),
    app_version: entry.appVersion ?? null,
    error_code: entry.errorCode ?? null,
  };
}

/**
 * 로그인 후 돌아갈 주소: /chat 경로만 허용 (query는 유지).
 * useSearchParams().get("next")로 한 번 디코딩된 값을 그대로 받으며, 다시 디코딩하지 않는다.
 */
export function safeChatNext(next: string | null | undefined): string {
  const fallback = "/chat";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const base = "http://moa.invalid";
    const u = new URL(next, base);
    if (u.origin !== base || u.pathname !== "/chat") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/** 현재 주소(경로+query)를 next 파라미터로 한 번만 인코딩 */
export function loginHref(path: "/login" | "/signup", next: string) {
  return `${path}?next=${encodeURIComponent(safeChatNext(next))}`;
}
