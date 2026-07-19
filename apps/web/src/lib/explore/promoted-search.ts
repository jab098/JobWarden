import type {
  CareerProfileDraft,
  ExploreSuggestion,
  NamedSearchProfileDraft,
} from "@jobwarden/domain";

const skillConceptCap = 50;

/**
 * Deterministically prefills a named search profile from an Explore
 * suggestion. Only the pathway role family and the user's own matched
 * evidence labels carry over; every allow-list stays permissive so the user
 * reviews and narrows the promoted search themselves.
 */
export function buildPromotedSearchDraft(
  suggestion: ExploreSuggestion,
  careerDraft: CareerProfileDraft | null,
): NamedSearchProfileDraft {
  const skillConcepts = [
    ...new Set(suggestion.matchedSkills.map((skill) => skill.label)),
  ].slice(0, skillConceptCap);

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
    responsibilityConcepts: [],
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
