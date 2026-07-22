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

  // Named foreign qualifiers are answered honestly rather than quarantined.
  it.each([
    ["London, Ontario"],
    ["Birmingham, Alabama"],
    ["Manchester, New Hampshire"],
    ["Newport, Rhode Island"],
    ["York, Pennsylvania"],
    ["Perth, Western Australia"],
    ["Hamilton, Ontario, Canada"],
  ])("refuses a foreign location that shares a UK name: %s", (location) => {
    expect(classifyUkEligibility(location, "Office based")).toEqual({
      eligible: false,
      evidence: [],
      reason: "non_uk",
    });
  });

  // These are the forms that defeat a denylist: an abbreviation, a full stop, a
  // state nobody listed, a country nobody listed. None may publish. Which of
  // `non_uk` and `ambiguous` they land on is not the point and is not asserted —
  // that they never reach a UK jobseeker is.
  it.each([
    ["Boston, MA"],
    ["London, KY"],
    ["London, Ont."],
    ["Manchester, N.H."],
    ["Richmond, Va."],
    ["Bath, U.S.A."],
    ["Bangor, ME"],
    ["Newport, OR"],
    ["Brighton, Victoria"],
    ["Hamilton, Bermuda"],
    ["Christchurch, Canterbury"],
    ["Newport, County Mayo"],
    ["New York City"],
    ["Cambridge, Mass."],
    ["Halifax, N.S."],
  ])("never publishes an unrecognised foreign qualifier: %s", (location) => {
    expect(classifyUkEligibility(location, "Office based").eligible).toBe(
      false,
    );
  });

  // A UK nation outranks a homonym. Washington in Tyne and Wear is a real town
  // of 67,000 people, and excluding it is unrecoverable where quarantine is not.
  // The third case is what pins the nation-anchor branch itself: a location
  // naming both a UK nation and a foreign country is quarantined for a person
  // rather than hard-excluded on the foreign half alone.
  it.each([
    ["Washington, England"],
    ["Washington, Tyne and Wear"],
    ["London, England, USA"],
  ])("does not spend a hard exclusion on a UK homonym: %s", (location) => {
    expect(classifyUkEligibility(location, "Office based")).toMatchObject({
      reason: "ambiguous",
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
  // in the shapes UK adverts are actually written in, must publish.
  //
  // Note the dataset's own `county` is the unitary authority, so this pair is
  // close to a tautology on the UK side; `ceremonialCounty` below is the honest
  // half, and the inverse sweep is what guards the direction that matters.
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

  // Real adverts use the ceremonial county, which is not what the dataset
  // stores, so these cannot pass by construction the way the sweep above can.
  it.each([
    ["Leeds, West Yorkshire"],
    ["Sheffield, South Yorkshire"],
    ["Salford, Greater Manchester"],
    ["Liverpool, Merseyside"],
    ["Sunderland, Tyne and Wear"],
    ["Chester, Cheshire"],
    ["Carlisle, Cumbria"],
    ["Reading, Berkshire"],
    ["Bangor, Gwynedd"],
    ["Newport, Isle of Wight"],
    ["Paisley, Renfrewshire"],
    ["Ayr, Ayrshire"],
    ["Armagh, County Armagh"],
  ])("publishes a UK advert written with its ceremonial county: %s", (l) => {
    expect(classifyUkEligibility(l, "Office based")).toMatchObject({
      eligible: true,
    });
  });

  // The inverse sweep, and the one that fails if the barrier is ever weakened
  // back to a denylist: every bundled UK place name, beside a qualifier that is
  // not British, must never publish — whether or not anyone listed it.
  //
  // Canterbury is deliberately not among these, and the reason is worth stating
  // exactly, because a location whose every label is a real UK place name cannot
  // be told from a UK one by name alone. `Lincoln, Canterbury` and
  // `Oxford, Canterbury` — both real New Zealand towns — DO publish, because
  // Canterbury is also a city in Kent. So does `Newport, Manchester`, a parish
  // in Jamaica. Adding a country closes it (`Lincoln, Canterbury, New Zealand`
  // is non_uk); the exposure is a two-label advert naming no country.
  //
  // The fix would be to require qualifier positions to be administrative areas
  // rather than any UK place name, which costs `London, Canary Wharf` and
  // `Manchester, Salford Quays`. Documented rather than asserted away.
  it("never publishes a bundled UK place beside a foreign qualifier", () => {
    const foreignQualifiers = [
      "Ontario",
      "Ont.",
      "Alabama",
      "N.H.",
      "ME",
      "OR",
      "Victoria",
      "Bermuda",
      "Otago",
      "Waikato",
      "County Mayo",
      "Gauteng",
      "Punjab",
    ];
    const published = datasetPlaces.flatMap((place) =>
      foreignQualifiers
        .map((qualifier) => `${place.name}, ${qualifier}`)
        .filter(
          (location) =>
            classifyUkEligibility(location, "Office based").eligible,
        ),
    );

    expect(published).toEqual([]);
  });
});

describe("UK eligibility location shapes", () => {
  const neutral = "We are hiring a software engineer for this team.";
  const publishes = (location: string) =>
    classifyUkEligibility(location, neutral).eligible;

  // A full UK postcode is unambiguous evidence of a UK location.
  it.each(["EC2A 4NE", "SW1A 1AA", "M1 2AB", "ec2a 4ne", "B33 8TH"])(
    "publishes the full UK postcode %s",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  it("carries the postcode into the eligibility evidence", () => {
    const result = classifyUkEligibility("EC2A 4NE", neutral);
    expect(result.evidence.join(" ")).toContain("EC2A 4NE");
  });

  it("publishes a town beside its postcode", () => {
    expect(publishes("London, EC2A 4NE")).toBe(true);
  });

  // The real drop shape from /admin/ingestion (2026-07-22). Feeds write a full
  // "Town, Region, Postcode", and the town is often not in the gazetteer, so
  // the barrier quarantined every one on the strength of the town alone even
  // though the postcode beside it is decisive UK evidence. The towns here are
  // deliberately ones the dataset does not carry, so the postcode is doing the
  // work — unlike "London, EC2A 4NE" above, where London is recognised anyway.
  it.each([
    "Blandford Forum, South West, DT11 8EL",
    "Burton-on-Trent, West Midlands, DE14 3TE",
    "Chatham, South East, ME4 5JB",
    "Chorleywood, WD3 6EW",
  ])(
    "publishes an unrecognised town beside its UK postcode: %s",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  it("carries the whole postcode location into the eligibility evidence", () => {
    const result = classifyUkEligibility(
      "Blandford Forum, South West, DT11 8EL",
      neutral,
    );
    expect(result.evidence.join(" ")).toContain("DT11 8EL");
  });

  // A postcode locates the role; it does not overrule an advert that excludes
  // the UK in words. The description check runs before the location-eligible
  // branch, and must still win now that more locations reach that branch.
  it("still refuses a postcode location when the description excludes the UK", () => {
    const result = classifyUkEligibility(
      "Blandford Forum, South West, DT11 8EL",
      "This role is not available in the UK.",
    );
    expect(result).toMatchObject({ eligible: false, reason: "non_uk" });
  });

  // The postcode rule must not become a foreign back door: a real UK postcode
  // is the only thing that publishes an unrecognised sibling, and these carry
  // none, so they stay quarantined or refused exactly as before.
  it.each([
    "St Helier, JE2 3QA",
    "London, Ontario",
    "Springfield, IL 62701",
    "San Francisco, CA 94103",
  ])(
    "does not publish a non-UK string without a UK postcode: %s",
    (location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // A bare outward code is not evidence: M1 is also a motorway.
  it.each(["EC2A", "M1", "SW1A"])(
    "leaves the bare outward code %s ambiguous",
    (location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // The collision guard. A UK inward code is always digit-letter-letter, so a
  // Canadian code (digit-letter-digit) cannot match. This is the assertion that
  // stops the postcode rule publishing foreign roles.
  it.each([
    ["Canada", "K1A 0B1"],
    ["Canada", "M5V 3L9"],
    ["Netherlands", "1234 AB"],
    ["Sweden", "114 51"],
    ["United States", "10001"],
    ["United States", "NY 10001"],
    ["United States", "CA 90210"],
    ["United States", "Springfield, IL 62701"],
  ])("does not publish the %s postal code %s", (_country, location) => {
    expect(publishes(location)).toBe(false);
  });

  // GB is the ISO 3166-1 code Greenhouse and Lever emit.
  it.each(["London, GB", "Manchester, GB", "GB"])(
    "publishes %s, because GB names the United Kingdom",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  // Accepting GB as a nation anchor makes `namesUkNation` true, which
  // short-circuits the foreign-region check. The allowlist still has to refuse
  // this, and that is what makes the change safe.
  it("still refuses a foreign city carrying a GB qualifier", () => {
    expect(publishes("Paris, GB")).toBe(false);
  });

  it.each(["UK Wide", "uk-wide", "Anywhere in the UK", "Across the UK"])(
    "publishes the nation-wide phrasing %s",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  // Nationwide is also the name of a UK employer. Treating it as location
  // evidence would publish on an employer string, so it stays ambiguous.
  it("leaves Nationwide ambiguous, because it is also an employer name", () => {
    expect(publishes("Nationwide")).toBe(false);
  });

  it("publishes a multi-location advert once every part is recognised", () => {
    expect(publishes("London / Manchester")).toBe(true);
  });

  it("refuses a multi-location advert when one part is unrecognised", () => {
    expect(publishes("London / Springfield")).toBe(false);
  });

  // The dataset carries this region as one string with a slash in it. Splitting
  // locations on "/" would otherwise turn it into an unrecognised second label.
  it("publishes a bilingual Northern Ireland region string", () => {
    expect(publishes("Belfast, Northern Ireland / Tuaisceart Éireann")).toBe(
      true,
    );
  });

  // Crown dependencies and British Overseas Territories use UK-format
  // postcodes. Task 37 pinned them as ineligible by name but missed them by
  // postcode, which published them — a right-to-work boundary breached by the
  // very rule that was meant to respect it. Both spellings are pinned now.
  it.each([
    ["Jersey", "JE2 3AB"],
    ["Guernsey", "GY1 1AA"],
    ["Isle of Man", "IM1 1AA"],
    ["Gibraltar", "GX11 1AA"],
    ["Jersey with a town", "St Helier, JE2 3AB"],
  ])(
    "does not publish the %s postcode %s, which is outside the UK",
    (_territory, location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // The same boundary in the other notation. A UK postcode is written with or
  // without its space, and the exclusion above was pinned only in the spaced
  // form — which is the exact shape of the defect it was written to fix, one
  // notation further on. The unspaced form is refused too, and now says so.
  it.each(["JE23AB", "GY11AA", "IM11AA", "GX111AA", "je23ab"])(
    "does not publish the unspaced non-UK postcode %s",
    (location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // And the unspaced exclusion must not have cost real UK postcodes either.
  it.each(["EC2A4NE", "M12AB", "G11AA", "IG11AA"])(
    "still publishes the unspaced UK postcode %s",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  // Ireland is the neighbour most likely to appear in a feed JobWarden reads,
  // and its Eircodes are close enough in shape to be worth pinning.
  it.each(["D02 AF30", "A65 F4E2", "T12 X289", "Dublin, D02 AF30"])(
    "does not publish the Irish Eircode %s",
    (location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // The exclusion must not have cost real UK postcodes that merely start with
  // a nearby letter.
  it.each(["G1 1AA", "IG1 1AA", "GU1 1AA", "IP1 1AA", "S1 2AB"])(
    "still publishes the UK postcode %s",
    (location) => {
      expect(publishes(location)).toBe(true);
    },
  );

  // Crown dependencies are outside the UK for right-to-work purposes. These
  // quarantining is correct and must not be "fixed" into eligibility.
  it.each([
    "Isle of Man",
    "Jersey",
    "Guernsey",
    "Gibraltar",
    "Douglas, Isle of Man",
  ])(
    "does not publish the Crown dependency or overseas territory %s",
    (location) => {
      expect(publishes(location)).toBe(false);
    },
  );

  // The shapes above must not have cost the plain-name behaviour that already
  // worked. These are a sample of the 73-name sweep the task was specified from.
  it.each([
    "Slough",
    "Milton Keynes",
    "Kingston upon Hull",
    "Newcastle upon Tyne",
    "Weston-super-Mare",
    "Leeds, West Yorkshire",
    "London, England, United Kingdom",
    "Remote, UK",
    "Croydon",
  ])("still publishes the plain location %s", (location) => {
    expect(publishes(location)).toBe(true);
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
