import "server-only";

import {
  resolveDevelopmentAccessMode,
  type DevelopmentAccessInput,
} from "@/lib/development/access-mode";

import { createDevelopmentTargetFeedRepository } from "./development-target-feed";
import type { JobDecision, TargetFeedResult } from "./types";

export interface TargetFeedRepository {
  getFeed(options: { includeDismissed: boolean }): Promise<TargetFeedResult>;
  decide(jobId: string, decision: JobDecision | "clear"): Promise<void>;
}

export function createTargetFeedRepository(
  developmentAccessInput: DevelopmentAccessInput,
  createSupabaseRepository: () => TargetFeedRepository,
): TargetFeedRepository {
  const developmentAccess = resolveDevelopmentAccessMode(
    developmentAccessInput,
  );

  if (developmentAccess.enabled) return createDevelopmentTargetFeedRepository();

  return createSupabaseRepository();
}
