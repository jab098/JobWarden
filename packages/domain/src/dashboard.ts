import {
  buildApplicationInsights,
  londonIsoDate,
  type ApplicationInsights,
  type ApplicationStage,
} from "./applications.ts";

/**
 * Every figure here is derived from the owner's own rows. Nothing is estimated,
 * inferred from other users, or collected specially for this page — the
 * dashboard is a read over data JobWarden already had a reason to store.
 */

export type DecisionKind = "saved" | "dismissed" | "considering";

export type DeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "suppressed_no_matches"
  | "suppressed_daily_cap"
  | "suppressed_monthly_cap";

export interface DashboardApplicationInput {
  id: string;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null;
  createdAt: string;
  lastTransitionAt: string;
  /** Audited stages this application has reached, including the current one. */
  reachedStages: readonly ApplicationStage[];
}

export interface DashboardInput {
  now: Date;
  windowDays: number;
  applications: readonly DashboardApplicationInput[];
  jobDecisions: readonly { decision: DecisionKind; decidedAt: string }[];
  /** Jobs currently matching an enabled profile, with when JobWarden first saw them. */
  matchingJobs: readonly { firstSeenAt: string; profileName: string }[];
  enabledSearchProfiles: readonly string[];
  explore: {
    enabled: boolean;
    qualifyingCount: number;
    dismissedCount: number;
    promotedCount: number;
  };
  profile: {
    confirmedEvidenceCount: number;
    enabledSearchCount: number;
    hasCv: boolean;
    cvKind: "docx" | "pdf" | null;
  };
  notificationDeliveries: readonly {
    status: DeliveryStatus;
    createdAt: string;
  }[];
}

export interface DayCount {
  date: string;
  count: number;
}

export type PeriodDirection = "up" | "down" | "level" | "no_baseline";

export interface PeriodComparison {
  current: number;
  previous: number;
  direction: PeriodDirection;
  change: number;
}

export type ProfileNudge =
  "add_cv" | "add_docx_for_tailoring" | "confirm_evidence" | "enable_search";

export interface Dashboard {
  windowDays: number;
  applications: {
    insights: ApplicationInsights;
    startedThisPeriod: PeriodComparison;
  };
  decisions: {
    counts: Readonly<Record<DecisionKind, number>>;
    inPeriod: number;
    byDay: readonly DayCount[];
  };
  targetFeed: {
    currentMatchCount: number;
    byDay: readonly DayCount[];
    /** Null on a tie, rather than picking a winner the data does not support. */
    topProfileName: string | null;
    enabledProfileNames: readonly string[];
  };
  explore: {
    enabled: boolean;
    qualifyingCount: number;
    dismissedCount: number;
    promotedCount: number;
  };
  profileHealth: {
    confirmedEvidenceCount: number;
    enabledSearchCount: number;
    hasCv: boolean;
    cvKind: "docx" | "pdf" | null;
    /** Suggestions, deliberately not a score. */
    nudges: readonly ProfileNudge[];
  };
  digests: {
    sent: number;
    noMatchSlots: number;
    heldBack: number;
    failed: number;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function londonDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(londonIsoDate(new Date(now.getTime() - offset * MS_PER_DAY)));
  }
  return keys;
}

/**
 * Buckets timestamps into the last `days` London calendar days, zero-filled so
 * a quiet day reads as zero rather than disappearing from the series.
 */
export function countByLondonDay(
  timestamps: readonly string[],
  now: Date,
  days: number,
): DayCount[] {
  const buckets = new Map(londonDayKeys(now, days).map((key) => [key, 0]));

  for (const timestamp of timestamps) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = londonIsoDate(parsed);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }

  return [...buckets].map(([date, count]) => ({ date, count }));
}

/**
 * Compares two equal windows. An empty previous window yields `no_baseline`
 * rather than an infinite rise: "up from nothing" is not a trend, and claiming
 * one would fabricate a comparison the data cannot support.
 */
