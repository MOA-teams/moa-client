# 모아(MOA) 프론트엔드 모노레포

코드 변경을 따라가는 IT 스타트업용 고객 문의 분류·답변 초안 서비스.

```
apps/
  client/   고객 채팅 웹      http://localhost:3000  (/, /chat)
  admin/    담당자 어드민     http://localhost:3001  (/, /inquiries/[id], /groups, /changes, /best-answers, /documents, /settings)
packages/
  shared/   @moa/shared  타입 · API 클라이언트 · 라벨 · 유틸 · 훅
  ui/       @moa/ui      공통 UI 컴포넌트
```

## 실행

```bash
npm install
npm run dev          # client + admin 동시 실행
npm run dev:client   # 고객 채팅만
npm run dev:admin    # 어드민만
npm run build | lint | typecheck
```

## API

- 화면은 `packages/shared/src/api.ts` 만 통해 서버와 통신한다.
- 백엔드 연동 전에는 `apps/admin` 의 mock API(`src/app/api/[...path]`, `src/server/`)를 쓰고,
  client 는 `/api/*` 를 admin(:3001)으로 rewrite 해서 같은 상태를 공유한다.
- 실제 백엔드 연동 시 `NEXT_PUBLIC_API_BASE_URL` 을 지정하고 mock 코드를 삭제한다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | 실제 백엔드 주소 |
| `MOA_API_ORIGIN` | `http://localhost:3001` | client 가 mock API 로 rewrite 할 대상 |
| `NEXT_PUBLIC_CLIENT_URL` | `http://localhost:3000` | 어드민 → 고객 채팅 링크 |
| `NEXT_PUBLIC_ADMIN_URL` | `http://localhost:3001` | 클라이언트 → 어드민 링크 |
