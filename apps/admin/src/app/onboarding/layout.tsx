import { RequireAdmin } from "@/components/auth/admin-auth";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
