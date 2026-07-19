import type {
  ApplicationInsights,
  ApplicationStage,
  NextActionState,
} from "@jobwarden/domain";

import type { JobListItem } from "@/lib/jobs/types";

export type ApplicationPlan = {
  nextAction: string | null;
  nextActionDueOn: string | null;
  notes: string | null;
};

export type ApplicationItem = {
  id: string;
  job: JobListItem;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null;
  nextActionState: NextActionState;
  notes: string | null;
  lastTransitionAt: string;
};

export type ApplicationsResult = {
  /** Ordered by most recent audited activity first. */
  items: readonly ApplicationItem[];
  insights: ApplicationInsights;
  dataMode: "supabase" | "fixtures";
};

export type ApplicationsActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
