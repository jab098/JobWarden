import { describe, expect, it } from "vitest";

import {
  applicationStages,
  applicationTransitions,
  buildApplicationInsights,
  canTransition,
  classifyNextAction,
  londonIsoDate,
  type ApplicationSnapshotInput,
  type ApplicationStage,
} from "./applications.ts";

function snapshot(
  overrides: Partial<ApplicationSnapshotInput> = {},
): ApplicationSnapshotInput {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    stage: "applied",
    nextAction: null,
    nextActionDueOn: null,
    lastTransitionAt: "2026-07-18T09:00:00.000Z",
    reachedStages: ["applied"],
    ...overrides,
  };
}

const now = new Date("2026-07-19T12:00:00.000Z");

describe("application stages and transitions", () => {
  it("defines the eight explicit stages in order", () => {
    expect(applicationStages).toEqual([
      "applied",
      "screening",
      "interviewing",
      "offer",
      "accepted",
      "rejected",
      "withdrawn",
      "archived",
    ]);
  });

  it("allows exactly the documented forward transitions", () => {
    expect(applicationTransitions.applied).toEqual([
      "screening",
      "interviewing",
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(applicationTransitions.screening).toEqual([
      "interviewing",
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(applicationTransitions.interviewing).toEqual([
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(applicationTransitions.offer).toEqual([
      "accepted",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(applicationTransitions.accepted).toEqual(["archived"]);
    expect(applicationTransitions.rejected).toEqual(["archived"]);
    expect(applicationTransitions.withdrawn).toEqual(["archived"]);
    expect(applicationTransitions.archived).toEqual(["applied"]);
  });

  it("refuses undeclared transitions", () => {
    expect(canTransition("applied", "screening")).toBe(true);
    expect(canTransition("offer", "accepted")).toBe(true);
    // Acceptance requires an observed offer first.
    expect(canTransition("applied", "accepted")).toBe(false);
    expect(canTransition("interviewing", "accepted")).toBe(false);
    // The only reverse edge is the explicit audited re-open.
    expect(canTransition("archived", "applied")).toBe(true);
    expect(canTransition("archived", "screening")).toBe(false);
    expect(canTransition("accepted", "offer")).toBe(false);
    expect(canTransition("rejected", "interviewing")).toBe(false);
    // No self-transitions.
    expect(canTransition("screening", "screening")).toBe(false);
  });
});

describe("londonIsoDate", () => {
  it("uses the Europe/London calendar date, not UTC", () => {
    // 23:30 UTC during BST is already the next day in London.
    expect(londonIsoDate(new Date("2026-07-19T23:30:00.000Z"))).toBe(
      "2026-07-20",
    );
    // During GMT the dates coincide.
    expect(londonIsoDate(new Date("2026-01-19T23:30:00.000Z"))).toBe(
      "2026-01-19",
    );
  });
});

describe("classifyNextAction", () => {
  it("classifies due dates against today deterministically", () => {
    expect(classifyNextAction(null, "2026-07-19")).toBe("none");
    expect(classifyNextAction("2026-07-18", "2026-07-19")).toBe("overdue");
    expect(classifyNextAction("2026-07-19", "2026-07-19")).toBe("due_today");
    expect(classifyNextAction("2026-07-20", "2026-07-19")).toBe("upcoming");
  });
});

describe("buildApplicationInsights", () => {
  it("counts stages and audited funnel reach", () => {
    const insights = buildApplicationInsights(
      [
        snapshot(),
        snapshot({
          id: "90000000-0000-4000-8000-000000000002",
          stage: "interviewing",
          reachedStages: ["applied", "screening", "interviewing"],
        }),
        snapshot({
          id: "90000000-0000-4000-8000-000000000003",
          stage: "rejected",
          reachedStages: ["applied", "screening", "rejected"],
        }),
      ],
      now,
    );

    expect(insights.totalTracked).toBe(3);
    expect(insights.stageCounts.applied).toBe(1);
    expect(insights.stageCounts.interviewing).toBe(1);
    expect(insights.stageCounts.rejected).toBe(1);
    expect(insights.funnel).toEqual([
      { stage: "applied", reached: 3 },
      { stage: "screening", reached: 2 },
      { stage: "interviewing", reached: 1 },
      { stage: "offer", reached: 0 },
      { stage: "accepted", reached: 0 },
    ]);
  });

  it("separates observed outcomes from open and quiet applications", () => {
    const insights = buildApplicationInsights(
      [
        // Observed outcome.
        snapshot({
          stage: "withdrawn",
          reachedStages: ["applied", "withdrawn"],
        }),
        // Open and recently active.
        snapshot({
          id: "90000000-0000-4000-8000-000000000002",
          stage: "screening",
          lastTransitionAt: "2026-07-18T09:00:00.000Z",
          reachedStages: ["applied", "screening"],
        }),
        // Open with no update observed for 14+ days: quiet, never "rejected".
        snapshot({
          id: "90000000-0000-4000-8000-000000000003",
          stage: "applied",
          lastTransitionAt: "2026-07-01T09:00:00.000Z",
        }),
      ],
      now,
    );

    expect(insights.outcomes).toEqual({
      observed: 1,
      open: 2,
      quietFourteenPlusDays: 1,
    });
  });

  it("never counts terminal stages as quiet however old they are", () => {
    const terminalStages: ApplicationStage[] = [
      "accepted",
      "rejected",
      "withdrawn",
      "archived",
    ];
    const insights = buildApplicationInsights(
      terminalStages.map((stage, index) =>
        snapshot({
          id: `90000000-0000-4000-8000-00000000000${index + 1}`,
          stage,
          lastTransitionAt: "2026-01-01T00:00:00.000Z",
          reachedStages: ["applied", stage],
        }),
      ),
      now,
    );

    expect(insights.outcomes.quietFourteenPlusDays).toBe(0);
    expect(insights.outcomes.open).toBe(0);
    // Archived without an accepted/rejected/withdrawn event is not an
    // observed outcome either; it is simply closed.
    expect(insights.outcomes.observed).toBe(3);
  });

  it("buckets follow-up next actions", () => {
    const insights = buildApplicationInsights(
      [
        snapshot({
          nextAction: "Chase referral",
          nextActionDueOn: "2026-07-10",
        }),
        snapshot({
          id: "90000000-0000-4000-8000-000000000002",
          stage: "screening",
          nextAction: "Prepare call notes",
          nextActionDueOn: "2026-07-19",
          reachedStages: ["applied", "screening"],
        }),
        snapshot({
          id: "90000000-0000-4000-8000-000000000003",
          nextAction: "Send thank-you note",
          nextActionDueOn: "2026-07-25",
        }),
        snapshot({ id: "90000000-0000-4000-8000-000000000004" }),
      ],
      now,
    );

    expect(insights.followUps).toEqual({
      overdue: 1,
      dueToday: 1,
      upcoming: 1,
    });
  });
});
