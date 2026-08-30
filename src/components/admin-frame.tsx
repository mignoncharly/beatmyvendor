import { DashboardShell } from "@/components/dashboard-shell";
import { AdminNav } from "@/components/admin-nav";

export function AdminFrame({ children }: { children: React.ReactNode }) {
  return <DashboardShell area="Admin" organization="BeatMyyVendor"><AdminNav />{children}</DashboardShell>;
}
