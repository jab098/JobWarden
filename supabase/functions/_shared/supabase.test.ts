import { describe, expect, it, vi } from "vitest";

import { createServiceRoleClient } from "./supabase";

describe("shared service-role client", () => {
  it("creates a per-invocation non-persistent client", () => {
    const createClient = vi.fn(() => ({ rpc: vi.fn() }));

    const client = createServiceRoleClient(
      {
        supabaseUrl: "https://fixture.supabase.co",
        serviceRoleKey: "fixture-service-role-key-with-adequate-length",
      },
      createClient,
    );

    expect(client).toEqual({ rpc: expect.any(Function) });
    expect(createClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      "fixture-service-role-key-with-adequate-length",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });

  it("accepts a function's fuller runtime environment", () => {
    const createClient = vi.fn(() => ({ rpc: vi.fn() }));
    const ingestionEnvironment = {
      supabaseUrl: "https://fixture.supabase.co",
      serviceRoleKey: "fixture-service-role-key-with-adequate-length",
      cronSecret: "cron-fixture-".repeat(3),
    };

    createServiceRoleClient(ingestionEnvironment, createClient);

    expect(createClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      "fixture-service-role-key-with-adequate-length",
      expect.anything(),
    );
  });
});
