import { describe, expect, it } from "vitest";

import { normalisedJobSchema } from "./job.ts";
import { parseOnboardingState, isOnboardingComplete } from "./onboarding.ts";

/**
 * Every schema that reads a PostgreSQL `timestamptz` must accept what
 * PostgreSQL actually sends.
 *
 * PostgREST serialises `timestamptz` with a **numeric offset** —
 * `2026-07-21T12:39:52.150188+00:00` — and Zod's `z.iso.datetime()` rejects an
 * offset unless told to accept one. Every fixture in this repository was
 * written with a trailing `Z`, which PostgreSQL never emits, so the suite was
 * green while the product could not read its own rows.
 *
 * It surfaced when an owner finished onboarding and was returned to step one:
 * the completed row failed to parse, so `isOnboardingComplete` read false. The
 * jobs feed, target feed and application tracker carried the same defect and
 * had simply never had a row to fail on.
 *
 * These strings are the exact shape observed on a live project, not invented.
 */
const postgresTimestamps = [
  "2026-07-21T12:39:52.150188+00:00",
  "2026-07-21T10:18:29.944436+00:00",
  // A non-UTC offset, which a differently configured database would send.
  "2026-07-21T13:39:52.150188+01:00",
  // Whole seconds, which Postgres emits when the column has no sub-second part.
  "2026-07-21T12:39:52+00:00",
];

describe("onboarding state", () => {
  it.each(postgresTimestamps)("parses a completedAt of %s", (completedAt) => {
    const state = parseOnboardingState({
      path: "cv",
      completedSteps: [
        "cv",
        "confirm_evidence",
        "preferences",
        "notifications",
        "review",
      ],
      completedAt,
    });

    expect(state).not.toBeNull();
    // The property the reader actually depends on: finishing setup must leave
    // them finished, not back at step one.
    expect(isOnboardingComplete(state)).toBe(true);
  });

  // The trailing-Z form every fixture used must keep working too.
  it("still parses the ISO form with a trailing Z", () => {
    const state = parseOnboardingState({
      path: "aspiration",
      completedSteps: ["cv"],
      completedAt: "2026-07-21T12:39:52.150Z",
    });
    expect(state).not.toBeNull();
  });
});

describe("normalised job", () => {
  const job = {
    sourceId: "11111111-1111-4111-8111-111111111111",
    providerJobId: "abc",
    title: "Data Engineer",
    employer: "Fictional UK Employer Ltd",
    countryCode: "GB",
    rawLocation: "Manchester",
    descriptionText: "A UK role.",
    applicationUrl: "https://boards.greenhouse.io/x/1",
    canonicalApplicationUrl: "https://boards.greenhouse.io/x/1",
    employmentType: "unknown",
    workingTime: "unknown",
    workplaceType: "unknown",
    ir35Status: "unknown",
    remoteEligibility: "unknown",
    ukEligibilityEvidence: ["Location: Manchester"],
    compensationRaw: null,
    compensationMinimum: null,
    compensationMaximum: null,
    compensationCurrency: null,
    compensationPeriod: "unknown",
    compensationProvenance: "unknown",
    deduplicationKey: "a".repeat(64),
    contentHash: "b".repeat(64),
  };

  it.each(postgresTimestamps)("accepts a postedAt of %s", (timestamp) => {
    const parsed = normalisedJobSchema.safeParse({
      ...job,
      postedAt: timestamp,
      closesAt: timestamp,
      compensationObservedAt: timestamp,
    });

    // Report the field that failed rather than a bare false, so a future
    // regression names itself.
    expect(
      parsed.success
        ? []
        : parsed.error.issues.map((issue) => issue.path.join(".")),
    ).toEqual([]);
  });
});
