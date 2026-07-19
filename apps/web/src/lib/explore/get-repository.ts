import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentExploreRepository } from "./development-explore";
import type { ExploreRepository } from "./repository";
import { createSupabaseExploreRepository } from "./supabase-explore";

export async function getExploreRepository(): Promise<ExploreRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentExploreRepository();

  return createSupabaseExploreRepository(await createClient());
}
