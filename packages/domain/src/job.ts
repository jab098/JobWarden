import { z } from "zod";

export const employmentTypes = [
  "permanent",
  "fixed_term",
  "contract",
  "temporary",
  "apprenticeship",
  "internship",
  "casual",
  "zero_hours",
  "unknown",
] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const workingTimes = [
  "full_time",
  "part_time",
  "flexible",
  "unknown",
] as const;
export const workplaceTypes = [
  "onsite",
  "hybrid",
  "remote",
  "unknown",
] as const;
export const ir35Statuses = [
  "inside",
  "outside",
  "not_applicable",
  "unknown",
] as const;
export const compensationPeriods = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "unknown",
] as const;
export const compensationProvenances = [
  "advertised",
  "estimated",
  "unknown",
] as const;

export const normalisedJobSchema = z.object({
  sourceId: z.string().uuid(),
  providerJobId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  descriptionText: z.string().max(100_000),
  applicationUrl: z
    .url()
    .refine((url) => url.startsWith("https://"), "HTTPS required"),
  countryCode: z.literal("GB"),
  /**
   * The advert's own words for where the work is. Carried through rather than
   * discarded after classification, because it is the only thing the location
   * table can be built from and the only text a distance lookup can resolve.
   */
  rawLocation: z.string().min(1).max(1_000),
  /**
   * Whether the advert permits remote work from within the UK. Derived from the
   * same classification the workplace type uses, never guessed: "unknown" is a
   * real answer and is preserved as one.
   */
  remoteEligibility: z.enum(["uk", "not_remote", "ambiguous", "unknown"]),
  ukEligibilityEvidence: z.array(z.string().min(1).max(500)).min(1),
  employmentType: z.enum(employmentTypes),
  workingTime: z.enum(workingTimes),
  workplaceType: z.enum(workplaceTypes),
  ir35Status: z.enum(ir35Statuses),
  compensationRaw: z.string().max(1_000).nullable(),
  compensationMinimum: z.number().int().nonnegative().nullable(),
  compensationMaximum: z.number().int().nonnegative().nullable(),
  compensationCurrency: z.literal("GBP").nullable(),
  compensationPeriod: z.enum(compensationPeriods),
  compensationProvenance: z.enum(compensationProvenances),
  compensationObservedAt: z.iso.datetime({ offset: true }).nullable(),
  postedAt: z.iso.datetime({ offset: true }).nullable(),
  closesAt: z.iso.datetime({ offset: true }).nullable(),
  deduplicationKey: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type NormalisedJob = z.infer<typeof normalisedJobSchema>;
