import type { Metadata } from "next";
import { SettingsView } from "@/components/admin/settings";

export const metadata: Metadata = { title: "설정·보안" };

export default function SettingsPage() {
  return <SettingsView />;
}
