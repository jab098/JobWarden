// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSupabaseNotificationsRepository,
  createSupabaseUnsubscribeRepository,
} from "./supabase-notifications";

const snapshot = {
  generation: 1,
  draft: null,
  evidence: [],
  currentCv: null,
  suggestions: [],
  searches: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Analytics implementation",
      enabled: true,
      notificationsEnabled: true,
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Quiet search",
      enabled: true,
      notificationsEnabled: false,
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      name: "Disabled search",
      enabled: false,
      notificationsEnabled: true,
    },
  ],
  uploadCapability: { enabled: false, reason: "fictional_preview" },
  dataMode: "supabase" as const,
};

vi.mock("@/lib/profile/supabase-profile", () => ({
  createSupabaseProfileRepository: () => ({
    getSnapshot: async () => snapshot,
  }),
}));

const deliveryRow = {
  id: "a0000000-0000-4000-8000-000000000001",
  slot_key: "2026-07-20T09",
  status: "sent",
  match_count: 3,
  created_at: "2026-07-20T08:10:00.000Z",
};

function client(options: {
  settings?: unknown;
  settingsError?: unknown;
  deliveries?: unknown;
  rpc?: ReturnType<typeof vi.fn>;
}) {
  const limit = vi.fn().mockResolvedValue({
    data: options.deliveries ?? [deliveryRow],
    error: null,
  });
  const order = vi.fn().mockReturnValue({ limit });
  const deliverySelect = vi.fn().mockReturnValue({ order });
  const maybeSingle = vi.fn().mockResolvedValue({
    // `??` would swallow a deliberate null, which is the opted-out case.
    data: "settings" in options ? options.settings : { channel_enabled: true },
    error: options.settingsError ?? null,
  });
  const settingsSelect = vi.fn().mockReturnValue({ maybeSingle });

  return {
    from: vi.fn((table: string) =>
      table === "career_notification_settings"
        ? { select: settingsSelect }
        : { select: deliverySelect },
    ),
    rpc: options.rpc ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    order,
    limit,
  };
}

describe("getSettings", () => {
  it("returns the channel state, notifying profiles, and recent slots", async () => {
    const stub = client({});

    const result =
      await createSupabaseNotificationsRepository(stub).getSettings();

    expect(result).toEqual({
      channelEnabled: true,
      notifyingProfileNames: ["Analytics implementation"],
      recentDeliveries: [
        {
          id: "a0000000-0000-4000-8000-000000000001",
          slotKey: "2026-07-20T09",
          status: "sent",
          matchCount: 3,
          createdAt: "2026-07-20T08:10:00.000Z",
        },
      ],
      dataMode: "supabase",
    });
  });

  it("treats a missing settings row as opted out", async () => {
    const stub = client({ settings: null });

    await expect(
      createSupabaseNotificationsRepository(stub).getSettings(),
    ).resolves.toMatchObject({ channelEnabled: false });
  });

  it("lists newest slots first and bounds the history", async () => {
    const stub = client({});

    await createSupabaseNotificationsRepository(stub).getSettings();

    expect(stub.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(stub.limit).toHaveBeenCalledWith(10);
  });

  it("raises a sanitised error when a read fails", async () => {
    const stub = client({ settingsError: { message: "denied" } });

    await expect(
      createSupabaseNotificationsRepository(stub).getSettings(),
    ).rejects.toThrow("Unable to load notification settings");
  });

  it("rejects an unknown delivery status rather than rendering it", async () => {
    const stub = client({
      deliveries: [{ ...deliveryRow, status: "bounced" }],
    });

    await expect(
      createSupabaseNotificationsRepository(stub).getSettings(),
    ).rejects.toThrow("Unable to load notification settings");
  });
});

describe("setChannelEnabled", () => {
  it("calls the owner-fenced RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const stub = client({ rpc });

    await createSupabaseNotificationsRepository(stub).setChannelEnabled(true);

    expect(rpc).toHaveBeenCalledWith("set_career_notification_settings", {
      target_enabled: true,
    });
  });

  it("raises a sanitised error when the RPC fails", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "denied" } });

    await expect(
      createSupabaseNotificationsRepository(client({ rpc })).setChannelEnabled(
        false,
      ),
    ).rejects.toThrow("Unable to update notification settings");
  });
});

describe("unsubscribe", () => {
  it("passes the token to the anon-executable RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await createSupabaseUnsubscribeRepository(client({ rpc })).unsubscribe(
      "40000000-0000-4000-8000-000000000001",
    );

    expect(rpc).toHaveBeenCalledWith("unsubscribe_career_notifications", {
      target_token: "40000000-0000-4000-8000-000000000001",
    });
  });

  it("resolves identically for a token that matched nothing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });

    await expect(
      createSupabaseUnsubscribeRepository(client({ rpc })).unsubscribe(
        "40000000-0000-4000-8000-0000000000ff",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a token that is not a UUID before calling the database", async () => {
    const rpc = vi.fn();

    await expect(
      createSupabaseUnsubscribeRepository(client({ rpc })).unsubscribe(
        "not-a-token",
      ),
    ).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});
