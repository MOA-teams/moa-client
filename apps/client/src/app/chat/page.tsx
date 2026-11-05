import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireCustomer } from "@/components/auth/customer-auth";
import { CustomerChat } from "@/components/chat/customer-chat";
import { FullPageSpinner } from "@moa/ui";

export const metadata: Metadata = { title: "싱크노트 고객센터" };

export default function ChatPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<FullPageSpinner />}>
        <CustomerChat />
      </Suspense>
    </RequireCustomer>
  );
}
