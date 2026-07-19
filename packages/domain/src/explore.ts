import type { CareerEvidenceItem } from "./career-profile.ts";

export interface PathwayCoreSkill {
  normalizedConcept: string;
  label: string;
  /** Relative importance in the weighted overlap. */
  weight: 1 | 2 | 3;
  /** An unmatched significant skill counts toward the two-gap ceiling. */
  significant: boolean;
}

export interface CareerPathway {
  normalizedConcept: string;
  label: string;
  /** Generic, non-personal description of the pathway. */
  summary: string;
  coreSkills: readonly PathwayCoreSkill[];
}

export type CreditedEvidenceCategory = "skill" | "tool" | "responsibility";

export interface ExploreSuggestion {
  pathway: Pick<CareerPathway, "normalizedConcept" | "label" | "summary">;
  /** Integer percentage, floor(matchedWeight * 100 / totalWeight). */
  overlapPercent: number;
  matchedSkills: readonly {
    /** Equals the confirmed evidence concept that earned the credit. */
    normalizedConcept: string;
    label: string;
    significant: boolean;
    evidenceLabels: readonly string[];
    /** The confirmed-evidence categories that matched this core skill. */
    evidenceCategories: readonly CreditedEvidenceCategory[];
  }[];
  gaps: readonly { label: string; significant: boolean }[];
}

const OVERLAP_THRESHOLD_PERCENT = 70;
const SIGNIFICANT_GAP_CEILING = 2;

const creditedCategories: readonly CreditedEvidenceCategory[] = [
  "skill",
  "tool",
  "responsibility",
];

function isCreditedCategory(
  category: CareerEvidenceItem["category"],
): category is CreditedEvidenceCategory {
  return (creditedCategories as readonly string[]).includes(category);
}

function skillEntry(
  normalizedConcept: string,
  label: string,
  weight: 1 | 2 | 3,
  significant = false,
): PathwayCoreSkill {
  return { normalizedConcept, label, weight, significant };
}

/**
 * Curated UK adjacent-career taxonomy. Deterministic data, no AI. Weights are
 * calibrated so incidental generic technical evidence (for example JavaScript
 * or SQL alone) always stays below the 70% weighted-overlap threshold.
 */
export const careerPathways: readonly CareerPathway[] = [
  {
    normalizedConcept: "product analytics implementation",
    label: "Product analytics implementation",
    summary:
      "Design and build product event tracking so teams can trust behavioural data end to end.",
    coreSkills: [
      skillEntry("event instrumentation", "Event instrumentation", 3, true),
      skillEntry(
        "analytics implementation",
        "Analytics implementation",
        3,
        true,
      ),
      skillEntry(
        "data quality governance",
        "Data quality and governance",
        2,
        true,
      ),
      skillEntry("behavioural data pipelines", "Behavioural data pipelines", 2),
      skillEntry("experimentation", "Experimentation", 2),
      skillEntry("sql", "SQL", 1),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
    ],
  },
  {
    normalizedConcept: "event data governance",
    label: "Event-data governance",
    summary:
      "Own tracking plans, naming standards, and data quality for behavioural event data.",
    coreSkills: [
      skillEntry("event instrumentation", "Event instrumentation", 3, true),
      skillEntry(
        "data quality governance",
        "Data quality and governance",
        3,
        true,
      ),
      skillEntry("consent and privacy", "Consent and privacy", 2, true),
      skillEntry("behavioural data pipelines", "Behavioural data pipelines", 2),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 2),
      skillEntry("documentation", "Documentation", 1),
      skillEntry("sql", "SQL", 1),
    ],
  },
  {
    normalizedConcept: "analytics solutions consulting",
    label: "Analytics solutions consulting",
    summary:
      "Help client teams scope, implement, and adopt analytics tooling and measurement plans.",
    coreSkills: [
      skillEntry(
        "analytics implementation",
        "Analytics implementation",
        3,
        true,
      ),
      skillEntry(
        "stakeholder collaboration",
        "Stakeholder collaboration",
        3,
        true,
      ),
      skillEntry("requirements discovery", "Requirements discovery", 2, true),
      skillEntry("event instrumentation", "Event instrumentation", 2),
      skillEntry("presentation and training", "Presentation and training", 2),
      skillEntry("experimentation", "Experimentation", 1),
      skillEntry("attribution", "Attribution", 1),
    ],
  },
  {
    normalizedConcept: "consent technology implementation",
    label: "Consent-technology implementation",
    summary:
      "Implement consent management platforms and privacy-safe tagging across web estates.",
    coreSkills: [
      skillEntry("consent and privacy", "Consent and privacy", 3, true),
      skillEntry("tag management", "Tag management", 3, true),
      skillEntry("javascript", "JavaScript", 2, true),
      skillEntry("analytics implementation", "Analytics implementation", 2),
      skillEntry("data quality governance", "Data quality and governance", 2),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
      skillEntry("documentation", "Documentation", 1),
    ],
  },
  {
    normalizedConcept: "technical customer success for analytics platforms",
    label: "Technical customer success for analytics platforms",
    summary:
      "Guide customers through analytics platform setup, adoption, and troubleshooting.",
    coreSkills: [
      skillEntry(
        "analytics implementation",
        "Analytics implementation",
        3,
        true,
      ),
      skillEntry(
        "presentation and training",
        "Presentation and training",
        3,
        true,
      ),
      skillEntry("customer support", "Customer support", 2, true),
      skillEntry("event instrumentation", "Event instrumentation", 2),
      skillEntry("troubleshooting", "Troubleshooting", 2),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
      skillEntry("documentation", "Documentation", 1),
    ],
  },
  {
    normalizedConcept: "marketing operations",
    label: "Marketing operations",
    summary:
      "Run the marketing technology stack: automation, CRM hygiene, attribution, and reporting.",
    coreSkills: [
      skillEntry("marketing automation", "Marketing automation", 3, true),
      skillEntry("crm administration", "CRM administration", 3, true),
      skillEntry("attribution", "Attribution", 2, true),
      skillEntry("data quality governance", "Data quality and governance", 2),
      skillEntry("campaign reporting", "Campaign reporting", 2),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
      skillEntry("sql", "SQL", 1),
    ],
  },
  {
    normalizedConcept: "business intelligence development",
    label: "Business-intelligence development",
    summary:
      "Model data and deliver trusted dashboards and reporting for decision makers.",
    coreSkills: [
      skillEntry("bi dashboard delivery", "BI dashboard delivery", 3, true),
      skillEntry("data modelling", "Data modelling", 3, true),
      skillEntry("sql", "SQL", 3, true),
      skillEntry("data quality governance", "Data quality and governance", 2),
      skillEntry("behavioural data pipelines", "Behavioural data pipelines", 1),
      skillEntry("requirements discovery", "Requirements discovery", 1),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
    ],
  },
  {
    normalizedConcept: "conversion rate optimisation",
    label: "Conversion-rate optimisation",
    summary:
      "Design, run, and analyse experiments that improve user journeys with statistical honesty.",
    coreSkills: [
      skillEntry("experimentation", "Experimentation", 3, true),
      skillEntry("a/b testing", "A/B testing", 3, true),
      skillEntry(
        "analytics implementation",
        "Analytics implementation",
        2,
        true,
      ),
      skillEntry("user research", "User research", 2),
      skillEntry("statistics", "Statistics", 2),
      skillEntry("javascript", "JavaScript", 1),
      skillEntry("stakeholder collaboration", "Stakeholder collaboration", 1),
    ],
  },
];

