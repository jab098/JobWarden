import { describe, expect, it } from "vitest";

import {
  createSaveJobSourceInputSchema,
  getComplianceReviewState,
  requestSourceIngestionInputSchema,
} from "./admin";

const sourceId = "2a4e3272-f651-44bb-a6f7-9b72499f094f";

function validSource() {
  return {
    sourceId: null,
    provider: "greenhouse",
    boardToken: "fictional-northstar",
    employerName: " Fictional Northstar UK Ltd ",
    enabled: true,
    minimumSyncMinutes: 60,
    termsReviewedAt: "2026-07-17",
    robotsReviewedAt: "2026-07-16",
    complianceNotes: " Documented public GET endpoint reviewed. ",
    allowedHosts: ["boards.greenhouse.io", "fictional.example.test"],
  };
}

const schema = createSaveJobSourceInputSchema("2026-07-18");

describe("administrator source validation", () => {
  it("accepts and trims a compliant Greenhouse source", () => {
    expect(schema.parse(validSource())).toEqual({
      ...validSource(),
      employerName: "Fictional Northstar UK Ltd",
      complianceNotes: "Documented public GET endpoint reviewed.",
    });
  });

  it("accepts a Lever board, whose adapter shipped in Task 30a", () => {
    expect(
      schema.safeParse({ ...validSource(), provider: "lever" }).success,
    ).toBe(true);
  });

  it("accepts an Ashby board, whose adapter shipped in Task 31", () => {
    expect(
      schema.safeParse({ ...validSource(), provider: "ashby" }).success,
    ).toBe(true);
  });

  it.each([
    ["another provider", { provider: "indeed" }],
    ["Workable, whose adapter has not shipped", { provider: "workable" }],
    [
      "Reed, which is a pinned singleton, not an admin board",
      {
        provider: "reed",
      },
    ],
    ["whitespace in a board token", { boardToken: "north star" }],
    ["a control in a board token", { boardToken: "north\nstar" }],
    ["an interval below 15 minutes", { minimumSyncMinutes: 14 }],
    ["an interval above seven days", { minimumSyncMinutes: 10_081 }],
    ["a fractional interval", { minimumSyncMinutes: 15.5 }],
    ["a future terms review", { termsReviewedAt: "2026-07-19" }],
    ["an impossible review date", { robotsReviewedAt: "2026-02-30" }],
    ["short compliance notes", { complianceNotes: "no" }],
    ["an invalid source UUID", { sourceId: "source-1" }],
  ])("rejects %s", (_label, override) => {
    expect(schema.safeParse({ ...validSource(), ...override }).success).toBe(
      false,
    );
  });

  it.each([
    ["no hosts", []],
    [
      "more than ten hosts",
      Array.from({ length: 11 }, (_, index) => `host-${index}.example.test`),
    ],
    ["uppercase hosts", ["Boards.greenhouse.io"]],
    ["schemed hosts", ["https://boards.greenhouse.io"]],
    ["hosts with paths", ["boards.greenhouse.io/jobs"]],
    ["duplicate hosts", ["boards.greenhouse.io", "boards.greenhouse.io"]],
  ])("rejects %s", (_label, allowedHosts) => {
    expect(schema.safeParse({ ...validSource(), allowedHosts }).success).toBe(
      false,
    );
  });

  it("accepts an existing source UUID", () => {
    expect(schema.parse({ ...validSource(), sourceId }).sourceId).toBe(
      sourceId,
    );
  });
});

describe("compliance review state", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it.each([
    [334, "current"],
    [335, "due_soon"],
    [365, "due_soon"],
    [366, "overdue"],
  ] as const)("classifies a review %i days old as %s", (days, state) => {
    const reviewedAt = new Date(now);
    reviewedAt.setUTCDate(reviewedAt.getUTCDate() - days);

    expect(
      getComplianceReviewState(reviewedAt.toISOString().slice(0, 10), now),
    ).toBe(state);
  });
});

describe("ingestion request validation", () => {
  it("accepts only a source UUID", () => {
    expect(requestSourceIngestionInputSchema.parse({ sourceId })).toEqual({
      sourceId,
    });
    expect(
      requestSourceIngestionInputSchema.safeParse({ sourceId: "source-1" })
        .success,
    ).toBe(false);
  });
});
