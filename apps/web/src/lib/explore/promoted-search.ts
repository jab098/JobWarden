import type {
  CareerProfileDraft,
  ExploreSuggestion,
  NamedSearchProfileDraft,
} from "@jobwarden/domain";

const skillConceptCap = 50;

/**
 * Deterministically prefills a named search profile from an Explore
 * suggestion. Only the pathway role family and the user's own matched
 * confirmed-evidence concepts carry over; every allow-list stays permissive
 * so the user reviews and narrows the promoted search themselves.
 *
 * The save_search_profile RPC only accepts concepts that exactly equal
 * confirmed owner evidence normalised concepts, validated per category
 * (skill/tool vs responsibility), so the matched concepts are partitioned by
 * the evidence categories that earned the credit.
 */
export function buildPromotedSearchDraft(
  suggestion: ExploreSuggestion,
  careerDraft: CareerProfileDraft | null,
): NamedSearchProfileDraft {
  const skillConcepts: string[] = [];
  const responsibilityConcepts: string[] = [];
  for (const matched of suggestion.matchedSkills) {
    const viaSkillOrTool = matched.evidenceCategories.some(
      (category) => category === "skill" || category === "tool",
    );
    const target = viaSkillOrTool ? skillConcepts : responsibilityConcepts;
    if (
      !target.includes(matched.normalizedConcept) &&
      target.length < skillConceptCap
    ) {
      target.push(matched.normalizedConcept);
    }
  }

  return {
    name: suggestion.pathway.label.slice(0, 80),
    enabled: true,
    roleFamilies: [
      {
        normalizedConcept: suggestion.pathway.normalizedConcept,
        label: suggestion.pathway.label,
      },
    ],
    includeTerms: [],
    excludeTerms: [],
    industries: [],
    domains: [],
    skillConcepts,
    responsibilityConcepts,
    currentSeniority: careerDraft?.currentSeniority ?? "unspecified",
    targetSeniority: careerDraft?.targetSeniority ?? "unspecified",
    employmentTypes: [],
    workingTimes: [],
    workplaceTypes: [],
    ukLocations: [],
    ir35Statuses: [],
    compensation: {
      minimum: null,
      maximum: null,
      period: "unknown",
      allowUnknown: true,
    },
    recencyDays: 14,
    notificationsEnabled: false,
  };
}
