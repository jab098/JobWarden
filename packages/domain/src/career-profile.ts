import { z } from "zod";

import {
  compensationPeriods,
  employmentTypes,
  ir35Statuses,
  workingTimes,
  workplaceTypes,
} from "./job.ts";

export const seniorityLevels = [
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "head",
  "director",
  "executive",
  "unspecified",
] as const;

export const careerEvidenceCategories = [
  "skill",
  "tool",
  "responsibility",
  "industry",
  "domain",
  "role_history",
  "education",
  "qualification",
] as const;

export const careerEvidenceOrigins = ["cv", "user"] as const;
export const careerEvidenceConfirmationStates = [
  "proposed",
  "confirmed",
  "rejected",
] as const;
export const proficiencySignals = [
  "demonstrated",
  "working",
  "advanced",
  "unspecified",
] as const;
export const profileSuggestionKinds = [
  "skill",
  "role_family",
  "seniority",
  "career_pathway",
] as const;
export const profileSuggestionStates = [
  "proposed",
  "accepted",
  "rejected",
] as const;

export const normalizedConceptPattern = /^[a-z0-9][a-z0-9 .+#/&()'-]*$/;

export const normalizedConceptSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(normalizedConceptPattern, "Use a lowercase normalised concept");

const boundedLabelSchema = z.string().trim().min(1).max(120);

export const profileConceptSchema = z
  .object({
    normalizedConcept: normalizedConceptSchema,
    label: boundedLabelSchema,
  })
  .strict();

export const careerEvidenceItemSchema = z
  .object({
    id: z.string().uuid(),
    normalizedConcept: normalizedConceptSchema,
    label: boundedLabelSchema,
    category: z.enum(careerEvidenceCategories),
    origin: z.enum(careerEvidenceOrigins),
    confidence: z.number().min(0).max(1),
    evidenceReference: z.string().trim().min(1).max(200).nullable(),
    evidenceExcerpt: z.string().trim().min(1).max(280).nullable(),
    proficiencySignal: z.enum(proficiencySignals),
    lastUsedAt: z.iso.date().nullable(),
    confirmationState: z.enum(careerEvidenceConfirmationStates),
  })
  .strict()
  .superRefine(({ origin, evidenceReference }, context) => {
    if (origin === "cv" && evidenceReference === null) {
      context.addIssue({
        code: "custom",
        message: "CV evidence requires an evidence reference",
        path: ["evidenceReference"],
      });
    }
  });

function addUniqueConceptIssue(
  values: readonly { normalizedConcept: string }[],
  path: string,
  context: z.RefinementCtx,
): void {
  const concepts = values.map(({ normalizedConcept }) => normalizedConcept);
  if (new Set(concepts).size !== concepts.length) {
    context.addIssue({
      code: "custom",
      message: `${path} must contain unique normalised concepts`,
      path: [path],
    });
  }
}

export const careerProfileDraftSchema = z
  .object({
    cvDocumentId: z.string().uuid().nullable(),
    currentSeniority: z.enum(seniorityLevels),
    targetSeniority: z.enum(seniorityLevels),
    evidence: z.array(careerEvidenceItemSchema).max(250),
    targetRoleFamilies: z.array(profileConceptSchema).max(20),
    industries: z.array(profileConceptSchema).max(20),
    domains: z.array(profileConceptSchema).max(20),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30),
  })
  .strict()
  .superRefine((profile, context) => {
    const hasOnboardingSignal =
      profile.cvDocumentId !== null ||
      profile.evidence.length > 0 ||
      profile.targetRoleFamilies.length > 0 ||
      profile.industries.length > 0 ||
      profile.domains.length > 0 ||
      profile.keywords.length > 0;

    if (!hasOnboardingSignal) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one onboarding signal",
        path: ["targetRoleFamilies"],
      });
    }

    addUniqueConceptIssue(
      profile.targetRoleFamilies,
      "targetRoleFamilies",
      context,
    );
    addUniqueConceptIssue(profile.industries, "industries", context);
    addUniqueConceptIssue(profile.domains, "domains", context);
    addUniqueConceptIssue(profile.evidence, "evidence", context);

    if (new Set(profile.keywords).size !== profile.keywords.length) {
      context.addIssue({
        code: "custom",
        message: "keywords must be unique",
        path: ["keywords"],
      });
    }
  });

