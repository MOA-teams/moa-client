import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata: Metadata = { title: "초기 세팅" };

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
