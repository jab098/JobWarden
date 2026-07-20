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

  // Whether the Admin item is drawn is decided here, on the server, and never
  // in the browser. `requireAdmin` on `/admin` itself remains the real
  // boundary; this only decides whether a door is visible.
  //
  // The development bypass deliberately does NOT resolve to `/admin`: AGENTS.md
  // forbids it from granting administrator access, and `requireAdmin` would
  // rightly refuse it, so the link would be a dead end. It points at the
  // read-only fictional preview instead, which is the surface a reviewer can
  // actually use locally.
  let adminHref: string | null = null;
  if (developmentAccess.enabled) {
    adminHref = "/development/admin-preview";
  } else {
    const access = await requireProtectedAccess();
    adminHref = access.kind === "allowed" && access.isAdmin ? "/admin" : null;
  }

  // The shell renders here, once, so the rail survives navigation and route
  // loading states appear inside the frame instead of replacing it.
  return (
    <AppShell
      dataMode={developmentAccess.enabled ? "fixtures" : "supabase"}
      adminHref={adminHref}
    >
      {children}
    </AppShell>
  );
}
