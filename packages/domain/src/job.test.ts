import { describe, expect, it } from "vitest";

import { normalisedJobSchema } from "./index";

const validJob = {
  sourceId: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
  providerJobId: "greenhouse-123",
  title: "Platform Engineer",
  employer: "Example Ltd",
  descriptionText: "A UK role.",
  applicationUrl: "https://boards.greenhouse.io/example/jobs/123",
  countryCode: "GB",
  ukEligibilityEvidence: ["Location: England"],
  employmentType: "permanent",
  workingTime: "full_time",
  workplaceType: "hybrid",
  ir35Status: "not_applicable",
  compensationRaw: "£60,000 per year",
  compensationMinimum: 6_000_000,
  compensationMaximum: null,
  compensationCurrency: "GBP",
  compensationPeriod: "year",
  postedAt: "2026-07-17T09:30:00.000Z",
  closesAt: null,
  contentHash: "a".repeat(64),
} as const;

describe("normalised job schema", () => {
  it("accepts the exact normalised UK job contract", () => {
    expect(normalisedJobSchema.safeParse(validJob).success).toBe(true);
  });

  it.each([
    ["a non-HTTPS application URL", { applicationUrl: "http://example.com" }],
    ["missing UK evidence", { ukEligibilityEvidence: [] }],
    ["a non-GB country code", { countryCode: "US" }],
    ["an invalid content hash", { contentHash: "abc123" }],
  ])("rejects %s", (_name, override) => {
    expect(
      normalisedJobSchema.safeParse({ ...validJob, ...override }).success,
    ).toBe(false);
  });
});
