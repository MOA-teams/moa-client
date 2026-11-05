import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerSignup } from "@/components/auth/customer-auth";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <CustomerSignup />
    </Suspense>
  );
}
