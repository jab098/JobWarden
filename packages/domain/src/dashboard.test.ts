import { describe, expect, it } from "vitest";

import {
  buildDashboard,
  comparePeriods,
  countByLondonDay,
  type DashboardInput,
} from "./dashboard.ts";

// A Monday, 09:10 Europe/London.
const now = new Date("2026-07-20T08:10:00.000Z");

function application(
  id: string,
  overrides: Partial<DashboardInput["applications"][number]> = {},
): DashboardInput["applications"][number] {
  return {
    id,
    stage: "applied",
    nextAction: null,
    nextActionDueOn: null,
    createdAt: "2026-07-18T09:00:00.000Z",
    lastTransitionAt: "2026-07-18T09:00:00.000Z",
    reachedStages: ["applied"],
    ...overrides,
  };
}

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    now,
    windowDays: 7,
    applications: [],
    jobDecisions: [],
    matchingJobs: [],
    enabledSearchProfiles: [],
    explore: {
      enabled: false,
      qualifyingCount: 0,
      dismissedCount: 0,
      promotedCount: 0,
    },
    profile: {
      confirmedEvidenceCount: 0,
      enabledSearchCount: 0,
      hasCv: false,
      cvKind: null,
    },
    notificationDeliveries: [],
    ...overrides,
  };
}

describe("countByLondonDay", () => {
  it("buckets timestamps by their London calendar day", () => {
    const counts = countByLondonDay(
      [
        "2026-07-19T23:30:00.000Z",
        "2026-07-19T23:59:00.000Z",
        "2026-07-20T08:00:00.000Z",
      ],
      new Date("2026-07-20T12:00:00.000Z"),
      3,
    );

    // 23:30 UTC on 19 July is already 20 July in British Summer Time.
    expect(counts).toEqual([
      { date: "2026-07-18", count: 0 },
      { date: "2026-07-19", count: 0 },
      { date: "2026-07-20", count: 3 },
    ]);
  });

  it("returns a zero-filled series when nothing happened", () => {
    const counts = countByLondonDay([], now, 3);

    expect(counts.map((day) => day.count)).toEqual([0, 0, 0]);
    expect(counts).toHaveLength(3);
  });

  it("ignores timestamps outside the window", () => {
    const counts = countByLondonDay(["2026-06-01T09:00:00.000Z"], now, 3);

    expect(counts.every((day) => day.count === 0)).toBe(true);
  });
});

describe("comparePeriods", () => {
  it("reports a rise against the previous window", () => {
    expect(comparePeriods(8, 5)).toEqual({
      current: 8,
      previous: 5,
      direction: "up",
      change: 3,
    });
  });

  it("reports a fall", () => {
    expect(comparePeriods(2, 5)).toMatchObject({
      direction: "down",
      change: 3,
    });
  });

  it("reports no change", () => {
    expect(comparePeriods(4, 4)).toMatchObject({
      direction: "level",
      change: 0,
    });
  });

  it("refuses to invent a baseline when the previous window is empty", () => {
    // Going from nothing to something is not a percentage rise; saying so would
    // be fabricating a comparison the data cannot support.
    expect(comparePeriods(6, 0)).toEqual({
      current: 6,
      previous: 0,
      direction: "no_baseline",
      change: 6,
    });
  });

  it("reports an empty pair as no baseline rather than level", () => {
    expect(comparePeriods(0, 0)).toMatchObject({ direction: "no_baseline" });
  });
});

