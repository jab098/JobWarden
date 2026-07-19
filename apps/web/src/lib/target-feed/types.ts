import type { TargetFeedExplanation } from "@jobwarden/domain";

import type { JobListItem } from "@/lib/jobs/types";

export type JobDecision = "saved" | "dismissed" | "considering";

export type TargetFeedItem = {
  job: JobListItem;
  explanation: TargetFeedExplanation;
  decision: JobDecision | null;
};

export type TargetFeedResult = {
  items: readonly TargetFeedItem[];
  enabledProfileNames: readonly string[];
  candidateCap: 200;
  dataMode: "supabase" | "fixtures";
};

export type TargetFeedActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
