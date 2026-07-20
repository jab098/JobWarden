import { AdminSection } from "@/components/admin/admin-section";
import { requireAdmin } from "@/lib/auth/access-server";

/**
 * `requireAdmin` is unchanged and remains the real boundary. What changed is
 * the frame: this used to render `AdminShell`, a second rail with its own brand
 * and sign-out, nested inside the hub shell that `(protected)/layout.tsx`
 * already provides. Administration is a section of the hub, not a separate
 * product, so it now uses the hub's own container and colour.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return <AdminSection>{children}</AdminSection>;
}
