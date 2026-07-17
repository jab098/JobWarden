import { z } from "zod";

export const accessStatuses = [
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;
export const accessStatusSchema = z.enum(accessStatuses);
export type AccessStatus = z.infer<typeof accessStatusSchema>;

const transitions: Record<AccessStatus, readonly AccessStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved"],
};

export function canTransitionAccess(
  from: AccessStatus,
  to: AccessStatus,
): boolean {
  return transitions[from].includes(to);
}

export const decideAccessInputSchema = z.object({
  userId: z.string().uuid(),
  nextStatus: accessStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
