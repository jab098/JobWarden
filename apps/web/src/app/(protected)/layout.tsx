import { AppShell } from "@/components/app-shell";
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

  // The shell renders here, once, so the rail survives navigation and route
  // loading states appear inside the frame instead of replacing it.
  return (
    <AppShell dataMode={developmentAccess.enabled ? "fixtures" : "supabase"}>
      {children}
    </AppShell>
  );
}
