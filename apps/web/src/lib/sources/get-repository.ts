import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentSourcesRepository } from "./development-sources";
import type { SourcesRepository } from "./repository";
import { createSupabaseSourcesRepository } from "./supabase-sources";

export async function getSourcesRepository(): Promise<SourcesRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentSourcesRepository();

  return createSupabaseSourcesRepository(await createClient());
}
