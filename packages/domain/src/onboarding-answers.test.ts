import { describe, expect, it } from "vitest";

import type { CareerEvidenceItem } from "./career-profile.ts";
import {
  buildFirstRunFilters,
  buildSearchProfileFromAnswers,
  hasSearchSignal,
  parseOnboardingAnswers,
  type OnboardingAnswers,
} from "./onboarding-answers.ts";

function evidence(
  overrides: Partial<CareerEvidenceItem> = {},
): CareerEvidenceItem {
  return {
    id: "71000000-0000-4000-8000-000000000001",
    normalizedConcept: "python",
    label: "Python",
    category: "skill",
    origin: "user",
    confidence: 1,
    evidenceReference: null,
    evidenceExcerpt: null,
    proficiencySignal: "demonstrated",
    lastUsedAt: null,
    confirmationState: "confirmed",
    ...overrides,
  };
}

describe("parseOnboardingAnswers", () => {
  it("accepts a partially answered flow", () => {
    expect(parseOnboardingAnswers({ roleFamilies: ["Analytics"] })).toEqual({
      roleFamilies: ["Analytics"],
    });
  });

  it("treats an absent payload as nothing answered yet", () => {
    expect(parseOnboardingAnswers(null)).toEqual({});
    expect(parseOnboardingAnswers(undefined)).toEqual({});
  });

  it("treats a corrupt payload as nothing answered rather than blocking setup", () => {
    expect(parseOnboardingAnswers({ employmentTypes: ["astronaut"] })).toEqual(
      {},
    );
    expect(parseOnboardingAnswers("answers")).toEqual({});
  });

  it("rejects an unknown field rather than storing it", () => {
    expect(parseOnboardingAnswers({ salaryExpectation: 90000 })).toEqual({});
  });
});

describe("buildFirstRunFilters", () => {
  it("applies a single selection as a filter", () => {
    expect(
      buildFirstRunFilters({
        employmentTypes: ["permanent"],
        workplaceTypes: ["remote"],
      }),
    ).toMatchObject({ employment: "permanent", workplace: "remote" });
  });

  it("does not collapse a multi-selection into one filter", () => {
    // The feed's filters hold one value per facet. Picking one of the user's
    // three choices would apply a preference they never expressed.
    expect(
      buildFirstRunFilters({ employmentTypes: ["permanent", "contract"] }),
    ).toMatchObject({ employment: "all" });
  });

  it("leaves an unanswered facet unfiltered", () => {
    expect(buildFirstRunFilters({})).toEqual({
      location: "",
      employment: "all",
      workingTime: "all",
      workplace: "all",
      ir35: "all",
      compensation: "all",
    });
  });

  it("never narrows salary provenance, whatever the user chose", () => {
    // The filter holds one provenance. Turning "exclude unknown pay" into
    // "advertised only" would also hide every estimated salary — which the
    // matching gate keeps — so the two surfaces would disagree about the same
    // preference. The preference still shapes matching through the profile.
    for (const allowUnknownCompensation of [undefined, true, false]) {
      expect(
        buildFirstRunFilters(
          allowUnknownCompensation === undefined
            ? {}
            : { allowUnknownCompensation },
        ).compensation,
      ).toBe("all");
    }
  });
});

describe("buildSearchProfileFromAnswers", () => {
  const base: OnboardingAnswers = {
    roleFamilies: ["Analytics implementation"],
    targetSeniority: "lead",
    employmentTypes: ["permanent"],
    ukLocations: ["Manchester"],
    compensationMinimum: 55_000,
    compensationPeriod: "year",
    allowUnknownCompensation: true,
    notificationsEnabled: true,
  };

  it("builds an enabled search from answers and confirmed evidence", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: base,
      confirmedEvidence: [evidence()],
      name: "My first search",
    });

    expect(draft).toMatchObject({
      name: "My first search",
      enabled: true,
      targetSeniority: "lead",
      employmentTypes: ["permanent"],
      ukLocations: ["Manchester"],
      notificationsEnabled: true,
    });
    expect(draft.skillConcepts).toContain("python");
    expect(draft.roleFamilies[0]).toMatchObject({
      label: "Analytics implementation",
    });
  });

  it("carries responsibilities from evidence separately from skills", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: base,
      confirmedEvidence: [
        evidence(),
        evidence({
          id: "71000000-0000-4000-8000-000000000002",
          normalizedConcept: "analytics implementation",
          category: "responsibility",
        }),
      ],
      name: "n",
    });

    expect(draft.skillConcepts).toEqual(["python"]);
    expect(draft.responsibilityConcepts).toEqual(["analytics implementation"]);
  });

  it("works from stated skills alone when there is no CV evidence", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: { ...base, skillConcepts: ["sql", "communication"] },
      confirmedEvidence: [],
      name: "Graduate search",
    });

    expect(draft.skillConcepts).toEqual(["sql", "communication"]);
    expect(draft.responsibilityConcepts).toEqual([]);
  });

  it("deduplicates a stated skill that evidence also supplies", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: { ...base, skillConcepts: ["python"] },
      confirmedEvidence: [evidence()],
      name: "n",
    });

    expect(draft.skillConcepts).toEqual(["python"]);
  });

  it("invents nothing for an unanswered field", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: { roleFamilies: ["Analytics"] },
      confirmedEvidence: [],
      name: "n",
    });

    expect(draft.targetSeniority).toBe("unspecified");
    expect(draft.workplaceTypes).toEqual([]);
    expect(draft.compensation).toMatchObject({
      minimum: null,
      maximum: null,
      allowUnknown: true,
    });
  });

  it("defaults notifications to off", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: { roleFamilies: ["Analytics"] },
      confirmedEvidence: [],
      name: "n",
    });

    expect(draft.notificationsEnabled).toBe(false);
  });

  it("produces a draft the search schema accepts", () => {
    // buildSearchProfileFromAnswers parses its own output, so an answer set
    // that cannot be saved fails here rather than at the final step.
    expect(() =>
      buildSearchProfileFromAnswers({
        answers: { roleFamilies: [] },
        confirmedEvidence: [],
        name: "n",
      }),
    ).toThrow();
  });

  it("falls back to a usable name when none was given", () => {
    const draft = buildSearchProfileFromAnswers({
      answers: base,
      confirmedEvidence: [],
      name: "   ",
    });

    expect(draft.name).toBe("My UK search");
  });
});

describe("hasSearchSignal", () => {
  it("is satisfied by a stated role family", () => {
    expect(
      hasSearchSignal({
        answers: { roleFamilies: ["Analytics"] },
        confirmedEvidence: [],
      }),
    ).toBe(true);
  });

  it("is satisfied by confirmed evidence alone", () => {
    expect(
      hasSearchSignal({ answers: {}, confirmedEvidence: [evidence()] }),
    ).toBe(true);
  });

  it("is not satisfied by preferences alone", () => {
    // Preferences narrow a search; they cannot be one on their own.
    expect(
      hasSearchSignal({
        answers: { employmentTypes: ["permanent"], ukLocations: ["Leeds"] },
        confirmedEvidence: [],
      }),
    ).toBe(false);
  });

  it("is not satisfied by evidence that only records education", () => {
    expect(
      hasSearchSignal({
        answers: {},
        confirmedEvidence: [evidence({ category: "education" })],
      }),
    ).toBe(false);
  });
});
