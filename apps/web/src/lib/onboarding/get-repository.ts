import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import { createDevelopmentOnboardingRepository } from "./development-onboarding";
import type { OnboardingRepository } from "./repository";
import { createSupabaseOnboardingRepository } from "./supabase-onboarding";

export async function getOnboardingRepository(): Promise<OnboardingRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) {
    return createDevelopmentOnboardingRepository();
  }

  return createSupabaseOnboardingRepository(await createClient());
}
