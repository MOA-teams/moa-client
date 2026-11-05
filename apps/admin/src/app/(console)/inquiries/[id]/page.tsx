import { Suspense } from "react";
import { InquiryDetailView } from "@/components/admin/inquiry-detail";
import { LoadingBlock } from "@moa/ui";

export default function InquiryPage({ params }: PageProps<"/inquiries/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <InquiryDetailView params={params} />
    </Suspense>
  );
}
