import { describe, expect, it } from "vitest";

import {
  resolveAdminAccess,
  resolveProtectedAccess,
  type AccessRepository,
} from "./access";

function repository(
  options: {
    userId?: string;
    status?: "pending" | "approved" | "rejected" | "suspended" | null;
    admin?: boolean;
  } = {},
): AccessRepository {
  return {
    getAuthenticatedUser: async () =>
      options.userId === undefined ? null : { id: options.userId },
    getOwnAccessStatus: async () => options.status ?? null,
    hasAdminRole: async () => options.admin ?? false,
  };
}

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
