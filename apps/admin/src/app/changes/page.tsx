import type { Metadata } from "next";
import { ChangesView } from "@/components/admin/changes";

export const metadata: Metadata = { title: "변경 감지·재검토" };

export default function ChangesPage() {
  return <ChangesView />;
}
