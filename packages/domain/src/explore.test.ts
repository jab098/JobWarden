import { describe, expect, it } from "vitest";

import type { CareerEvidenceItem } from "./career-profile.ts";
import {
  careerPathways,
  evaluateExplorePathways,
  type CareerPathway,
} from "./explore.ts";

function evidenceItem(
  overrides: Partial<CareerEvidenceItem> = {},
): CareerEvidenceItem {
  return {
    id: "71000000-0000-4000-8000-000000000001",
    normalizedConcept: "event instrumentation",
    label: "Event instrumentation",
    category: "skill",
    origin: "cv",
    confidence: 0.9,
    evidenceReference: "72000000-0000-4000-8000-000000000001:paragraph:1",
    evidenceExcerpt: "Instrumented product events.",
    proficiencySignal: "advanced",
    lastUsedAt: "2026-06-01",
    confirmationState: "confirmed",
    ...overrides,
  };
}

function confirmedSkill(
  normalizedConcept: string,
  label: string,
  overrides: Partial<CareerEvidenceItem> = {},
): CareerEvidenceItem {
  return evidenceItem({
    id: `71000000-0000-4000-8000-${normalizedConcept
      .replace(/[^a-z0-9]/g, "")
      .padEnd(12, "0")
      .slice(0, 12)}`,
    normalizedConcept,
    label,
    ...overrides,
  });
}

const testPathway: CareerPathway = {
  normalizedConcept: "test pathway",
  label: "Test pathway",
  summary: "A pathway used only in tests.",
  coreSkills: [
    {
      normalizedConcept: "alpha",
      label: "Alpha",
      weight: 3,
      significant: true,
    },
    { normalizedConcept: "beta", label: "Beta", weight: 3, significant: true },
    {
      normalizedConcept: "gamma",
      label: "Gamma",
      weight: 2,
      significant: false,
    },
    {
      normalizedConcept: "delta",
      label: "Delta",
      weight: 2,
      significant: false,
    },
    {
      normalizedConcept: "epsilon",
      label: "Epsilon",
      weight: 2,
      significant: false,
    },
  ],
};

