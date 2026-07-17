import { requireProtectedAccess } from "@/lib/auth/access-server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireProtectedAccess();
  return children;
}
