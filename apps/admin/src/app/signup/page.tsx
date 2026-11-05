import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSignup } from "@/components/auth/admin-auth";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AdminSignup />
    </Suspense>
  );
}
