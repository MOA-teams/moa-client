"use client";

/**
 * 데모 시나리오(mock) 데이터를 브라우저 안에서 실행한다.
 *
 * 이전에는 Next Route Handler(서버 메모리)에 두었는데, Vercel 서버리스는 인스턴스가 새로 뜨거나
 * 여러 개로 나뉘면 메모리가 달라 "혼자 처음 상태로 돌아가거나 왔다 갔다 하는" 문제가 있었다.
 * 이제 데모 상태는 이 브라우저에만 있고 localStorage에 저장돼 새로고침해도 유지된다.
 * 실제 기능(문의·답변·문서·GitHub)은 이 모듈과 무관하게 백엔드(/backend/*)를 쓴다.
 */
import { setMockTransport } from "@moa/shared/api";
import { dispatch } from "@/server/dispatch";
import { db, exportDB, importDB } from "@/server/store";

const STORAGE_KEY = "moa.demo.db.v1";

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && importDB(saved)) return;
  } catch {}
  db(); // 저장본이 없으면 시드로 시작
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, exportDB());
  } catch {}
}

if (typeof window !== "undefined") {
  load();
  setMockTransport(async (method, rawPath, body) => {
    const [pathname, search = ""] = rawPath.split("?");
    const path = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const result = dispatch(method, path, new URLSearchParams(search), (body as Record<string, unknown>) ?? {});
    if (method !== "GET" && result.status < 400) save();
    // 저장소 원본 객체를 화면에 넘기지 않도록 복사 (React가 변경을 감지하도록)
    return { status: result.status, data: result.data === undefined ? undefined : JSON.parse(JSON.stringify(result.data)) };
  });
}

export {};
