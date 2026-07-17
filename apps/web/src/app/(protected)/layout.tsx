import { requireProtectedAccess } from "@/lib/auth/access-server";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (!developmentAccess.enabled) await requireProtectedAccess();

  return children;
}
