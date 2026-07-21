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

/**
 * The identifier of an early-access signup being marked invited.
 *
 * A `uuid` and never an email: the database function is keyed on the row id so
 * that no caller can ask whether a given address is on the list, and this
 * schema is the boundary that keeps the surface honest about it. It replaced a
 * `/^[0-9a-fA-F-]{36}$/` regex that accepted thirty-six hyphens.
 */
export const markEarlyAccessInvitedInputSchema = z.object({
  signupId: z.string().uuid(),
});

export const decideAccessInputSchema = z.object({
  userId: z.string().uuid(),
  nextStatus: accessStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
