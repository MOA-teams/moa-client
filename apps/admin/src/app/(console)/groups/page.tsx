import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupsView } from "@/components/admin/groups";
import { LoadingBlock } from "@moa/ui";

export const metadata: Metadata = { title: "문의 그룹" };

export default function GroupsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <GroupsView />
    </Suspense>
  );
}
