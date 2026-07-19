import { describe, expect, it } from "vitest";

import {
  resolveAdminAccess,
  resolveApprovedAccess,
  resolveProtectedAccess,
  type AccessRepository,
} from "./access";

function repository(
  options: {
    userId?: string;
    status?: "pending" | "approved" | "rejected" | "suspended" | null;
    admin?: boolean;
    onboarding?: unknown;
    onboardingThrows?: boolean;
  } = {},
): AccessRepository {
  return {
    getAuthenticatedUser: async () =>
      options.userId === undefined ? null : { id: options.userId },
    getOwnAccessStatus: async () => options.status ?? null,
    hasAdminRole: async () => options.admin ?? false,
    getOwnOnboardingState: async () => {
      if (options.onboardingThrows) throw new Error("unavailable");
      return "onboarding" in options ? options.onboarding : onboarded;
    },
  };
}

/** A completed CV-path state, so existing cases still resolve to allowed. */
const onboarded = {
  path: "cv",
  completedSteps: [
    "cv",
    "confirm_evidence",
    "preferences",
    "notifications",
    "review",
  ],
  completedAt: "2026-07-20T09:00:00.000Z",
};

describe("protected access resolution", () => {
  it("redirects an unauthenticated visitor to sign in", async () => {
    await expect(resolveProtectedAccess(repository())).resolves.toEqual({
      kind: "redirect",
      destination: "/auth/sign-in",
    });
  });

  it.each(["pending", "rejected", "suspended"] as const)(
    "redirects a %s user to their access state",
    async (status) => {
      await expect(
        resolveProtectedAccess(
          repository({ userId: "user-1", status, admin: false }),
        ),
      ).resolves.toEqual({
        kind: "redirect",
        destination: "/access/pending",
      });
    },
  );

  it("redirects an authenticated user without an access row to the closed-beta state", async () => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "user-1", status: null, admin: false }),
      ),
    ).resolves.toEqual({
      kind: "redirect",
      destination: "/access/pending",
    });
  });

  it("allows an approved user", async () => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "user-1", status: "approved" }),
      ),
    ).resolves.toMatchObject({
      kind: "allowed",
      userId: "user-1",
      isAdmin: false,
    });
  });

  it("allows a server-controlled administrator regardless of request status", async () => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "owner-1", status: "pending", admin: true }),
      ),
    ).resolves.toMatchObject({
      kind: "allowed",
      userId: "owner-1",
      isAdmin: true,
    });
  });
});

describe("administrator access resolution", () => {
  it("returns a safe not-found result for a non-administrator", async () => {
    await expect(
      resolveAdminAccess(
        repository({ userId: "user-1", status: "approved", admin: false }),
      ),
    ).resolves.toEqual({ kind: "not-found" });
  });

  it("allows a server-controlled administrator", async () => {
    await expect(
      resolveAdminAccess(
        repository({ userId: "owner-1", status: "pending", admin: true }),
      ),
    ).resolves.toEqual({
      kind: "allowed",
      userId: "owner-1",
      isAdmin: true,
    });
  });
});

describe("onboarding gate", () => {
  it("holds an approved user at onboarding until it is complete", async () => {
    await expect(
      resolveProtectedAccess(
        repository({
          userId: "user-1",
          status: "approved",
          onboarding: { ...onboarded, completedAt: null },
        }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("holds a user who has never started", async () => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "user-1", status: "approved", onboarding: null }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("admits an approved user who has finished", async () => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "user-1", status: "approved" }),
      ),
    ).resolves.toMatchObject({ kind: "allowed", userId: "user-1" });
  });

  it.each([
    [
      "a corrupt row",
      { path: "wizard", completedSteps: [], completedAt: null },
    ],
    [
      "a forged completion",
      {
        path: "cv",
        completedSteps: ["cv"],
        completedAt: "2026-07-20T09:00:00.000Z",
      },
    ],
    ["a non-object", "done"],
  ])("fails closed on %s", async (_label, onboarding) => {
    await expect(
      resolveProtectedAccess(
        repository({ userId: "user-1", status: "approved", onboarding }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("fails closed when the onboarding read itself fails", async () => {
    // An unavailable read must not admit; the hub is useless without a profile.
    await expect(
      resolveProtectedAccess(
        repository({
          userId: "user-1",
          status: "approved",
          onboardingThrows: true,
        }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("gates an administrator out of the hub like anyone else", async () => {
    await expect(
      resolveProtectedAccess(
        repository({
          userId: "admin-1",
          status: "approved",
          admin: true,
          onboarding: null,
        }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/onboarding" });
  });

  it("still lets an administrator reach /admin without onboarding", async () => {
    // An operational surface must never be lockable by a product gate.
    await expect(
      resolveAdminAccess(
        repository({
          userId: "admin-1",
          status: "approved",
          admin: true,
          onboarding: null,
        }),
      ),
    ).resolves.toMatchObject({ kind: "allowed", isAdmin: true });
  });

  it("lets onboarding itself run without requiring onboarding", async () => {
    await expect(
      resolveApprovedAccess(
        repository({ userId: "user-1", status: "approved", onboarding: null }),
      ),
    ).resolves.toMatchObject({ kind: "allowed", userId: "user-1" });
  });

  it("still refuses an unapproved user at the onboarding surface", async () => {
    await expect(
      resolveApprovedAccess(
        repository({ userId: "user-1", status: "pending", onboarding: null }),
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/access/pending" });
  });
});
