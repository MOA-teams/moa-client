import type { Metadata } from "next";
import { Suspense } from "react";
import { GitHubCallback } from "@/components/admin/github-callback";
import { LoadingBlock } from "@moa/ui";

export const metadata: Metadata = { title: "GitHub 연결" };

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <GitHubCallback />
    </Suspense>
  );
}
