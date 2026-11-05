import type { Metadata } from "next";
import { BestAnswersView } from "@/components/admin/best-answers";

export const metadata: Metadata = { title: "우수 답변" };

export default function BestAnswersPage() {
  return <BestAnswersView />;
}
