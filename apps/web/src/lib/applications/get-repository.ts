import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentApplicationsRepository } from "./development-applications";
import type { ApplicationsRepository } from "./repository";
import { createSupabaseApplicationsRepository } from "./supabase-applications";

export async function getApplicationsRepository(): Promise<ApplicationsRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) {
    return createDevelopmentApplicationsRepository();
  }

  return createSupabaseApplicationsRepository(await createClient());
}
