import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 기존 TypeScript 도구로 API 모듈을 실행한다. 네트워크·인증·서버 데이터는 변경하지 않는다.
const source = await readFile(new URL("../packages/shared/src/groups.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
function load(authed = async () => ({})) {
  const exports = {};
  vm.runInNewContext(outputText, { exports, URL, URLSearchParams, require(name) { assert.equal(name, "./auth"); return { authed }; } });
  return exports;
}
const group = { group_id: "G-001", episode_id: "episode_0123456789abcdef0123456789abcdef", issue_creation_status: null, issue_url: null };

test("실제 그룹 목록·상세는 인증된 backend 경로와 cursor를 사용한다", async () => {
  const calls = [];
  const { groupApi } = load(async (...args) => { calls.push(args); return { items: [], has_more: false, next_cursor: null }; });
  await groupApi.list("cursor+/=");
  await groupApi.detail("G-001", "next-page");
  assert.equal(calls[0][0], "/api/v1/admin/groups?limit=20&cursor=cursor%2B%2F%3D");
  assert.equal(calls[1][0], "/api/v1/admin/groups/G-001?limit=20&cursor=next-page");
});

test("Issue 요청은 서버 episode·멱등키를 보내고 202를 생성 완료로 꾸미지 않는다", async () => {
  const calls = [];
  const accepted = { group_id: group.group_id, episode_id: group.episode_id, issue_creation_status: "대기" };
  const { groupApi } = load(async (...args) => { calls.push(args); return accepted; });
  const result = await groupApi.createIssue(group.group_id, group.episode_id, "qa-fixed-idempotency-key");
  await groupApi.createIssue(group.group_id, group.episode_id, "qa-fixed-idempotency-key");
  assert.equal(calls[0][0], "/api/v1/admin/groups/G-001/github-issues");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    method: "POST", headers: { "Idempotency-Key": "qa-fixed-idempotency-key" },
    body: { episode_id: group.episode_id, include_suspected_code: true },
  });
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(result, accepted);
  assert.equal(result.issue_url, undefined);
});

test("실패 응답은 모의 성공으로 대체하지 않고 호출자에게 전달한다", async () => {
  const failure = new Error("GITHUB_INTEGRATION_NOT_READY");
  const { groupApi } = load(async () => { throw failure; });
  await assert.rejects(groupApi.createIssue(group.group_id, group.episode_id, "same-key"), failure);
});

test("장애 구간이 없거나 이미 접수·실패·확인 중인 작업은 중복 생성하지 않는다", () => {
  const { canRequestIssue } = load();
  assert.equal(canRequestIssue(group), true);
  assert.equal(canRequestIssue({ ...group, episode_id: null }), false);
  for (const status of ["대기", "처리 중", "완료", "실패", "확인 필요"]) {
    assert.equal(canRequestIssue({ ...group, issue_creation_status: status }), false, status);
  }
  assert.equal(canRequestIssue({ ...group, issue_url: "https://github.com/MOA-demo/syncnote-app/issues/7" }), false);
});

test("완료 확인 전에는 GitHub 링크가 없고 완료된 실제 Issue URL만 표시한다", () => {
  const { completedIssueUrl } = load();
  const url = "https://github.com/MOA-demo/syncnote-app/issues/7";
  for (const status of [null, "대기", "처리 중", "실패", "확인 필요"]) {
    assert.equal(completedIssueUrl({ ...group, issue_url: url, issue_creation_status: status }), null);
  }
  assert.equal(completedIssueUrl({ ...group, issue_url: url, issue_creation_status: "완료" }), url);
  for (const invalid of [null, "", "javascript:alert(1)", "https://example.com/issues/7", "https://github.com/MOA-demo/syncnote-app/pull/3"]) {
    assert.equal(completedIssueUrl({ ...group, issue_url: invalid, issue_creation_status: "완료" }), null);
  }
});

test("EPISODE_ENDED로 취소된 자동 작업만 수동 재요청할 수 있다", () => {
  const { canRequestIssue } = load();
  const cancelled = { ...group, issue_creation_status: "실패", issue_error_code: "EPISODE_ENDED" };
  assert.equal(canRequestIssue(cancelled), true);
  assert.equal(canRequestIssue({ ...cancelled, episode_id: null }), false);
  assert.equal(canRequestIssue({ ...cancelled, issue_url: "https://github.com/MOA-demo/syncnote-app/issues/7" }), false);
  assert.equal(canRequestIssue({ ...cancelled, issue_creation_status: "확인 필요" }), false);
  assert.equal(canRequestIssue({ ...cancelled, issue_error_code: "GITHUB_UNAVAILABLE" }), false);
});

// 선택 API의 실제 계약(tree 디렉터리 경로)을 컴포넌트의 원본 변환 함수로 검증한다.
const callbackSource = await readFile(new URL("../apps/admin/src/components/admin/github-callback.tsx", import.meta.url), "utf8");
const callbackAst = ts.createSourceFile("github-callback.tsx", callbackSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dirsNode = callbackAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "dirsOf");
assert.ok(dirsNode, "디렉터리 변환 함수를 찾을 수 있어야 한다");
const dirsModule = ts.transpileModule(`export ${dirsNode.getText(callbackAst)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const dirsExports = {};
vm.runInNewContext(dirsModule.outputText, { exports: dirsExports });

test("GitHub 최상위 디렉터리 sync·billing·auth를 감시 경로 선택에 보존한다", () => {
  assert.deepEqual(Array.from(dirsExports.dirsOf(["auth", "billing", "sync", "src", ".github"])), [".github/", "auth/", "billing/", "src/", "sync/"]);
});

test("하위 디렉터리를 누락하지 않고 중복과 끝 슬래시를 정규화한다", () => {
  assert.deepEqual(Array.from(dirsExports.dirsOf(["src", "src/components", "src/components/admin", "src/", "src/components/", ""])), ["src/", "src/components/", "src/components/admin/"]);
});