describe("buildDashboard", () => {
  it("reports an entirely empty account honestly", () => {
    const dashboard = buildDashboard(input());

    expect(dashboard.applications.insights.totalTracked).toBe(0);
    expect(dashboard.applications.startedThisPeriod.direction).toBe(
      "no_baseline",
    );
    expect(dashboard.targetFeed.currentMatchCount).toBe(0);
    expect(dashboard.targetFeed.topProfileName).toBeNull();
    expect(dashboard.profileHealth.nudges).toContain("add_cv");
  });

  it("counts applications started in this window against the previous one", () => {
    const dashboard = buildDashboard(
      input({
        applications: [
          application("a", {
            createdAt: "2026-07-18T09:00:00.000Z",
            lastTransitionAt: "2026-07-18T09:00:00.000Z",
          }),
          application("b", {
            stage: "screening",
            reachedStages: ["applied", "screening"],
            createdAt: "2026-07-17T09:00:00.000Z",
            lastTransitionAt: "2026-07-19T09:00:00.000Z",
          }),
          application("c", {
            createdAt: "2026-07-08T09:00:00.000Z",
            lastTransitionAt: "2026-07-08T09:00:00.000Z",
          }),
        ],
      }),
    );

    expect(dashboard.applications.startedThisPeriod).toMatchObject({
      current: 2,
      previous: 1,
      direction: "up",
    });
  });

  it("passes the audited outcome split through without reinterpreting silence", () => {
    const dashboard = buildDashboard(
      input({
        applications: [
          application("a", {
            createdAt: "2026-06-01T09:00:00.000Z",
            lastTransitionAt: "2026-06-01T09:00:00.000Z",
          }),
        ],
      }),
    );

    expect(dashboard.applications.insights.outcomes).toMatchObject({
      observed: 0,
      open: 1,
      quietFourteenPlusDays: 1,
    });
  });

  it("counts follow-ups by London date", () => {
    const dashboard = buildDashboard(
      input({
        applications: [
          application("a", { nextActionDueOn: "2026-07-19" }),
          application("b", { nextActionDueOn: "2026-07-20" }),
          application("c", { nextActionDueOn: "2026-07-25" }),
        ],
      }),
    );

    expect(dashboard.applications.insights.followUps).toEqual({
      overdue: 1,
      dueToday: 1,
      upcoming: 1,
    });
  });

  it("counts decisions by kind", () => {
    const dashboard = buildDashboard(
      input({
        jobDecisions: [
          { decision: "saved", decidedAt: "2026-07-19T09:00:00.000Z" },
          { decision: "saved", decidedAt: "2026-07-18T09:00:00.000Z" },
          { decision: "dismissed", decidedAt: "2026-07-18T09:00:00.000Z" },
          { decision: "considering", decidedAt: "2026-07-01T09:00:00.000Z" },
        ],
      }),
    );

    expect(dashboard.decisions.counts).toEqual({
      saved: 2,
      dismissed: 1,
      considering: 1,
    });
    expect(dashboard.decisions.inPeriod).toBe(3);
  });

  it("derives the match trend from when JobWarden first saw each job", () => {
    const dashboard = buildDashboard(
      input({
        matchingJobs: [
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Analytics" },
          { firstSeenAt: "2026-07-20T07:00:00.000Z", profileName: "Analytics" },
          { firstSeenAt: "2026-07-19T07:00:00.000Z", profileName: "Contracts" },
        ],
      }),
    );

    expect(dashboard.targetFeed.currentMatchCount).toBe(3);
    expect(dashboard.targetFeed.byDay.at(-1)).toEqual({
      date: "2026-07-20",
      count: 2,
    });
  });

  it("names the profile producing the most current matches", () => {
    const dashboard = buildDashboard(
      input({
        matchingJobs: [
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Analytics" },
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Analytics" },
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Contracts" },
        ],
      }),
    );

    expect(dashboard.targetFeed.topProfileName).toBe("Analytics");
  });

  it("reports no top profile rather than picking one arbitrarily on a tie", () => {
    const dashboard = buildDashboard(
      input({
        matchingJobs: [
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Analytics" },
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Contracts" },
        ],
      }),
    );

    expect(dashboard.targetFeed.topProfileName).toBeNull();
  });

  it("reports explore counts only when explore is on", () => {
    const off = buildDashboard(input());
    expect(off.explore.enabled).toBe(false);

    const on = buildDashboard(
      input({
        explore: {
          enabled: true,
          qualifyingCount: 3,
          dismissedCount: 1,
          promotedCount: 2,
        },
      }),
    );
    expect(on.explore).toMatchObject({
      enabled: true,
      qualifyingCount: 3,
      promotedCount: 2,
    });
  });

  it("nudges towards better matching without scoring the user", () => {
    const dashboard = buildDashboard(
      input({
        profile: {
          confirmedEvidenceCount: 0,
          enabledSearchCount: 0,
          hasCv: false,
          cvKind: null,
        },
      }),
    );

    expect(dashboard.profileHealth.nudges).toEqual([
      "add_cv",
      "confirm_evidence",
      "enable_search",
    ]);
    expect(dashboard.profileHealth).not.toHaveProperty("score");
  });

  it("drops a nudge once its condition is met", () => {
    const dashboard = buildDashboard(
      input({
        profile: {
          confirmedEvidenceCount: 12,
          enabledSearchCount: 2,
          hasCv: true,
          cvKind: "docx",
        },
      }),
    );

    expect(dashboard.profileHealth.nudges).toEqual([]);
  });

  it("nudges a PDF-only user towards a DOCX for tailoring", () => {
    const dashboard = buildDashboard(
      input({
        profile: {
          confirmedEvidenceCount: 12,
          enabledSearchCount: 2,
          hasCv: true,
          cvKind: "pdf",
        },
      }),
    );

    expect(dashboard.profileHealth.nudges).toEqual(["add_docx_for_tailoring"]);
  });

  it("summarises digest delivery outcomes", () => {
    const dashboard = buildDashboard(
      input({
        notificationDeliveries: [
          { status: "sent", createdAt: "2026-07-19T08:10:00.000Z" },
          { status: "sent", createdAt: "2026-07-18T08:10:00.000Z" },
          {
            status: "suppressed_no_matches",
            createdAt: "2026-07-18T11:10:00.000Z",
          },
          {
            status: "suppressed_daily_cap",
            createdAt: "2026-07-18T14:10:00.000Z",
          },
          { status: "failed", createdAt: "2026-07-17T08:10:00.000Z" },
        ],
      }),
    );

    expect(dashboard.digests).toEqual({
      sent: 2,
      noMatchSlots: 1,
      heldBack: 1,
      failed: 1,
    });
  });

  it("labels a history shorter than the window instead of padding it", () => {
    const dashboard = buildDashboard(
      input({
        windowDays: 7,
        applications: [
          application("a", {
            createdAt: "2026-07-19T09:00:00.000Z",
            lastTransitionAt: "2026-07-19T09:00:00.000Z",
          }),
        ],
      }),
    );

    expect(dashboard.windowDays).toBe(7);
    expect(dashboard.applications.startedThisPeriod.direction).toBe(
      "no_baseline",
    );
  });

  it("carries no CV text or job description into the result", () => {
    const dashboard = buildDashboard(
      input({
        matchingJobs: [
          { firstSeenAt: "2026-07-20T06:00:00.000Z", profileName: "Analytics" },
        ],
      }),
    );

    const payload = JSON.stringify(dashboard);
    expect(payload).not.toContain("description");
    expect(payload).not.toContain("evidence_excerpt");
  });
});
