import { requireApprovedAccess } from "@/lib/auth/access-server";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";

export const dynamic = "force-dynamic";

/**
 * Approved access without the onboarding requirement. Onboarding cannot sit
 * behind the gate it exists to satisfy, or a new user would be redirected in a
 * loop and could never reach the product.
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (!developmentAccess.enabled) await requireApprovedAccess();

  return children;
}
