import { describe, expect, it, vi } from "vitest";

import { createSupabaseAccessRepository } from "./supabase-access-repository";

describe("RLS-bound Supabase access repository", () => {
  it("reads only the authenticated user's access row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: "pending", decision_reason: "Review in progress" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "verified-user" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({ select }),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    const repository = createSupabaseAccessRepository(client);

    await expect(repository.getAuthenticatedUser()).resolves.toEqual({
      id: "verified-user",
    });
    await expect(repository.getOwnAccessStatus("verified-user")).resolves.toBe(
      "pending",
    );
    expect(client.from).toHaveBeenCalledWith("access_requests");
    expect(select).toHaveBeenCalledWith("status, decision_reason");
    expect(eq).toHaveBeenCalledWith("user_id", "verified-user");
  });

  it("uses the server-controlled is_admin function without a submitted role", async () => {
    const client = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const repository = createSupabaseAccessRepository(client);

    await expect(repository.hasAdminRole("verified-user")).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("is_admin");
  });

  it("returns no identity when server verification fails", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("untrusted cookie"),
        }),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    await expect(
      createSupabaseAccessRepository(client).getAuthenticatedUser(),
    ).resolves.toBeNull();
  });
});
