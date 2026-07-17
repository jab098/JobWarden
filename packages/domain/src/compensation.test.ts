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