function normaliseConcept(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateExplorePathways(
  evidence: readonly CareerEvidenceItem[],
  activeTargetRoleFamilyConcepts: readonly string[],
  pathways: readonly CareerPathway[] = careerPathways,
): readonly ExploreSuggestion[] {
  const activeFamilies = new Set(
    activeTargetRoleFamilyConcepts.map(normaliseConcept),
  );

  const evidenceByConcept = new Map<
    string,
    { labels: string[]; categories: CreditedEvidenceCategory[] }
  >();
  for (const item of evidence) {
    if (item.confirmationState !== "confirmed") continue;
    if (!isCreditedCategory(item.category)) continue;
    const entry = evidenceByConcept.get(item.normalizedConcept) ?? {
      labels: [],
      categories: [],
    };
    if (!entry.labels.includes(item.label)) entry.labels.push(item.label);
    if (!entry.categories.includes(item.category)) {
      entry.categories.push(item.category);
    }
    evidenceByConcept.set(item.normalizedConcept, entry);
  }

  const suggestions: ExploreSuggestion[] = [];
  for (const pathway of pathways) {
    if (activeFamilies.has(normaliseConcept(pathway.normalizedConcept))) {
      continue;
    }

    let totalWeight = 0;
    let matchedWeight = 0;
    let significantGapCount = 0;
    const matchedSkills: ExploreSuggestion["matchedSkills"][number][] = [];
    const gaps: ExploreSuggestion["gaps"][number][] = [];

    for (const skill of pathway.coreSkills) {
      totalWeight += skill.weight;
      const matchedEvidence = evidenceByConcept.get(skill.normalizedConcept);
      if (matchedEvidence) {
        matchedWeight += skill.weight;
        matchedSkills.push({
          normalizedConcept: skill.normalizedConcept,
          label: skill.label,
          significant: skill.significant,
          evidenceLabels: matchedEvidence.labels,
          evidenceCategories: matchedEvidence.categories,
        });
      } else {
        if (skill.significant) significantGapCount += 1;
        gaps.push({ label: skill.label, significant: skill.significant });
      }
    }

    if (totalWeight === 0) continue;
    if (matchedWeight * 100 < totalWeight * OVERLAP_THRESHOLD_PERCENT) {
      continue;
    }
    if (significantGapCount > SIGNIFICANT_GAP_CEILING) continue;

    suggestions.push({
      pathway: {
        normalizedConcept: pathway.normalizedConcept,
        label: pathway.label,
        summary: pathway.summary,
      },
      overlapPercent: Math.floor((matchedWeight * 100) / totalWeight),
      matchedSkills,
      gaps,
    });
  }

  return suggestions.sort(
    (a, b) =>
      b.overlapPercent - a.overlapPercent ||
      a.pathway.label.localeCompare(b.pathway.label),
  );
}