export function comparePeriods(
  current: number,
  previous: number,
): PeriodComparison {
  if (previous === 0) {
    return { current, previous, direction: "no_baseline", change: current };
  }
  if (current === previous) {
    return { current, previous, direction: "level", change: 0 };
  }
  return {
    current,
    previous,
    direction: current > previous ? "up" : "down",
    change: Math.abs(current - previous),
  };
}

function withinWindow(
  timestamp: string,
  now: Date,
  fromDaysAgo: number,
  toDaysAgo: number,
): boolean {
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) return false;
  const start = now.getTime() - fromDaysAgo * MS_PER_DAY;
  const end = now.getTime() - toDaysAgo * MS_PER_DAY;
  return parsed > start && parsed <= end;
}

function buildNudges(profile: DashboardInput["profile"]): ProfileNudge[] {
  const nudges: ProfileNudge[] = [];
  if (!profile.hasCv) nudges.push("add_cv");
  else if (profile.cvKind === "pdf") nudges.push("add_docx_for_tailoring");
  if (profile.confirmedEvidenceCount === 0) nudges.push("confirm_evidence");
  if (profile.enabledSearchCount === 0) nudges.push("enable_search");
  return nudges;
}

function topProfileName(
  matchingJobs: DashboardInput["matchingJobs"],
): string | null {
  const counts = new Map<string, number>();
  for (const job of matchingJobs) {
    counts.set(job.profileName, (counts.get(job.profileName) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  const ranked = [...counts].toSorted((left, right) => right[1] - left[1]);
  const [first, second] = ranked;
  if (first === undefined) return null;
  if (second !== undefined && second[1] === first[1]) return null;
  return first[0];
}

export function buildDashboard(input: DashboardInput): Dashboard {
  const { now, windowDays } = input;

  const decisionCounts: Record<DecisionKind, number> = {
    saved: 0,
    dismissed: 0,
    considering: 0,
  };
  for (const decision of input.jobDecisions) {
    decisionCounts[decision.decision] += 1;
  }

  return {
    windowDays,
    applications: {
      insights: buildApplicationInsights(input.applications, now),
      startedThisPeriod: comparePeriods(
        input.applications.filter((application) =>
          withinWindow(application.createdAt, now, windowDays, 0),
        ).length,
        input.applications.filter((application) =>
          withinWindow(application.createdAt, now, windowDays * 2, windowDays),
        ).length,
      ),
    },
    decisions: {
      counts: decisionCounts,
      inPeriod: input.jobDecisions.filter((decision) =>
        withinWindow(decision.decidedAt, now, windowDays, 0),
      ).length,
      byDay: countByLondonDay(
        input.jobDecisions.map((decision) => decision.decidedAt),
        now,
        windowDays,
      ),
    },
    targetFeed: {
      currentMatchCount: input.matchingJobs.length,
      // Derived from when JobWarden first indexed each currently matching job.
      // There is no separate match history, and adding one would be new
      // analytics collection this page is not allowed to introduce.
      byDay: countByLondonDay(
        input.matchingJobs.map((job) => job.firstSeenAt),
        now,
        windowDays,
      ),
      topProfileName: topProfileName(input.matchingJobs),
      enabledProfileNames: input.enabledSearchProfiles,
    },
    explore: input.explore,
    profileHealth: {
      confirmedEvidenceCount: input.profile.confirmedEvidenceCount,
      enabledSearchCount: input.profile.enabledSearchCount,
      hasCv: input.profile.hasCv,
      cvKind: input.profile.cvKind,
      nudges: buildNudges(input.profile),
    },
    digests: {
      sent: input.notificationDeliveries.filter(
        (delivery) => delivery.status === "sent",
      ).length,
      noMatchSlots: input.notificationDeliveries.filter(
        (delivery) => delivery.status === "suppressed_no_matches",
      ).length,
      heldBack: input.notificationDeliveries.filter(
        (delivery) =>
          delivery.status === "suppressed_daily_cap" ||
          delivery.status === "suppressed_monthly_cap",
      ).length,
      failed: input.notificationDeliveries.filter(
        (delivery) => delivery.status === "failed",
      ).length,
    },
  };
}
