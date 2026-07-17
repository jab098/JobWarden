import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentJobsRepository } from "./development-jobs";
import type { JobsRepository } from "./repository";
import { createSupabaseJobsRepository } from "./supabase-jobs";

export async function getJobsRepository(): Promise<JobsRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentJobsRepository();

  return createSupabaseJobsRepository(await createClient());
}
