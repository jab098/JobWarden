import "server-only";

import { buildDashboard } from "@jobwarden/domain";

import type { DashboardRepository } from "./repository";
import type { DashboardResult } from "./types";

/**
 * Frozen fictional statistics. The clock is fixed so the preview renders the
 * same trend every time and its designed states stay reviewable.
 */
const previewNow = new Date("2026-07-20T08:10:00.000Z");

function daysAgo(days: number, hour = 9): string {
  const date = new Date(previewNow.getTime() - days * 24 * 60 * 60 * 1000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function createDevelopmentDashboardRepository(): DashboardRepository {
  return {
    async getDashboard(windowDays: number): Promise<DashboardResult> {
      const dashboard = buildDashboard({
        now: previewNow,
        windowDays,
        applications: [
          {
            id: "91000000-0000-4000-8000-000000000001",
            stage: "interviewing",
            nextAction: "Send follow-up note",
            nextActionDueOn: "2026-07-19",
            createdAt: daysAgo(12),
            lastTransitionAt: daysAgo(2),
            reachedStages: ["applied", "screening", "interviewing"],
          },
          {
            id: "91000000-0000-4000-8000-000000000002",
            stage: "applied",
            nextAction: null,
            nextActionDueOn: "2026-07-20",
            createdAt: daysAgo(3),
            lastTransitionAt: daysAgo(3),
            reachedStages: ["applied"],
          },
          {
            id: "91000000-0000-4000-8000-000000000003",
            stage: "applied",
            nextAction: null,
            nextActionDueOn: null,
            createdAt: daysAgo(30),
            lastTransitionAt: daysAgo(30),
            reachedStages: ["applied"],
          },
          {
            id: "91000000-0000-4000-8000-000000000004",
            stage: "rejected",
            nextAction: null,
            nextActionDueOn: null,
            createdAt: daysAgo(21),
            lastTransitionAt: daysAgo(9),
            reachedStages: ["applied", "screening", "rejected"],
          },
        ],
        jobDecisions: [
          { decision: "saved", decidedAt: daysAgo(1) },
          { decision: "saved", decidedAt: daysAgo(2) },
          { decision: "considering", decidedAt: daysAgo(3) },
          { decision: "dismissed", decidedAt: daysAgo(4) },
          { decision: "dismissed", decidedAt: daysAgo(20) },
        ],
        matchingJobs: [
          { firstSeenAt: daysAgo(0), profileName: "Implementation leadership" },
          { firstSeenAt: daysAgo(1), profileName: "Implementation leadership" },
          { firstSeenAt: daysAgo(1), profileName: "Implementation leadership" },
          { firstSeenAt: daysAgo(3), profileName: "Measurement contracts" },
          { firstSeenAt: daysAgo(5), profileName: "Measurement contracts" },
        ],
        enabledSearchProfiles: [
          "Implementation leadership",
          "Measurement contracts",
        ],
        explore: {
          enabled: true,
          qualifyingCount: 2,
          dismissedCount: 1,
          promotedCount: 1,
        },
        profile: {
          confirmedEvidenceCount: 14,
          enabledSearchCount: 2,
          hasCv: true,
          cvKind: "docx",
        },
        notificationDeliveries: [
          { status: "sent", createdAt: daysAgo(1, 8) },
          { status: "sent", createdAt: daysAgo(2, 8) },
          { status: "suppressed_no_matches", createdAt: daysAgo(2, 11) },
          { status: "suppressed_no_matches", createdAt: daysAgo(3, 8) },
          { status: "failed", createdAt: daysAgo(4, 8) },
        ],
      });

      return { ...dashboard, dataMode: "fixtures" };
    },
  };
}
