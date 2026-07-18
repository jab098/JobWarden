import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/access-server";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
