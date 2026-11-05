import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLogin } from "@/components/auth/admin-auth";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "로그인" };

export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AdminLogin />
    </Suspense>
  );
}
