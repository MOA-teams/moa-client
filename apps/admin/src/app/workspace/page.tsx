import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceSetup } from "@/components/auth/admin-auth";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "기업 연결" };

export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <WorkspaceSetup />
    </Suspense>
  );
}
