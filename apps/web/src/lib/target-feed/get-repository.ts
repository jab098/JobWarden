import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentTargetFeedRepository } from "./development-target-feed";
import type { TargetFeedRepository } from "./repository";
import { createSupabaseTargetFeedRepository } from "./supabase-target-feed";

export async function getTargetFeedRepository(): Promise<TargetFeedRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentTargetFeedRepository();

  return createSupabaseTargetFeedRepository(await createClient());
}
