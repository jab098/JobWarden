import type {
  CareerEvidenceItem,
  NamedSearchProfileDraft,
} from "./career-profile.ts";
import type { CompensationPeriod } from "./compensation.ts";
import type {
  EmploymentType,
  compensationProvenances,
  ir35Statuses,
  workingTimes,
  workplaceTypes,
} from "./job.ts";

export type WorkingTime = (typeof workingTimes)[number];
export type WorkplaceType = (typeof workplaceTypes)[number];
export type Ir35Status = (typeof ir35Statuses)[number];
export type CompensationProvenance = (typeof compensationProvenances)[number];

export interface TargetFeedJobInput {
  id: string;
  title: string;
  employer: string;
  descriptionText: string;
  location: string;
  employmentType: EmploymentType;
  workingTime: WorkingTime;
  workplaceType: WorkplaceType;
  ir35Status: Ir35Status;
  compensationMinimum: number | null;
  compensationMaximum: number | null;
  compensationPeriod: CompensationPeriod;
  compensationProvenance: CompensationProvenance;
  postedAt: string | null;
}

export type EligibilityExclusion =
  | {
      reason:
        | "employment_type"
        | "working_time"
        | "workplace"
        | "ir35"
        | "location"
        | "excluded_term"
        | "recency";
    }
  | { reason: "compensation_below_minimum"; minimum: number }
  | { reason: "unknown_compensation_disallowed" };

export interface TargetFeedScoreComponent {
  key:
    "skills" | "responsibilities" | "seniority" | "industry" | "preference_fit";
  weight: 45 | 20 | 15 | 10;
  awarded: number;
  matched: readonly string[];
  gaps: readonly string[];
}

