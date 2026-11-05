import path from "node:path";
import type { NextConfig } from "next";

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
    return [{ source: "/backend/:path*", destination: `${BACKEND_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
