import type { Metadata } from "next";
import { DocumentsView } from "@/components/admin/documents";

export const metadata: Metadata = { title: "문서" };

export default function DocumentsPage() {
  return <DocumentsView />;
}