describe("evaluateExplorePathways", () => {
  it("qualifies a pathway at exactly the 70% weighted threshold", () => {
    // matched weight 3+3+2 = 8 of 12? total = 3+3+2+2+2 = 12; 8/12 = 66%.
    // Use alpha+beta+gamma+delta = 10/12 = 83%, and alpha+beta+gamma = 8/12
    // fails. Exact 70% needs a bespoke pathway: weights 7 of 10.
    const exact: CareerPathway = {
      ...testPathway,
      coreSkills: [
        {
          normalizedConcept: "alpha",
          label: "Alpha",
          weight: 3,
          significant: true,
        },
        {
          normalizedConcept: "beta",
          label: "Beta",
          weight: 2,
          significant: true,
        },
        {
          normalizedConcept: "gamma",
          label: "Gamma",
          weight: 2,
          significant: false,
        },
        {
          normalizedConcept: "delta",
          label: "Delta",
          weight: 3,
          significant: false,
        },
      ],
    };
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha"),
        confirmedSkill("beta", "Beta"),
        confirmedSkill("gamma", "Gamma"),
      ],
      [],
      [exact],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.overlapPercent).toBe(70);
  });

  it("omits a pathway below the threshold even when labels overlap as keywords", () => {
    const suggestions = evaluateExplorePathways(
      [
        // Label matches "Alpha" but the normalised concept differs, so no credit.
        confirmedSkill("alpha tooling", "Alpha"),
        confirmedSkill("beta", "Beta"),
      ],
      [],
      [testPathway],
    );
    expect(suggestions).toHaveLength(0);
  });

  it("omits a pathway with more than two significant gaps", () => {
    const gappy: CareerPathway = {
      ...testPathway,
      coreSkills: [
        {
          normalizedConcept: "alpha",
          label: "Alpha",
          weight: 3,
          significant: false,
        },
        {
          normalizedConcept: "beta",
          label: "Beta",
          weight: 3,
          significant: false,
        },
        {
          normalizedConcept: "gamma",
          label: "Gamma",
          weight: 3,
          significant: false,
        },
        {
          normalizedConcept: "delta",
          label: "Delta",
          weight: 1,
          significant: true,
        },
        {
          normalizedConcept: "epsilon",
          label: "Epsilon",
          weight: 1,
          significant: true,
        },
        {
          normalizedConcept: "zeta",
          label: "Zeta",
          weight: 1,
          significant: true,
        },
      ],
    };
    // matched 9 of 12 = 75%, but three significant gaps remain.
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha"),
        confirmedSkill("beta", "Beta"),
        confirmedSkill("gamma", "Gamma"),
      ],
      [],
      [gappy],
    );
    expect(suggestions).toHaveLength(0);
  });

  it("omits pathways already inside the user's active target role families", () => {
    const evidence = [
      confirmedSkill("alpha", "Alpha"),
      confirmedSkill("beta", "Beta"),
      confirmedSkill("gamma", "Gamma"),
      confirmedSkill("delta", "Delta"),
      confirmedSkill("epsilon", "Epsilon"),
    ];
    expect(
      evaluateExplorePathways(evidence, ["Test Pathway  "], [testPathway]),
    ).toHaveLength(0);
    expect(
      evaluateExplorePathways(evidence, ["other family"], [testPathway]),
    ).toHaveLength(1);
  });

  it("ignores unconfirmed evidence and non-skill categories", () => {
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha", { confirmationState: "proposed" }),
        confirmedSkill("beta", "Beta", { confirmationState: "rejected" }),
        confirmedSkill("gamma", "Gamma", { category: "industry" }),
        confirmedSkill("delta", "Delta", { category: "education" }),
        confirmedSkill("epsilon", "Epsilon"),
      ],
      [],
      [testPathway],
    );
    expect(suggestions).toHaveLength(0);
  });

  it("credits confirmed skill, tool, and responsibility evidence", () => {
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha", { category: "skill" }),
        confirmedSkill("beta", "Beta", { category: "tool" }),
        confirmedSkill("gamma", "Gamma", { category: "responsibility" }),
        confirmedSkill("delta", "Delta"),
      ],
      [],
      [testPathway],
    );
    expect(suggestions).toHaveLength(1);
    // 3+3+2+2 = 10 of 12 -> 83%.
    expect(suggestions[0]?.overlapPercent).toBe(83);
  });

  it("surfaces matched evidence labels, significant flags, and gaps", () => {
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha (CV)"),
        confirmedSkill("beta", "Beta", { category: "tool" }),
        confirmedSkill("gamma", "Gamma"),
        confirmedSkill("delta", "Delta"),
      ],
      [],
      [testPathway],
    );
    const suggestion = suggestions[0];
    expect(suggestion?.matchedSkills).toEqual([
      {
        normalizedConcept: "alpha",
        label: "Alpha",
        significant: true,
        evidenceLabels: ["Alpha (CV)"],
        evidenceCategories: ["skill"],
      },
      {
        normalizedConcept: "beta",
        label: "Beta",
        significant: true,
        evidenceLabels: ["Beta"],
        evidenceCategories: ["tool"],
      },
      {
        normalizedConcept: "gamma",
        label: "Gamma",
        significant: false,
        evidenceLabels: ["Gamma"],
        evidenceCategories: ["skill"],
      },
      {
        normalizedConcept: "delta",
        label: "Delta",
        significant: false,
        evidenceLabels: ["Delta"],
        evidenceCategories: ["skill"],
      },
    ]);
    expect(suggestion?.gaps).toEqual([
      { label: "Epsilon", significant: false },
    ]);
  });

  it("deduplicates evidence labels for a matched skill", () => {
    const suggestions = evaluateExplorePathways(
      [
        confirmedSkill("alpha", "Alpha"),
        confirmedSkill("alpha", "Alpha", {
          id: "71000000-0000-4000-8000-00000000aaaa",
          category: "tool",
        }),
        confirmedSkill("beta", "Beta"),
        confirmedSkill("gamma", "Gamma"),
        confirmedSkill("delta", "Delta"),
      ],
      [],
      [testPathway],
    );
    expect(suggestions[0]?.matchedSkills[0]?.evidenceLabels).toEqual(["Alpha"]);
  });

  it("orders suggestions by overlap descending then label ascending", () => {
    const strong: CareerPathway = {
      ...testPathway,
      normalizedConcept: "strong pathway",
      label: "Strong pathway",
    };
    const alsoStrong: CareerPathway = {
      ...testPathway,
      normalizedConcept: "another strong pathway",
      label: "Another strong pathway",
    };
    const weaker: CareerPathway = {
      ...testPathway,
      normalizedConcept: "weaker pathway",
      label: "Weaker pathway",
      coreSkills: [
        ...testPathway.coreSkills.slice(0, 4),
        {
          normalizedConcept: "missing",
          label: "Missing",
          weight: 2,
          significant: false,
        },
      ],
    };
    const evidence = [
      confirmedSkill("alpha", "Alpha"),
      confirmedSkill("beta", "Beta"),
      confirmedSkill("gamma", "Gamma"),
      confirmedSkill("delta", "Delta"),
      confirmedSkill("epsilon", "Epsilon"),
    ];
    const suggestions = evaluateExplorePathways(
      evidence,
      [],
      [weaker, strong, alsoStrong],
    );
    expect(suggestions.map((entry) => entry.pathway.label)).toEqual([
      "Another strong pathway",
      "Strong pathway",
      "Weaker pathway",
    ]);
  });

  it("returns nothing without confirmed evidence", () => {
    expect(evaluateExplorePathways([], [], [testPathway])).toHaveLength(0);
    expect(evaluateExplorePathways([], [])).toHaveLength(0);
  });
});

