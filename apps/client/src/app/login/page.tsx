import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerLogin } from "@/components/auth/customer-auth";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "로그인" };

export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <CustomerLogin />
    </Suspense>
  );
}
