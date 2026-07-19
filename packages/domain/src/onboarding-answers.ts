import { z } from "zod";

import {
  namedSearchProfileDraftSchema,
  seniorityLevels,
  type CareerEvidenceItem,
  type NamedSearchProfileDraft,
} from "./career-profile.ts";
import {
  compensationPeriods,
  employmentTypes,
  ir35Statuses,
  workingTimes,
  workplaceTypes,
} from "./job.ts";

/**
 * What onboarding collects, step by step. Every field is optional because the
 * user answers over several visits and may abandon between any two of them; the
 * shape has to survive being half-filled.
 */
export const onboardingAnswersSchema = z
  .object({
    roleFamilies: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    skillConcepts: z
      .array(z.string().trim().min(1).max(120))
      .max(50)
      .optional(),
    /** Skills the user wants to build, not ones they claim to have. */
    developingSkills: z
      .array(z.string().trim().min(1).max(120))
      .max(20)
      .optional(),
    targetSeniority: z.enum(seniorityLevels).optional(),
    employmentTypes: z.array(z.enum(employmentTypes)).max(9).optional(),
    workingTimes: z.array(z.enum(workingTimes)).max(4).optional(),
    workplaceTypes: z.array(z.enum(workplaceTypes)).max(4).optional(),
    ir35Statuses: z.array(z.enum(ir35Statuses)).max(4).optional(),
    ukLocations: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
    compensationMinimum: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    compensationPeriod: z.enum(compensationPeriods).optional(),
    allowUnknownCompensation: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    exploreEnabled: z.boolean().optional(),
  })
  .strict();

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

export function parseOnboardingAnswers(input: unknown): OnboardingAnswers {
  const result = onboardingAnswersSchema.safeParse(input ?? {});
  // A half-written or corrupt payload becomes "nothing answered yet" rather
  // than blocking the user out of their own setup.
  return result.success ? result.data : {};
}

export interface FirstRunFilters {
  employment: (typeof employmentTypes)[number] | "all";
  workingTime: (typeof workingTimes)[number] | "all";
  workplace: (typeof workplaceTypes)[number] | "all";
  ir35: (typeof ir35Statuses)[number] | "all";
  compensation: "advertised" | "estimated" | "unknown" | "all";
}

/**
 * The hard preferences that can be expressed as feed filters. Only a *single*
 * selection becomes a filter: the feed's filters are one-value-per-facet, and
 * silently collapsing three chosen employment types into one would apply a
 * preference the user never expressed. Multi-selections still shape matching
 * through the search profile; they simply are not pre-applied to the URL.
 */
export function buildFirstRunFilters(
  answers: OnboardingAnswers,
): FirstRunFilters {
  const only = <T extends string>(values: readonly T[] | undefined) =>
    values?.length === 1 ? values[0]! : undefined;

  return {
    employment: only(answers.employmentTypes) ?? "all",
    workingTime: only(answers.workingTimes) ?? "all",
    workplace: only(answers.workplaceTypes) ?? "all",
    ir35: only(answers.ir35Statuses) ?? "all",
    // Unknown pay is included unless the user said otherwise, because excluding
    // it by default would silently hide most of the UK market.
    compensation:
      answers.allowUnknownCompensation === false ? "advertised" : "all",
  };
}

/**
 * Turns onboarding answers into the first named search. Confirmed CV evidence
 * supplies the skills where it exists; the aspiration path supplies them from
 * what the user said instead. Nothing is invented: a field with no answer and
 * no evidence stays empty rather than being guessed.
 */
export function buildSearchProfileFromAnswers(input: {
  answers: OnboardingAnswers;
  confirmedEvidence: readonly CareerEvidenceItem[];
  name: string;
}): NamedSearchProfileDraft {
  const evidenceSkills = input.confirmedEvidence
    .filter((item) => item.category === "skill" || item.category === "tool")
    .map((item) => item.normalizedConcept);
  const evidenceResponsibilities = input.confirmedEvidence
    .filter((item) => item.category === "responsibility")
    .map((item) => item.normalizedConcept);

  const skillConcepts = [
    ...new Set([...(input.answers.skillConcepts ?? []), ...evidenceSkills]),
  ].slice(0, 50);

  const draft: NamedSearchProfileDraft = {
    name: input.name.trim().slice(0, 80) || "My UK search",
    enabled: true,
    roleFamilies: [
      ...new Map(
        (input.answers.roleFamilies ?? []).map((label) => [
          label.toLocaleLowerCase("en-GB"),
          { normalizedConcept: label.toLocaleLowerCase("en-GB"), label },
        ]),
      ).values(),
    ].slice(0, 20),
    includeTerms: [],
    excludeTerms: [],
    industries: [],
    domains: [],
    skillConcepts,
    responsibilityConcepts: [...new Set(evidenceResponsibilities)].slice(0, 50),
    currentSeniority: "unspecified",
    targetSeniority: input.answers.targetSeniority ?? "unspecified",
    employmentTypes: input.answers.employmentTypes ?? [],
    workingTimes: input.answers.workingTimes ?? [],
    workplaceTypes: input.answers.workplaceTypes ?? [],
    ukLocations: input.answers.ukLocations ?? [],
    ir35Statuses: input.answers.ir35Statuses ?? [],
    compensation: {
      minimum: input.answers.compensationMinimum ?? null,
      maximum: null,
      period: input.answers.compensationPeriod ?? "unknown",
      allowUnknown: input.answers.allowUnknownCompensation ?? true,
    },
    recencyDays: 30,
    notificationsEnabled: input.answers.notificationsEnabled ?? false,
  };

  return namedSearchProfileDraftSchema.parse(draft);
}

/**
 * A named search needs at least one signal to be saveable. This says whether
 * onboarding has gathered one yet, so the flow can ask for more rather than
 * failing at the final step.
 */
export function hasSearchSignal(input: {
  answers: OnboardingAnswers;
  confirmedEvidence: readonly CareerEvidenceItem[];
}): boolean {
  return (
    (input.answers.roleFamilies?.length ?? 0) > 0 ||
    (input.answers.skillConcepts?.length ?? 0) > 0 ||
    input.confirmedEvidence.some(
      (item) =>
        item.category === "skill" ||
        item.category === "tool" ||
        item.category === "responsibility",
    )
  );
}
