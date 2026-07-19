import "server-only";

import type { ExploreResult } from "./types";

export interface ExploreRepository {
  getExplore(): Promise<ExploreResult>;
  setEnabled(enabled: boolean): Promise<void>;
  decide(
    pathwayConcept: string,
    decision: "dismissed" | "clear",
  ): Promise<void>;
  /**
   * Creates an enabled named search profile from the current suggestion and
   * records the promotion, so the pathway becomes a normal Target Feed input.
   */
  promote(pathwayConcept: string): Promise<void>;
}
