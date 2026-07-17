import { describe, expect, it, vi } from "vitest";

import { bootstrapAdmin } from "./bootstrap-admin.mjs";

const adminUserId = "5f32d2ad-a91d-467b-a491-1e2193e69d18";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://jobwarden.example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
    ADMIN_BOOTSTRAP_USER_ID: adminUserId,
    ...overrides,
  };
}

function fakeSupabase(options?: {
  user?: Record<string, unknown> | null;
  identityError?: { message: string } | null;
  auditWriteFailure?: boolean;
}) {
  const roles = new Set<string>();
  const auditEvents: Array<Record<string, unknown>> = [];
  const getUserById = vi.fn(async () => ({
    data: {
      user:
        options?.user === undefined
          ? {
              id: adminUserId,
              email: "owner@example.test",
              email_confirmed_at: "2026-07-17T08:00:00Z",
              identities: [],
            }
          : options.user,
    },
    error: options?.identityError ?? null,
  }));
  const rpc = vi.fn(
    async (functionName: string, args: Record<string, unknown>) => {
      if (functionName !== "bootstrap_admin") {
        throw new Error(`Unexpected RPC: ${functionName}`);
      }

      if (options?.auditWriteFailure) {
        return { data: null, error: { message: "audit write failed" } };
      }

      roles.add(`${args.target_user_id}:admin`);
      auditEvents.push({
        actor_user_id: args.target_user_id,
        action: "admin.bootstrap",
        resource_type: "user_role",
        resource_id: args.target_user_id,
        metadata: { method: "local_service_role" },
      });
      return { data: null, error: null };
    },
  );

  const client = {
    auth: { admin: { getUserById } },
    rpc,
  };

  return { client, roles, auditEvents, getUserById, rpc };
}

describe("administrator bootstrap", () => {
  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_BOOTSTRAP_USER_ID",
  ])("fails closed when %s is missing", async (missingVariable) => {
    const createClient = vi.fn();

    await expect(
      bootstrapAdmin({
        env: environment({ [missingVariable]: undefined }),
        createClient,
        write: vi.fn(),
      }),
    ).rejects.toThrow(
      `Missing required environment variable: ${missingVariable}`,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid administrator UUID before creating a client", async () => {
    const createClient = vi.fn();

    await expect(
      bootstrapAdmin({
        env: environment({ ADMIN_BOOTSTRAP_USER_ID: "owner@example.test" }),
        createClient,
        write: vi.fn(),
      }),
    ).rejects.toThrow("ADMIN_BOOTSTRAP_USER_ID must be a UUID");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("fetches the exact UUID and rejects an unverified identity", async () => {
    const fake = fakeSupabase({
      user: {
        id: adminUserId,
        email: "unverified@example.test",
        email_confirmed_at: null,
        identities: [{ provider: "email", identity_data: {} }],
      },
    });

    await expect(
      bootstrapAdmin({
        env: environment(),
        createClient: () => fake.client,
        write: vi.fn(),
      }),
    ).rejects.toThrow("A verified Supabase identity is required");
    expect(fake.getUserById).toHaveBeenCalledExactlyOnceWith(adminUserId);
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.auditEvents).toHaveLength(0);
  });

  it("accepts a confirmed external identity without trusting user metadata", async () => {
    const fake = fakeSupabase({
      user: {
        id: adminUserId,
        email: null,
        email_confirmed_at: null,
        user_metadata: { role: "admin" },
        identities: [
          {
            provider: "google",
            identity_data: { email_verified: true },
          },
        ],
      },
    });

    await bootstrapAdmin({
      env: environment(),
      createClient: () => fake.client,
      write: vi.fn(),
    });

    expect(fake.roles).toEqual(new Set([`${adminUserId}:admin`]));
  });

  it("is idempotent and audits every bootstrap execution", async () => {
    const fake = fakeSupabase();
    const createClient = vi.fn(() => fake.client);

    await bootstrapAdmin({ env: environment(), createClient, write: vi.fn() });
    await bootstrapAdmin({ env: environment(), createClient, write: vi.fn() });

    expect(fake.roles).toEqual(new Set([`${adminUserId}:admin`]));
    expect(fake.rpc).toHaveBeenCalledTimes(2);
    expect(fake.rpc).toHaveBeenNthCalledWith(1, "bootstrap_admin", {
      target_user_id: adminUserId,
    });
    expect(fake.auditEvents).toHaveLength(2);
    expect(fake.auditEvents[0]).toMatchObject({
      actor_user_id: adminUserId,
      action: "admin.bootstrap",
      resource_type: "user_role",
      resource_id: adminUserId,
    });
  });

  it("leaves no role behind when the atomic bootstrap RPC fails its audit write", async () => {
    const fake = fakeSupabase({ auditWriteFailure: true });

    await expect(
      bootstrapAdmin({
        env: environment(),
        createClient: () => fake.client,
        write: vi.fn(),
      }),
    ).rejects.toThrow("Atomic administrator bootstrap failed");

    expect(fake.rpc).toHaveBeenCalledExactlyOnceWith("bootstrap_admin", {
      target_user_id: adminUserId,
    });
    expect(fake.roles).toEqual(new Set());
    expect(fake.auditEvents).toEqual([]);
  });

  it("redacts output and does not persist identity details in audit metadata", async () => {
    const fake = fakeSupabase();
    const output: string[] = [];

    await bootstrapAdmin({
      env: environment(),
      createClient: () => fake.client,
      write: (message) => output.push(message),
    });

    const visibleOutput = output.join("\n");
    expect(visibleOutput).toBe("Administrator bootstrap complete.");
    expect(visibleOutput).not.toContain("service-role-secret-value");
    expect(visibleOutput).not.toContain(adminUserId);
    expect(visibleOutput).not.toContain("owner@example.test");
    expect(fake.auditEvents[0]?.metadata).toEqual({
      method: "local_service_role",
    });
  });
});
