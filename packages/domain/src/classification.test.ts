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
    ["Remote", "UK applicants only", "explicit_uk_remote"],
    ["Remote", "Remote — UK residents only", "explicit_uk_remote"],
    [
      "Remote",
      "Remote anywhere in the UK; our headquarters are in the USA",
      "explicit_uk_remote",
    ],
    [
      "Remote",
      "UK applicants only; collaborate with our New York office",
      "explicit_uk_remote",
    ],
    ["London", "Office based", "explicit_uk_location"],
    ["London (England)", "Office based", "explicit_uk_location"],
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
    ["London, Ontario", "Office based", "non_uk"],
    ["North West, USA", "Office based", "non_uk"],
    ["London, Kentucky", "Office based", "non_uk"],
    ["South East, Australia", "Office based", "non_uk"],
    ["London (Kentucky)", "Office based", "non_uk"],
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
    [
      "This role is not remote within the UK",
      "Description: not remote within the UK",
    ],
    [
      "Applicants cannot be based in the UK",
      "Description: Applicants cannot be based in the UK",
    ],
    [
      "Candidates are not based in the UK",
      "Description: Candidates are not based in the UK",
    ],
    [
      "You cannot work remotely within the UK",
      "Description: You cannot work remotely within the UK",
    ],
    ["This role is not based in the UK", "Description: not based in the UK"],
    ["No UK applicants", "Description: No UK applicants"],
  ])(
    "keeps explicit UK exclusion ineligible with evidence: %s",
    (description, evidence) => {
      expect(classifyUkEligibility("Remote", description)).toEqual({
        eligible: false,
        evidence: [evidence],
        reason: "non_uk",
      });
    },
  );

  it("lets explicit UK exclusion outrank a positive clause", () => {
    expect(
      classifyUkEligibility(
        "Remote",
        "UK applicants only; UK candidates are not eligible",
      ),
    ).toEqual({
      eligible: false,
      evidence: ["Description: UK candidates are not eligible"],
      reason: "non_uk",
    });
  });

  it.each([
    [
      "UK applicants only; We do not accept UK applicants",
      "Description: We do not accept UK applicants",
    ],
    [
      "UK applicants only; UK applicants are excluded",
      "Description: UK applicants are excluded",
    ],
  ])(
    "lets an independently expressed UK exclusion outrank positive wording: %s",
    (description, evidence) => {
      expect(classifyUkEligibility("Remote", description)).toEqual({
        eligible: false,
        evidence: [evidence],
        reason: "non_uk",
      });
    },
  );

  it.each([
    ["Candidates must work UK time zones"],
    ["Our headquarters are based in the UK"],
    ["Our employees are based in the UK"],
    ["Our workers are based in the UK"],
    ["Remote within commuting distance"],
    ["We spoke with UK applicants yesterday"],
  ])("keeps non-permission wording ambiguous: %s", (description) => {
    expect(classifyUkEligibility("Remote", description)).toEqual({
      eligible: false,
      evidence: [],
      reason: "ambiguous",
    });
  });

  it.each([
    ["This role is based in the UK and is not remote"],
    ["This role is based in the UK and offers no relocation assistance"],
  ])(
    "does not turn unrelated negative wording into UK exclusion: %s",
    (description) => {
      expect(
        classifyUkEligibility("London, England", description),
      ).toMatchObject({
        eligible: true,
        reason: "explicit_uk_location",
      });
    },
  );

  it("does not treat a generic applicant modifier as foreign evidence", () => {
    expect(
      classifyUkEligibility("London, England", "Graduate applicants only"),
    ).toMatchObject({ eligible: true, reason: "explicit_uk_location" });
  });

  it("lets a concrete foreign location outrank remote UK permission", () => {
    expect(
      classifyUkEligibility(
        "London, Kentucky",
        "You may work remotely anywhere in the UK",
      ),
    ).toEqual({ eligible: false, evidence: [], reason: "non_uk" });
  });

  it("bounds clause evidence for the normalised job schema", () => {
    const result = classifyUkEligibility(
      "Remote",
      `You may work remotely anywhere in the UK ${"supporting detail ".repeat(40)}`,
    );

    expect(result.eligible).toBe(true);
    expect(result.evidence[0].length).toBeLessThanOrEqual(500);
  });

  it("bounds qualified location evidence for the normalised job schema", () => {
    const location = ["London", ...Array(80).fill("England")].join(", ");
    const result = classifyUkEligibility(location, "Office based");

    expect(result.eligible).toBe(true);
    expect(result.evidence[0].length).toBeLessThanOrEqual(500);
  });

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