export interface TargetFeedExplanation {
  profileName: string;
  score: number;
  components: readonly TargetFeedScoreComponent[];
  matchedEvidence: readonly string[];
  importantGaps: readonly string[];
  synonymCredits: readonly { term: string; evidenceLabel: string }[];
  compensationTreatment:
    | { kind: "advertised" | "estimated"; withinPreference: boolean }
    | { kind: "unknown"; allowed: true };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordIncludes(haystack: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  const pattern = new RegExp(
    `(?<![a-z0-9])${escapeRegExp(trimmed)}(?![a-z0-9])`,
    "i",
  );
  return pattern.test(haystack);
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function isKnownOutsideAllowList<T extends string>(
  value: T,
  allowList: readonly T[],
  unknownValue: T,
): boolean {
  if (value === unknownValue) return false;
  if (allowList.length === 0) return false;
  return !allowList.includes(value);
}

function passesLocationGate(
  job: TargetFeedJobInput,
  ukLocations: readonly string[],
): boolean {
  if (ukLocations.length === 0 || job.workplaceType === "remote") return true;
  return ukLocations.some((location) =>
    job.location.toLowerCase().includes(location.toLowerCase()),
  );
}

function matchesAnyExcludeTerm(
  excludeTerms: readonly string[],
  title: string,
  descriptionText: string,
): boolean {
  const haystack = `${title} ${descriptionText}`;
  return excludeTerms.some((term) => wholeWordIncludes(haystack, term));
}

function evaluateCompensationGate(
  job: TargetFeedJobInput,
  compensation: NamedSearchProfileDraft["compensation"],
): EligibilityExclusion | null {
  if (job.compensationProvenance === "unknown") {
    return compensation.allowUnknown
      ? null
      : { reason: "unknown_compensation_disallowed" };
  }

  if (compensation.minimum === null) return null;
  if (job.compensationPeriod === "unknown") return null;
  if (compensation.period === "unknown") return null;
  if (job.compensationPeriod !== compensation.period) return null;

  const jobValue = job.compensationMaximum ?? job.compensationMinimum;
  if (jobValue === null) return null;
  if (jobValue < compensation.minimum) {
    return {
      reason: "compensation_below_minimum",
      minimum: compensation.minimum,
    };
  }

  return null;
}

export function applyEligibilityGate(
  job: TargetFeedJobInput,
  profile: NamedSearchProfileDraft,
  now: Date,
):
  | { eligible: true }
  | { eligible: false; exclusions: readonly EligibilityExclusion[] } {
  const exclusions: EligibilityExclusion[] = [];

  if (
    isKnownOutsideAllowList(
      job.employmentType,
      profile.employmentTypes,
      "unknown",
    )
  ) {
    exclusions.push({ reason: "employment_type" });
  }
  if (
    isKnownOutsideAllowList(job.workingTime, profile.workingTimes, "unknown")
  ) {
    exclusions.push({ reason: "working_time" });
  }
  if (
    isKnownOutsideAllowList(
      job.workplaceType,
      profile.workplaceTypes,
      "unknown",
    )
  ) {
    exclusions.push({ reason: "workplace" });
  }
  if (
    isKnownOutsideAllowList(job.ir35Status, profile.ir35Statuses, "unknown")
  ) {
    exclusions.push({ reason: "ir35" });
  }
  if (!passesLocationGate(job, profile.ukLocations)) {
    exclusions.push({ reason: "location" });
  }
  if (
    matchesAnyExcludeTerm(profile.excludeTerms, job.title, job.descriptionText)
  ) {
    exclusions.push({ reason: "excluded_term" });
  }
  if (job.postedAt !== null) {
    const ageDays =
      (now.getTime() - new Date(job.postedAt).getTime()) / MS_PER_DAY;
    if (ageDays > profile.recencyDays) {
      exclusions.push({ reason: "recency" });
    }
  }
  const compensationExclusion = evaluateCompensationGate(
    job,
    profile.compensation,
  );
  if (compensationExclusion) exclusions.push(compensationExclusion);

  return exclusions.length === 0
    ? { eligible: true }
    : { eligible: false, exclusions };
}

type ConceptCandidate = { key: string; label: string; fromProfile: boolean };

function buildConceptCandidates(
  profileConcepts: readonly string[],
  evidence: readonly CareerEvidenceItem[],
  categories: readonly CareerEvidenceItem["category"][],
): ConceptCandidate[] {
  const candidates = new Map<string, ConceptCandidate>();

  for (const label of profileConcepts) {
    const key = normalise(label);
    const existing = candidates.get(key);
    if (existing) existing.fromProfile = true;
    else candidates.set(key, { key, label, fromProfile: true });
  }

  for (const item of evidence) {
    if (!categories.includes(item.category)) continue;
    const key = item.normalizedConcept;
    if (!candidates.has(key)) {
      candidates.set(key, { key, label: item.label, fromProfile: false });
    }
  }

  return [...candidates.values()];
}

function matchesConcept(
  haystack: string,
  candidate: ConceptCandidate,
): boolean {
  return (
    wholeWordIncludes(haystack, candidate.label) ||
    wholeWordIncludes(haystack, candidate.key)
  );
}

function scoreConceptComponent(
  key: "skills" | "responsibilities",
  weight: 45 | 20,
  candidates: readonly ConceptCandidate[],
  haystack: string,
): TargetFeedScoreComponent {
  if (candidates.length === 0) {
    return { key, weight, awarded: 0, matched: [], gaps: [] };
  }

  const matched: string[] = [];
  const gaps: string[] = [];
  for (const candidate of candidates) {
    if (matchesConcept(haystack, candidate)) matched.push(candidate.label);
    else if (candidate.fromProfile) gaps.push(candidate.label);
  }

  return {
    key,
    weight,
    awarded: Math.round((weight * matched.length) / candidates.length),
    matched,
    gaps,
  };
}

const seniorityOrder = [
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "head",
  "director",
  "executive",
] as const;
type SeniorityMarker = (typeof seniorityOrder)[number];

const seniorityMarkerRules: readonly [RegExp, SeniorityMarker][] = [
  [/\b(?:entry[-\s]level|apprentice|intern)\b/i, "entry"],
  [/\b(?:graduate|junior)\b/i, "junior"],
  [/\b(?:mid[-\s]level|mid|intermediate)\b/i, "mid"],
  [/\bsenior\b/i, "senior"],
  [/\blead\b/i, "lead"],
  [/\b(?:principal|staff)\b/i, "principal"],
  [/\bhead\b/i, "head"],
  [/\b(?:director|vp|vice[-\s]president)\b/i, "director"],
  [/\b(?:chief|executive|ceo|cto|cfo|coo)\b/i, "executive"],
];

function detectSeniorityMarker(title: string): SeniorityMarker | null {
  for (const [pattern, marker] of seniorityMarkerRules) {
    if (pattern.test(title)) return marker;
  }
  return null;
}

function scoreSeniorityComponent(
  title: string,
  targetSeniority: NamedSearchProfileDraft["targetSeniority"],
): TargetFeedScoreComponent {
  const marker = detectSeniorityMarker(title);
  if (marker === null || targetSeniority === "unspecified") {
    return { key: "seniority", weight: 15, awarded: 10, matched: [], gaps: [] };
  }

  if (marker === targetSeniority) {
    return {
      key: "seniority",
      weight: 15,
      awarded: 15,
      matched: [`Seniority: ${marker}`],
      gaps: [],
    };
  }

  const markerIndex = seniorityOrder.indexOf(marker);
  const targetIndex = seniorityOrder.indexOf(
    targetSeniority as SeniorityMarker,
  );
  const isAdjacent =
    targetIndex !== -1 && Math.abs(markerIndex - targetIndex) === 1;

  return {
    key: "seniority",
    weight: 15,
    awarded: isAdjacent ? 8 : 0,
    matched: [],
    gaps: [`Seniority: ${targetSeniority}`],
  };
}

function scoreIndustryComponent(
  profile: NamedSearchProfileDraft,
  haystack: string,
): TargetFeedScoreComponent {
  if (profile.industries.length === 0 && profile.domains.length === 0) {
    return { key: "industry", weight: 10, awarded: 10, matched: [], gaps: [] };
  }

  const candidates = new Map<string, { key: string; label: string }>();
  for (const concept of [...profile.industries, ...profile.domains]) {
    if (!candidates.has(concept.normalizedConcept)) {
      candidates.set(concept.normalizedConcept, {
        key: concept.normalizedConcept,
        label: concept.label,
      });
    }
  }

  const matched: string[] = [];
  const gaps: string[] = [];
  for (const candidate of candidates.values()) {
    if (
      wholeWordIncludes(haystack, candidate.label) ||
      wholeWordIncludes(haystack, candidate.key)
    ) {
      matched.push(candidate.label);
    } else {
      gaps.push(candidate.label);
    }
  }

  const total = candidates.size;
  return {
    key: "industry",
    weight: 10,
    awarded: Math.round((10 * matched.length) / total),
    matched,
    gaps,
  };
}

function preferenceScore<T extends string>(
  jobValue: T,
  selection: readonly T[],
  unknownValue: T,
): number {
  if (selection.length === 0) return 2;
  if (jobValue === unknownValue) return 1;
  return selection.includes(jobValue) ? 2 : 0;
}

function scorePreferenceFitComponent(
  job: TargetFeedJobInput,
  profile: NamedSearchProfileDraft,
): TargetFeedScoreComponent {
  const subcomponents: { label: string; score: number }[] = [
    {
      label: "Employment type",
      score: preferenceScore(
        job.employmentType,
        profile.employmentTypes,
        "unknown",
      ),
    },
    {
      label: "Working time",
      score: preferenceScore(job.workingTime, profile.workingTimes, "unknown"),
    },
    {
      label: "Workplace type",
      score: preferenceScore(
        job.workplaceType,
        profile.workplaceTypes,
        "unknown",
      ),
    },
    {
      label: "IR35 status",
      score: preferenceScore(job.ir35Status, profile.ir35Statuses, "unknown"),
    },
    {
      label: "Location",
      score: passesLocationGate(job, profile.ukLocations) ? 2 : 0,
    },
  ];

  const matched = subcomponents
    .filter((s) => s.score === 2)
    .map((s) => s.label);
  const gaps = subcomponents.filter((s) => s.score < 2).map((s) => s.label);
  const awarded = subcomponents.reduce((total, s) => total + s.score, 0);

  return { key: "preference_fit", weight: 10, awarded, matched, gaps };
}

function buildSynonymCredits(
  profile: NamedSearchProfileDraft,
  confirmedEvidence: readonly CareerEvidenceItem[],
  title: string,
  haystack: string,
): readonly { term: string; evidenceLabel: string }[] {
  const matchingRoleEvidence = confirmedEvidence.find(
    (item) =>
      (item.category === "responsibility" ||
        item.category === "role_history") &&
      (wholeWordIncludes(haystack, item.label) ||
        wholeWordIncludes(haystack, item.normalizedConcept)),
  );
  if (!matchingRoleEvidence) return [];

  return profile.includeTerms
    .filter((term) => wholeWordIncludes(title, term))
    .map((term) => ({ term, evidenceLabel: matchingRoleEvidence.label }));
}

function buildCompensationTreatment(
  job: TargetFeedJobInput,
  compensation: NamedSearchProfileDraft["compensation"],
): TargetFeedExplanation["compensationTreatment"] {
  if (job.compensationProvenance === "unknown") {
    return { kind: "unknown", allowed: true };
  }

  return {
    kind: job.compensationProvenance,
    withinPreference: compensationWithinPreference(job, compensation),
  };
}

function compensationWithinPreference(
  job: TargetFeedJobInput,
  compensation: NamedSearchProfileDraft["compensation"],
): boolean {
  if (
    compensation.period === "unknown" ||
    job.compensationPeriod === "unknown" ||
    job.compensationPeriod !== compensation.period
  ) {
    return true;
  }

  const highValue = job.compensationMaximum ?? job.compensationMinimum;
  if (
    compensation.minimum !== null &&
    highValue !== null &&
    highValue < compensation.minimum
  ) {
    return false;
  }

  const lowValue = job.compensationMinimum ?? job.compensationMaximum;
  if (
    compensation.maximum !== null &&
    lowValue !== null &&
    lowValue > compensation.maximum
  ) {
    return false;
  }

  return true;
}

export function scoreJobForProfile(
  job: TargetFeedJobInput,
  profile: NamedSearchProfileDraft,
  confirmedEvidence: readonly CareerEvidenceItem[],
  now: Date,
): TargetFeedExplanation {
  void now;
  const haystack = `${job.title} ${job.descriptionText}`;

  const skillCandidates = buildConceptCandidates(
    profile.skillConcepts,
    confirmedEvidence,
    ["skill", "tool"],
  );
  const responsibilityCandidates = buildConceptCandidates(
    profile.responsibilityConcepts,
    confirmedEvidence,
    ["responsibility"],
  );

  const components: TargetFeedScoreComponent[] = [
    scoreConceptComponent("skills", 45, skillCandidates, haystack),
    scoreConceptComponent(
      "responsibilities",
      20,
      responsibilityCandidates,
      haystack,
    ),
    scoreSeniorityComponent(job.title, profile.targetSeniority),
    scoreIndustryComponent(profile, haystack),
    scorePreferenceFitComponent(job, profile),
  ];

  const score = components.reduce(
    (total, component) => total + component.awarded,
    0,
  );

  const matchedEvidence = confirmedEvidence
    .filter(
      (item) =>
        wholeWordIncludes(haystack, item.label) ||
        wholeWordIncludes(haystack, item.normalizedConcept),
    )
    .map((item) => item.label);

  const importantGaps: string[] = [];
  for (const component of components) {
    for (const gap of component.gaps) {
      if (!importantGaps.includes(gap)) importantGaps.push(gap);
      if (importantGaps.length === 6) break;
    }
    if (importantGaps.length === 6) break;
  }

  return {
    profileName: profile.name,
    score,
    components,
    matchedEvidence,
    importantGaps,
    synonymCredits: buildSynonymCredits(
      profile,
      confirmedEvidence,
      job.title,
      haystack,
    ),
    compensationTreatment: buildCompensationTreatment(
      job,
      profile.compensation,
    ),
  };
}