export const profileSuggestionSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(profileSuggestionKinds),
    normalizedConcept: normalizedConceptSchema,
    label: boundedLabelSchema,
    confidence: z.number().min(0).max(1),
    evidenceItemIds: z.array(z.string().uuid()).min(1).max(30),
    state: z.enum(profileSuggestionStates),
    proposedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine(({ evidenceItemIds }, context) => {
    if (new Set(evidenceItemIds).size !== evidenceItemIds.length) {
      context.addIssue({
        code: "custom",
        message: "Evidence item IDs must be unique",
        path: ["evidenceItemIds"],
      });
    }
  });

const uniqueStringArraySchema = (maximum: number) =>
  z
    .array(z.string().trim().min(1).max(120))
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, {
      message: "Values must be unique",
    });

export const namedSearchProfileDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    roleFamilies: z.array(profileConceptSchema).max(20),
    includeTerms: uniqueStringArraySchema(30),
    excludeTerms: uniqueStringArraySchema(30),
    industries: z.array(profileConceptSchema).max(20),
    domains: z.array(profileConceptSchema).max(20),
    skillConcepts: uniqueStringArraySchema(50),
    responsibilityConcepts: uniqueStringArraySchema(50),
    currentSeniority: z.enum(seniorityLevels),
    targetSeniority: z.enum(seniorityLevels),
    employmentTypes: z
      .array(z.enum(employmentTypes))
      .max(employmentTypes.length),
    workingTimes: z.array(z.enum(workingTimes)).max(workingTimes.length),
    workplaceTypes: z.array(z.enum(workplaceTypes)).max(workplaceTypes.length),
    ukLocations: uniqueStringArraySchema(30),
    ir35Statuses: z.array(z.enum(ir35Statuses)).max(ir35Statuses.length),
    compensation: z
      .object({
        minimum: z.number().int().nonnegative().nullable(),
        maximum: z.number().int().nonnegative().nullable(),
        period: z.enum(compensationPeriods),
        allowUnknown: z.boolean(),
      })
      .strict(),
    recencyDays: z.union([
      z.literal(1),
      z.literal(3),
      z.literal(7),
      z.literal(14),
      z.literal(30),
    ]),
    notificationsEnabled: z.boolean(),
  })
  .strict()
  .superRefine((profile, context) => {
    const hasSearchSignal =
      profile.roleFamilies.length > 0 ||
      profile.includeTerms.length > 0 ||
      profile.industries.length > 0 ||
      profile.domains.length > 0 ||
      profile.skillConcepts.length > 0 ||
      profile.responsibilityConcepts.length > 0;

    if (!hasSearchSignal) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one search signal",
        path: ["roleFamilies"],
      });
    }

    addUniqueConceptIssue(profile.roleFamilies, "roleFamilies", context);
    addUniqueConceptIssue(profile.industries, "industries", context);
    addUniqueConceptIssue(profile.domains, "domains", context);

    const { minimum, maximum } = profile.compensation;
    if (minimum !== null && maximum !== null && minimum > maximum) {
      context.addIssue({
        code: "custom",
        message: "Compensation minimum cannot exceed maximum",
        path: ["compensation", "maximum"],
      });
    }
  });

export type CareerEvidenceItem = z.infer<typeof careerEvidenceItemSchema>;
export type CareerProfileDraft = z.infer<typeof careerProfileDraftSchema>;
export type ProfileSuggestion = z.infer<typeof profileSuggestionSchema>;
export type NamedSearchProfileDraft = z.infer<
  typeof namedSearchProfileDraftSchema
>;

export function parseCareerProfileDraft(input: unknown): CareerProfileDraft {
  return careerProfileDraftSchema.parse(input);
}
