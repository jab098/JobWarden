export const applicationStages = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ApplicationStage = (typeof applicationStages)[number];

/**
 * Explicit forward transition map. Acceptance requires an observed offer,
 * terminal stages never reopen, and archiving is always available as the
 * closing move. Mirrored verbatim by the transition_career_application RPC.
 */
export const applicationTransitions: Readonly<
  Record<ApplicationStage, readonly ApplicationStage[]>
> = {
  applied: [
    "screening",
    "interviewing",
    "offer",
    "rejected",
    "withdrawn",
    "archived",
  ],
  screening: ["interviewing", "offer", "rejected", "withdrawn", "archived"],
  interviewing: ["offer", "rejected", "withdrawn", "archived"],
  offer: ["accepted", "rejected", "withdrawn", "archived"],
  accepted: ["archived"],
  rejected: ["archived"],
  withdrawn: ["archived"],
  archived: [],
};

export function canTransition(
  from: ApplicationStage,
  to: ApplicationStage,
): boolean {
  return applicationTransitions[from].includes(to);
}

export type NextActionState = "overdue" | "due_today" | "upcoming" | "none";

/** ISO dates compare lexicographically, so this stays timezone-free. */
export function classifyNextAction(
  dueOn: string | null,
  today: string,
): NextActionState {
  if (dueOn === null) return "none";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "due_today";
  return "upcoming";
}

export interface ApplicationSnapshotInput {
  id: string;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null;
  /** ISO datetime of the latest audited stage event. */
  lastTransitionAt: string;
  /** Audited stages this application has reached, including the current one. */
  reachedStages: readonly ApplicationStage[];
}

const funnelStages = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
] as const;

const observedOutcomeStages: readonly ApplicationStage[] = [
  "accepted",
  "rejected",
  "withdrawn",
];

const openStages: readonly ApplicationStage[] = [
  "applied",
  "screening",
  "interviewing",
  "offer",
];

const QUIET_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ApplicationInsights {
  totalTracked: number;
  stageCounts: Readonly<Record<ApplicationStage, number>>;
  funnel: readonly {
    stage: (typeof funnelStages)[number];
    reached: number;
  }[];
  /**
   * Observed = an accepted/rejected/withdrawn event was audited. Open =
   * currently in a pre-outcome stage. Quiet = open with no audited update for
   * 14+ days — reported as observed silence, never converted into rejection.
   */
  outcomes: { observed: number; open: number; quietFourteenPlusDays: number };
  followUps: { overdue: number; dueToday: number; upcoming: number };
}

export function buildApplicationInsights(
  applications: readonly ApplicationSnapshotInput[],
  now: Date,
): ApplicationInsights {
  const today = now.toISOString().slice(0, 10);

  const stageCounts = Object.fromEntries(
    applicationStages.map((stage) => [stage, 0]),
  ) as Record<ApplicationStage, number>;
  const reachedCounts = Object.fromEntries(
    funnelStages.map((stage) => [stage, 0]),
  ) as Record<(typeof funnelStages)[number], number>;

  let observed = 0;
  let open = 0;
  let quiet = 0;
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;

  for (const application of applications) {
    stageCounts[application.stage] += 1;

    for (const stage of funnelStages) {
      if (application.reachedStages.includes(stage)) {
        reachedCounts[stage] += 1;
      }
    }

    if (
      application.reachedStages.some((stage) =>
        observedOutcomeStages.includes(stage),
      )
    ) {
      observed += 1;
    }
    if (openStages.includes(application.stage)) {
      open += 1;
      const quietDays =
        (now.getTime() - new Date(application.lastTransitionAt).getTime()) /
        MS_PER_DAY;
      if (quietDays >= QUIET_THRESHOLD_DAYS) quiet += 1;
    }

    const state = classifyNextAction(application.nextActionDueOn, today);
    if (state === "overdue") overdue += 1;
    else if (state === "due_today") dueToday += 1;
    else if (state === "upcoming") upcoming += 1;
  }

  return {
    totalTracked: applications.length,
    stageCounts,
    funnel: funnelStages.map((stage) => ({
      stage,
      reached: reachedCounts[stage],
    })),
    outcomes: { observed, open, quietFourteenPlusDays: quiet },
    followUps: { overdue, dueToday, upcoming },
  };
}