describe("careerPathways taxonomy", () => {
  const conceptPattern = /^[a-z0-9][a-z0-9 .+#/&()'-]*$/;

  it("holds a bounded curated taxonomy", () => {
    expect(careerPathways.length).toBeGreaterThanOrEqual(6);
    expect(careerPathways.length).toBeLessThanOrEqual(20);
  });

  it("uses unique, well-formed pathway concepts", () => {
    const concepts = careerPathways.map((p) => p.normalizedConcept);
    expect(new Set(concepts).size).toBe(concepts.length);
    for (const pathway of careerPathways) {
      expect(pathway.normalizedConcept).toMatch(conceptPattern);
      expect(pathway.normalizedConcept.length).toBeLessThanOrEqual(120);
      expect(pathway.label.trim().length).toBeGreaterThan(0);
      expect(pathway.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every pathway 5-12 unique weighted core skills with at least one significant skill", () => {
    for (const pathway of careerPathways) {
      expect(pathway.coreSkills.length).toBeGreaterThanOrEqual(5);
      expect(pathway.coreSkills.length).toBeLessThanOrEqual(12);
      const concepts = pathway.coreSkills.map((s) => s.normalizedConcept);
      expect(new Set(concepts).size).toBe(concepts.length);
      expect(pathway.coreSkills.some((s) => s.significant)).toBe(true);
      for (const skill of pathway.coreSkills) {
        expect(skill.normalizedConcept).toMatch(conceptPattern);
        expect([1, 2, 3]).toContain(skill.weight);
      }
    }
  });

  it("never qualifies any pathway from incidental generic technical evidence alone", () => {
    const genericEvidence = [
      confirmedSkill("javascript", "JavaScript"),
      confirmedSkill("sql", "SQL"),
    ];
    expect(evaluateExplorePathways(genericEvidence, [])).toHaveLength(0);
  });
});

/**
 * The concepts a real CV actually produced on a live project, not invented for
 * this test. They are mostly product names, because that is what CVs say and
 * what deterministic extraction emits.
 *
 * Recorded here because the numbers matter more than the assertions: against
 * the shipped catalogue this evidence reaches 57% at best, under the 70%
 * threshold, so the reader is shown nothing. Aliasing lifted that from 36%, and
 * the rest of the gap is evidence breadth, not vocabulary — the unmatched
 * skills are generic capabilities extraction never proposed. Pathways will stay
 * empty for real readers until extraction proposes capabilities as well as
 * products.
 */
const realExtractedConcepts: readonly (readonly [
  string,
  string,
  CareerEvidenceItem["category"],
])[] = [
  ["google analytics", "Google Analytics", "tool"],
  ["tag management", "Tag management", "skill"],
  ["consent management", "Consent management", "skill"],
  ["tealium", "Tealium", "tool"],
  ["sql", "SQL", "tool"],
  ["martech", "Marketing technology", "domain"],
  ["power bi", "Power BI", "tool"],
  ["analytics implementation", "Analytics implementation", "responsibility"],
  ["looker", "Looker", "tool"],
];

describe("named products credited to the capability they are", () => {
  const realEvidence = realExtractedConcepts.map(([concept, label, category]) =>
    confirmedSkill(concept, label, { category }),
  );

  /** A pathway built only from skills this evidence reaches through aliases. */
  const aliasOnlyPathway: CareerPathway = {
    normalizedConcept: "alias only pathway",
    label: "Alias-only pathway",
    summary: "Exists to prove the alias mechanism, not to be suggested.",
    coreSkills: [
      {
        normalizedConcept: "consent and privacy",
        label: "Consent and privacy",
        weight: 3,
        significant: true,
      },
      {
        normalizedConcept: "tag management",
        label: "Tag management",
        weight: 3,
        significant: true,
      },
      {
        normalizedConcept: "bi dashboard delivery",
        label: "BI dashboard delivery",
        weight: 2,
        significant: false,
      },
    ],
  };

  it("credits an aliased skill using the reader's own evidence, never an invented one", () => {
    const [suggestion] = evaluateExplorePathways(
      realEvidence,
      [],
      [aliasOnlyPathway],
    );
    expect(suggestion).toBeDefined();

    const tagManagement = suggestion!.matchedSkills.find(
      (skill) => skill.normalizedConcept === "tag management",
    );
    // Tealium is a tag management system, so it credits the skill — and the
    // suggestion shows the words the reader confirmed, not the catalogue's.
    expect(tagManagement?.evidenceLabels).toContain("Tealium");

    const consent = suggestion!.matchedSkills.find(
      (skill) => skill.normalizedConcept === "consent and privacy",
    );
    expect(consent?.evidenceLabels).toEqual(["Consent management"]);
  });

  it("does not credit a capability merely because a product was used", () => {
    // Using Google Analytics is not implementing analytics. If this ever
    // passes, an alias has started inferring evidence the reader never gave.
    const onlyGoogleAnalytics = [
      confirmedSkill("google analytics", "Google Analytics", {
        category: "tool",
      }),
    ];
    expect(evaluateExplorePathways(onlyGoogleAnalytics, [])).toHaveLength(0);
  });

  it("leaves the 70% threshold intact", () => {
    // One aliased tool cannot carry a seven-skill pathway on its own.
    const onlyTealium = [
      confirmedSkill("tealium", "Tealium", { category: "tool" }),
    ];
    expect(evaluateExplorePathways(onlyTealium, [])).toHaveLength(0);
  });

  it("still suggests nothing from the shipped catalogue, because evidence is too thin", () => {
    // Not an endorsement of the outcome — a record of it. When extraction
    // begins proposing capabilities, this will fail and should be revisited
    // rather than deleted.
    expect(evaluateExplorePathways(realEvidence, [])).toHaveLength(0);
  });
});
