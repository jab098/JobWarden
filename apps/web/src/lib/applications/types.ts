import type {
  ApplicationInsights,
  ApplicationStage,
  NextActionState,
} from "@jobwarden/domain";

import type { JobListItem } from "@/lib/jobs/types";

/** The funnel stage names, written once for every surface that shows them. */
export const funnelStageLabels: Record<
  ApplicationInsights["funnel"][number]["stage"],
  string
> = {
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
};

export type ApplicationPlan = {
  nextAction: string | null;
  nextActionDueOn: string | null;
  notes: string | null;
};

export type ApplicationItem = {
  id: string;
  /** Null when the tracked listing is no longer visible (for example closed). */
  job: JobListItem | null;
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
