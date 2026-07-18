import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentProfileRepository } from "./development-profile";
import type { ProfileRepository } from "./repository";
import { createSupabaseProfileRepository } from "./supabase-profile";

export async function getProfileRepository(): Promise<ProfileRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });
  if (developmentAccess.enabled) return createDevelopmentProfileRepository();
  return createSupabaseProfileRepository(await createClient());
}
