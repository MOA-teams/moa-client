import { Suspense } from "react";
import { InquiryRoute } from "@/components/admin/inquiry-route";
import { LoadingBlock } from "@moa/ui";

export default function InquiryPage({ params }: PageProps<"/inquiries/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <InquiryRoute params={params} />
    </Suspense>
  );
}
