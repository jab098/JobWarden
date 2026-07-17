import { z } from "zod";

const isoCalendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const boardTokenPattern = /^[A-Za-z0-9._/-]+$/;
const hostnamePattern = /^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$/;

function isCalendarDate(value: string): boolean {
  if (!isoCalendarDatePattern.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function reviewedDateSchema(today: string) {
  if (!isCalendarDate(today)) {
    throw new Error("A valid current calendar date is required");
  }

  return z
    .string()
    .refine(isCalendarDate, "Enter a real date in YYYY-MM-DD format")
    .refine((value) => value <= today, "Review dates cannot be in the future");
}

export function createSaveJobSourceInputSchema(today: string) {
  const reviewDate = reviewedDateSchema(today);

  return z
    .object({
      sourceId: z.string().uuid().nullable(),
      provider: z.literal("greenhouse"),
      boardToken: z.string().min(1).max(200).regex(boardTokenPattern),
      employerName: z.string().trim().min(1).max(300),
      enabled: z.boolean(),
      minimumSyncMinutes: z.number().int().min(15).max(10_080),
      termsReviewedAt: reviewDate,
      robotsReviewedAt: reviewDate,
      complianceNotes: z.string().trim().min(3).max(5_000),
      allowedHosts: z.array(z.string().regex(hostnamePattern)).min(1).max(10),
    })
    .strict()
    .superRefine(({ allowedHosts }, context) => {
      if (new Set(allowedHosts).size !== allowedHosts.length) {
        context.addIssue({
          code: "custom",
          message: "Allowed hosts must be unique",
          path: ["allowedHosts"],
        });
      }
    });
}

export type SaveJobSourceInput = z.infer<
  ReturnType<typeof createSaveJobSourceInputSchema>
>;

export const requestSourceIngestionInputSchema = z
  .object({ sourceId: z.string().uuid() })
  .strict();

export type RequestSourceIngestionInput = z.infer<
  typeof requestSourceIngestionInputSchema
>;

export type ComplianceReviewState = "current" | "due_soon" | "overdue";

export function getComplianceReviewState(
  reviewedAt: string,
  now: Date,
): ComplianceReviewState {
  if (!isCalendarDate(reviewedAt) || Number.isNaN(now.getTime())) {
    throw new Error("Valid review and current dates are required");
  }

  const reviewedTime = Date.parse(`${reviewedAt}T00:00:00.000Z`);
  const currentTime = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const ageInDays = Math.floor(
    (currentTime - reviewedTime) / (24 * 60 * 60 * 1_000),
  );

  if (ageInDays > 365) return "overdue";
  if (ageInDays >= 335) return "due_soon";
  return "current";
}
