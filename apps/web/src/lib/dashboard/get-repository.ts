import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentDashboardRepository } from "./development-dashboard";
import type { DashboardRepository } from "./repository";
import { createSupabaseDashboardRepository } from "./supabase-dashboard";

export async function getDashboardRepository(): Promise<DashboardRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentDashboardRepository();

  return createSupabaseDashboardRepository(await createClient());
}
