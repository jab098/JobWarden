import { describe, expect, it } from "vitest";

import {
  classifyEmployment,
  classifyIr35,
  classifyUkEligibility,
} from "./index";

describe("UK eligibility", () => {
  it.each([
    ["London, England", "Office based", "explicit_uk_location"],
    ["Edinburgh, Scotland", "Hybrid", "explicit_uk_location"],
    ["Cardiff, Wales", "Hybrid", "explicit_uk_location"],
    ["Belfast, Northern Ireland", "On site", "explicit_uk_location"],
    ["Manchester, North West", "Hybrid", "explicit_uk_location"],
    ["Leeds, Yorkshire and the Humber", "Office based", "explicit_uk_location"],
    [
      "Remote",
      "You may work remotely anywhere in the UK",
      "explicit_uk_remote",
    ],
    ["Remote", "This is a UK-wide remote role", "explicit_uk_remote"],
  ] as const)(
    "accepts explicit UK employment evidence from %s",
    (location, description, reason) => {
      const result = classifyUkEligibility(location, description);

      expect(result).toMatchObject({ eligible: true, reason });
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence.every((item) => item.trim().length > 0)).toBe(
        true,
      );
    },
  );

  it.each([
    ["Remote", "Remote within Europe", "non_uk"],
    ["Remote", "Remote role", "ambiguous"],
    ["New York, NY", "US applicants only", "non_uk"],
  ] as const)(
    "rejects a listing without UK employment evidence from %s",
    (location, description, reason) => {
      expect(classifyUkEligibility(location, description)).toEqual({
        eligible: false,
        evidence: [],
        reason,
      });
    },
  );

  it.each([
    ["Ukraine", "Office based"],
    ["Remote", "UK time preferred"],
    ["Remote", "Europe or UK time zones"],
    ["New England", "Office based"],
  ])(
    "does not mistake %s for UK employment-location permission",
    (location, description) => {
      expect(classifyUkEligibility(location, description).eligible).toBe(false);
    },
  );
});

describe("employment classification", () => {
  it.each([
    ["Permanent employee", "permanent"],
    ["12 month fixed-term contract", "fixed_term"],
    ["Independent contractor", "contract"],
    ["Temporary assignment", "temporary"],
    ["Apprenticeship opportunity", "apprenticeship"],
    ["Summer internship", "internship"],
    ["Casual worker", "casual"],
    ["Zero hours worker", "zero_hours"],
    ["Interesting opportunity", "unknown"],
  ] as const)("maps %s to %s", (description, expected) => {
    expect(classifyEmployment(description)).toBe(expected);
  });
});

describe("IR35 classification", () => {
  it.each([
    ["This engagement is outside IR35", "outside"],
    ["This role is inside IR35", "inside"],
    ["Contract role with immediate start", "unknown"],
    ["IR35 status to be determined", "unknown"],
    ["IR35 not applicable", "unknown"],
  ] as const)("maps %s to %s", (description, expected) => {
    expect(classifyIr35(description)).toBe(expected);
  });
});
