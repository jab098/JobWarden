import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentTailoringRepository } from "./development-tailoring";
import type { TailoringRepository } from "./repository";
import { createSupabaseTailoringRepository } from "./supabase-tailoring";

export async function getTailoringRepository(): Promise<TailoringRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) {
    return createDevelopmentTailoringRepository();
  }

  return createSupabaseTailoringRepository(await createClient());
}
