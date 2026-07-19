// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readApplicationRecords: vi.fn(),
  toDashboardApplications: vi.fn(),
  getExplore: vi.fn(),
  getSnapshot: vi.fn(),
  getFeed: vi.fn(),
}));
vi.mock("@/lib/applications/supabase-applications", () => ({
  readApplicationRecords: mocks.readApplicationRecords,
  toDashboardApplications: mocks.toDashboardApplications,
}));
vi.mock("@/lib/explore/supabase-explore", () => ({
  createSupabaseExploreRepository: () => ({ getExplore: mocks.getExplore }),
}));
vi.mock("@/lib/profile/supabase-profile", () => ({
  createSupabaseProfileRepository: () => ({ getSnapshot: mocks.getSnapshot }),
}));
vi.mock("@/lib/target-feed/supabase-target-feed", () => ({
  createSupabaseTargetFeedRepository: () => ({ getFeed: mocks.getFeed }),
}));

import { createSupabaseDashboardRepository } from "./supabase-dashboard";

const jobId = "0d74a055-d0e6-4f50-a77a-9c8fd8543af3";

function client(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, { data: unknown; error: unknown }> = {
    career_job_decisions: { data: [], error: null },
    career_notification_deliveries: { data: [], error: null },
    career_pathway_decisions: { data: [], error: null },
    jobs: {
      data: [{ id: jobId, first_seen_at: "2026-07-20T06:00:00.000Z" }],
      error: null,
    },
    ...overrides,
  };

  return {
    from: vi.fn((table: string) => {
      const response = Promise.resolve(responses[table]!);
      const chain = {
        in: () => ({ limit: () => response }),
        maybeSingle: () => response,
        order: () => ({ limit: () => response }),
      };
      return { select: () => Object.assign(response, chain) };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readApplicationRecords.mockResolvedValue([]);
  mocks.toDashboardApplications.mockReturnValue([]);
  mocks.getExplore.mockResolvedValue({
    enabled: true,
    items: [{}, {}, {}],
    dismissed: [{}],
    dataMode: "supabase",
  });
  mocks.getSnapshot.mockResolvedValue({
    evidence: [{ confirmationState: "confirmed" }],
    searches: [{ enabled: true }],
    currentCv: { kind: "docx" },
    dataMode: "supabase",
  });
  mocks.getFeed.mockResolvedValue({
    items: [{ job: { id: jobId }, explanation: { profileName: "Analytics" } }],
    enabledProfileNames: ["Analytics"],
  });
});

describe("supabase dashboard repository", () => {
  it("reports the qualifying count Explore itself would show", async () => {
    const dashboard =
      await createSupabaseDashboardRepository(client()).getDashboard(7);

    expect(dashboard.explore.qualifyingCount).toBe(3);
    expect(mocks.getExplore).toHaveBeenCalled();
  });

  it("reports explore as off without claiming zero qualifying pathways", async () => {
    mocks.getExplore.mockResolvedValue({
      enabled: false,
      items: [],
      dismissed: [],
      dataMode: "supabase",
    });

    const dashboard =
      await createSupabaseDashboardRepository(client()).getDashboard(7);

    expect(dashboard.explore.enabled).toBe(false);
  });

  it("takes the match count from the Target Feed rather than a second estimate", async () => {
    const dashboard =
      await createSupabaseDashboardRepository(client()).getDashboard(7);

    expect(dashboard.targetFeed.currentMatchCount).toBe(1);
    expect(dashboard.targetFeed.topProfileName).toBe("Analytics");
    expect(mocks.getFeed).toHaveBeenCalledWith({ includeDismissed: false });
  });

  it("drops a match whose first-seen date could not be read", async () => {
    const dashboard = await createSupabaseDashboardRepository(
      client({ jobs: { data: [], error: null } }),
    ).getDashboard(7);

    // Counting it in the trend without a date would place it on an arbitrary
    // day; the current match count still reflects the feed.
    expect(dashboard.targetFeed.byDay.every((day) => day.count === 0)).toBe(
      true,
    );
  });

  it("counts digest outcomes by status", async () => {
    const dashboard = await createSupabaseDashboardRepository(
      client({
        career_notification_deliveries: {
          data: [
            { status: "sent", created_at: "2026-07-19T08:10:00.000Z" },
            {
              status: "suppressed_no_matches",
              created_at: "2026-07-19T11:10:00.000Z",
            },
          ],
          error: null,
        },
      }),
    ).getDashboard(7);

    expect(dashboard.digests).toMatchObject({ sent: 1, noMatchSlots: 1 });
  });

  it("raises a sanitised error when a read fails", async () => {
    await expect(
      createSupabaseDashboardRepository(
        client({
          career_job_decisions: { data: null, error: { message: "denied" } },
        }),
      ).getDashboard(7),
    ).rejects.toThrow("Unable to load your dashboard");
  });

  it("does not leak the underlying failure", async () => {
    mocks.getSnapshot.mockRejectedValue(
      new Error("connection to 10.0.0.5 refused"),
    );

    await expect(
      createSupabaseDashboardRepository(client()).getDashboard(7),
    ).rejects.toThrow(/^Unable to load your dashboard$/);
  });
});
