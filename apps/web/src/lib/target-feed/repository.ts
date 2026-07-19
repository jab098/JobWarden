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
  /**
   * Every decision this user has made, by job. Search results need it so a job
   * already saved from the feed does not offer to save it again; scoring the
   * whole catalogue to find that out would be absurd.
   */
  getDecisions(): Promise<ReadonlyMap<string, JobDecision>>;
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
