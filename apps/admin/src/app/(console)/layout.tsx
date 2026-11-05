import { AdminShell } from "@/components/admin/shell";
import { RequireAdmin } from "@/components/auth/admin-auth";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <AdminShell>{children}</AdminShell>
    </RequireAdmin>
  );
}
