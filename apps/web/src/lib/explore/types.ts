import type { ExploreSuggestion } from "@jobwarden/domain";

export type PathwayDecision = "dismissed" | "promoted";

export type ExploreSuggestionItem = {
  suggestion: ExploreSuggestion;
  decision: PathwayDecision | null;
};

export type ExploreResult = {
  enabled: boolean;
  /** Qualifying suggestions that are not dismissed. */
  items: readonly ExploreSuggestionItem[];
  /** Qualifying but dismissed suggestions, restorable by the owner. */
  dismissed: readonly ExploreSuggestionItem[];
  dataMode: "supabase" | "fixtures";
};

export type ExploreActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
