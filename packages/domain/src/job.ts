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
  postedAt: z.iso.datetime().nullable(),
  closesAt: z.iso.datetime().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type NormalisedJob = z.infer<typeof normalisedJobSchema>;
