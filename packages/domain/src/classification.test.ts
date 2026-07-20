import { describe, expect, it } from "vitest";

import {
  classifyEmployment,
  classifyIr35,
  classifyUkEligibility,
} from "./index";
import dataset from "./uk-places.generated.json" with { type: "json" };

type DatasetPlace = { name: string; county: string | null; nation: string };

const datasetPlaces: readonly DatasetPlace[] = dataset.places;

/** Joins the parts an advert would actually carry, dropping any the dataset lacks. */
const locationOf = (...parts: (string | null)[]) =>
  parts.filter((part): part is string => Boolean(part)).join(", ");

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
    [
      "Remote",
      "This remote role is open to candidates in the UK",
      "explicit_uk_remote",
    ],
    ["Remote", "Open to UK applicants", "explicit_uk_remote"],
    ["Remote", "UK workers only", "explicit_uk_remote"],
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
    [
      "UK applicants only; Applications from UK candidates will not be accepted",
      "Description: Applications from UK candidates will not be accepted",
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

  // The allowlist this replaced held 27 cities and 9 regions, so a county label
  // it did not know counted as evidence against the UK and the advert was
  // dropped. "Salford, England" says England outright and was still excluded.
  it.each([
    ["Salford, England"],
    ["Leeds, West Yorkshire"],
    ["Salford, Greater Manchester, England"],
    ["Aberystwyth, Sir Ceredigion - Ceredigion, Wales"],
    ["Abingdon-on-Thames, Oxfordshire"],
    ["Stoke-on-Trent, Staffordshire"],
    ["Bangor, County Down, Northern Ireland"],
    ["Leeds, West Yorkshire (hybrid)"],
  ])("publishes a genuine UK advert written as %s", (location) => {
    expect(classifyUkEligibility(location, "Office based")).toMatchObject({
      eligible: true,
      reason: "explicit_uk_location",
    });
  });

  // Widening UK recognition without a positive foreign signal would publish
  // these: the UK word in each is the homonym, not the location.
  it.each([
    ["London, Ontario"],
    ["Birmingham, Alabama"],
    ["Manchester, New Hampshire"],
    ["Boston, MA"],
    ["London, KY"],
    ["Newport, Rhode Island"],
    ["York, Pennsylvania"],
    ["Perth, Western Australia"],
    ["New York City"],
    ["Hamilton, Ontario, Canada"],
  ])("refuses a foreign location that shares a UK name: %s", (location) => {
    expect(classifyUkEligibility(location, "Office based")).toEqual({
      eligible: false,
      evidence: [],
      reason: "non_uk",
    });
  });

  // An unrecognised place is unknown, not foreign. Excluding on absence of
  // recognition is what discarded the stock; quarantine keeps it reviewable.
  // The first two are real UK towns the 230-place gazetteer does not carry,
  // which is exactly the case this fallback exists for.
  it.each([
    ["Ashby-de-la-Zouch, Leicestershire"],
    ["Hebden Bridge, West Yorkshire"],
    ["Somewhere, Nowhere"],
  ])(
    "quarantines rather than excludes an unrecognised location: %s",
    (location) => {
      expect(classifyUkEligibility(location, "Office based")).toEqual({
        eligible: false,
        evidence: [],
        reason: "ambiguous",
      });
    },
  );

  // The sweep that would have caught the original defect. Every bundled place,
  // in the four shapes UK adverts are actually written in, must publish.
  it.each([
    ["Town", (place: DatasetPlace) => place.name],
    [
      "Town, Nation",
      (place: DatasetPlace) => locationOf(place.name, place.nation),
    ],
    [
      "Town, County",
      (place: DatasetPlace) => locationOf(place.name, place.county),
    ],
    [
      "Town, County, Nation",
      (place: DatasetPlace) =>
        locationOf(place.name, place.county, place.nation),
    ],
  ] as const)("publishes every bundled place written as %s", (_, format) => {
    const refused = datasetPlaces
      .filter(
        (place) =>
          !classifyUkEligibility(format(place), "Office based").eligible,
      )
      .map(format);

    expect(refused).toEqual([]);
  });
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
