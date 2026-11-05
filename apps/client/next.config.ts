import path from "node:path";
import type { NextConfig } from "next";

/** 백엔드 연동 전: /api/* 를 admin 앱의 mock API로 넘긴다 (상태 공유) */
const API_ORIGIN = process.env.MOA_API_ORIGIN ?? "http://localhost:3001";
/** MOA Backend (FastAPI). 같은 출처 /backend/* 로 프록시해 CORS 영향 없이 호출 */
const BACKEND_ORIGIN = process.env.MOA_BACKEND_ORIGIN ?? "https://52-196-205-217.nip.io";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@moa/shared", "@moa/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async rewrites() {
    const backend = { source: "/backend/:path*", destination: `${BACKEND_ORIGIN}/:path*` };
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return [backend];
    return [backend, { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
