import { describe, expect, it } from "vitest";

import {
  accessStatuses,
  canTransitionAccess,
  decideAccessInputSchema,
} from "./index";

const allowedTransitions = new Set([
  "pending:approved",
  "pending:rejected",
  "approved:suspended",
  "rejected:pending",
  "suspended:approved",
]);

describe("private-access transitions", () => {
  it.each(
    accessStatuses.flatMap((from) =>
      accessStatuses.map((to) => [from, to] as const),
    ),
  )("applies the transition rule from %s to %s", (from, to) => {
    expect(canTransitionAccess(from, to)).toBe(
      allowedTransitions.has(`${from}:${to}`),
    );
  });
});

describe("access decision input", () => {
  it("accepts an administrator decision with a trimmed reason", () => {
    expect(
      decideAccessInputSchema.parse({
        userId: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
        nextStatus: "approved",
        reason: "  Verified private-beta member  ",
      }),
    ).toEqual({
      userId: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
      nextStatus: "approved",
      reason: "Verified private-beta member",
    });
  });

  it.each([
    ["an invalid user ID", { userId: "not-a-uuid" }],
    ["an invalid next status", { nextStatus: "active" }],
    ["a reason shorter than three characters", { reason: "  no  " }],
    ["a reason longer than 500 characters", { reason: "a".repeat(501) }],
  ])("rejects %s", (_name, override) => {
    const result = decideAccessInputSchema.safeParse({
      userId: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
      nextStatus: "approved",
      reason: "Verified member",
      ...override,
    });

    expect(result.success).toBe(false);
  });
});
