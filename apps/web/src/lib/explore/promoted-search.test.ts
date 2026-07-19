// @vitest-environment node

import {
  namedSearchProfileDraftSchema,
  type CareerProfileDraft,
  type ExploreSuggestion,
} from "@jobwarden/domain";
import { describe, expect, it } from "vitest";

import { buildPromotedSearchDraft } from "./promoted-search";

function suggestion(
  overrides: Partial<ExploreSuggestion> = {},
): ExploreSuggestion {
  return {
    pathway: {
      normalizedConcept: "product analytics implementation",
      label: "Product analytics implementation",
      summary: "Fictional summary.",
    },
    overlapPercent: 71,
    matchedSkills: [
      {
        normalizedConcept: "event instrumentation",
        label: "Event instrumentation",
        significant: true,
        evidenceLabels: ["Event instrumentation"],
        evidenceCategories: ["skill"],
      },
      {
        normalizedConcept: "analytics implementation",
        label: "Analytics implementation",
        significant: true,
        evidenceLabels: ["Analytics implementation"],
        evidenceCategories: ["responsibility"],
      },
    ],
    gaps: [{ label: "SQL", significant: false }],
    ...overrides,
  };
}

const careerDraft: CareerProfileDraft = {
  cvDocumentId: null,
  currentSeniority: "senior",
  targetSeniority: "lead",
  evidence: [],
  targetRoleFamilies: [
    { normalizedConcept: "analytics implementation", label: "Analytics" },
  ],
  industries: [],
  domains: [],
  keywords: [],
};

describe("buildPromotedSearchDraft", () => {
  it("builds an enabled named search from the pathway and matched skills", () => {
    const draft = buildPromotedSearchDraft(suggestion(), careerDraft);

    expect(namedSearchProfileDraftSchema.parse(draft)).toEqual(draft);
    expect(draft.name).toBe("Product analytics implementation");
    expect(draft.enabled).toBe(true);
    expect(draft.roleFamilies).toEqual([
      {
        normalizedConcept: "product analytics implementation",
        label: "Product analytics implementation",
      },
    ]);
    // Concepts must equal confirmed evidence normalised concepts, partitioned
    // by the evidence category the save_search_profile RPC validates against.
    expect(draft.skillConcepts).toEqual(["event instrumentation"]);
    expect(draft.responsibilityConcepts).toEqual(["analytics implementation"]);
    expect(draft.currentSeniority).toBe("senior");
    expect(draft.targetSeniority).toBe("lead");
    expect(draft.compensation.allowUnknown).toBe(true);
    expect(draft.recencyDays).toBe(14);
    expect(draft.notificationsEnabled).toBe(false);
  });

  it("defaults seniority to unspecified without a career draft", () => {
    const draft = buildPromotedSearchDraft(suggestion(), null);

    expect(draft.currentSeniority).toBe("unspecified");
    expect(draft.targetSeniority).toBe("unspecified");
    expect(namedSearchProfileDraftSchema.parse(draft)).toEqual(draft);
  });

  it("deduplicates and caps matched skill concepts", () => {
    const matched = Array.from({ length: 60 }, (_, index) => ({
      normalizedConcept: `skill ${index}`,
      label: `Skill ${index}`,
      significant: false,
      evidenceLabels: [`Skill ${index}`],
      evidenceCategories: ["skill" as const],
    }));
    const draft = buildPromotedSearchDraft(
      suggestion({
        matchedSkills: [...matched, ...matched],
      }),
      null,
    );

    expect(draft.skillConcepts).toHaveLength(50);
    expect(new Set(draft.skillConcepts).size).toBe(50);
    expect(namedSearchProfileDraftSchema.parse(draft)).toEqual(draft);
  });
});
