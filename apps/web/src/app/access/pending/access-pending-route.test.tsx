// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createSupabaseAccessRepository: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  }),
  signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/supabase-access-repository", () => ({
  createSupabaseAccessRepository: mocks.createSupabaseAccessRepository,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/auth/sign-in/actions", () => ({ signOut: mocks.signOut }));

import AccessPendingPage from "./page";

function repository(options: {
  user?: { id: string } | null;
  status?: string | null;
  isAdmin?: boolean;
}) {
  return {
    getAuthenticatedUser: vi
      .fn()
      .mockResolvedValue(
        options.user === undefined ? { id: "user-1" } : options.user,
      ),
    getOwnAccessRecord: vi
      .fn()
      .mockResolvedValue(
        options.status === undefined || options.status === null
          ? null
          : { status: options.status },
      ),
    hasAdminRole: vi.fn().mockResolvedValue(options.isAdmin ?? false),
  };
}

describe("access pending route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
  });

  it("sends an approved user to the hub, not to a feed", async () => {
    // The hub is the one destination every set-up path agrees on.
    mocks.createSupabaseAccessRepository.mockReturnValue(
      repository({ status: "approved" }),
    );

    await expect(AccessPendingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/home");
  });

  it("sends an administrator to the hub even without an approved record", async () => {
    mocks.createSupabaseAccessRepository.mockReturnValue(
      repository({ status: null, isAdmin: true }),
    );

    await expect(AccessPendingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/home");
  });

  it("sends a signed-out visitor to sign in", async () => {
    mocks.createSupabaseAccessRepository.mockReturnValue(
      repository({ user: null }),
    );

    await expect(AccessPendingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("holds a pending user on the page rather than redirecting", async () => {
    mocks.createSupabaseAccessRepository.mockReturnValue(
      repository({ status: "pending" }),
    );

    await expect(AccessPendingPage()).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
