import { describe, expect, it } from "vitest";

import { parseCompensation } from "./index";

describe("compensation parsing", () => {
  it("parses an explicit pound-denominated day-rate range into minor units", () => {
    expect(parseCompensation("£450-£550 per day")).toEqual({
      currency: "GBP",
      minimum: 45000,
      maximum: 55000,
      period: "day",
    });
  });

  it.each([
    [
      "£50k per year",
      {
        currency: "GBP",
        minimum: 5_000_000,
        maximum: null,
        period: "year",
      },
    ],
    [
      "£450-550 per day",
      {
        currency: "GBP",
        minimum: 45_000,
        maximum: 55_000,
        period: "day",
      },
    ],
    [
      "450-550 GBP per day",
      {
        currency: "GBP",
        minimum: 45_000,
        maximum: 55_000,
        period: "day",
      },
    ],
    [
      "£50-60k per year",
      {
        currency: "GBP",
        minimum: 5_000_000,
        maximum: 6_000_000,
        period: "year",
      },
    ],
    [
      "450 GBP - 550 GBP per day",
      {
        currency: "GBP",
        minimum: 45_000,
        maximum: 55_000,
        period: "day",
      },
    ],
  ] as const)("parses the deliberate GBP format %s", (raw, expected) => {
    expect(parseCompensation(raw)).toEqual(expected);
  });

  it("rejects an amount with more than two decimal places without prefix truncation", () => {
    expect(parseCompensation("£12.345 per hour")).toEqual({
      currency: "GBP",
      minimum: null,
      maximum: null,
      period: "hour",
    });
  });

  it("rejects an entire range when either amount has unsupported numeric syntax", () => {
    expect(parseCompensation("£12.345-£20 per hour")).toEqual({
      currency: "GBP",
      minimum: null,
      maximum: null,
      period: "hour",
    });
  });

  it.each([
    ["50,000 per year", "year"],
    ["$100 per hour", "hour"],
    ["Competitive compensation", "unknown"],
  ] as const)("does not infer GBP from %s", (raw, period) => {
    expect(parseCompensation(raw)).toEqual({
      currency: null,
      minimum: null,
      maximum: null,
      period,
    });
  });
});
