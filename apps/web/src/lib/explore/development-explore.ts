import "server-only";

import { createDevelopmentProfileRepository } from "@/lib/profile/development-profile";

import type { ExploreRepository } from "./repository";
import { buildExploreResult } from "./supabase-explore";
import type { PathwayDecision } from "./types";

export class PreviewExploreUnavailableError extends Error {
  constructor() {
    super("Explore changes are unavailable in this preview.");
    this.name = "PreviewExploreUnavailableError";
  }
}

export function createDevelopmentExploreRepository(): ExploreRepository {
  return {
    async getExplore() {
      const snapshot = await createDevelopmentProfileRepository().getSnapshot();
      return buildExploreResult({
        enabled: true,
        snapshot,
        decisions: new Map<string, PathwayDecision>(),
        dataMode: "fixtures",
      });
    },
    setEnabled() {
      return Promise.reject(new PreviewExploreUnavailableError());
    },
    decide() {
      return Promise.reject(new PreviewExploreUnavailableError());
    },
    promote() {
      return Promise.reject(new PreviewExploreUnavailableError());
    },
  };
}
