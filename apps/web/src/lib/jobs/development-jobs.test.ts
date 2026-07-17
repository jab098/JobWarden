// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDevelopmentJobsRepository } from "./development-jobs";
import { createJobsRepository } from "./repository";

const allFilters = {
  q: "",
  employment: "all" as const,
  workingTime: "all" as const,
  workplace: "all" as const,
  ir35: "all" as const,
  page: 1,
};

describe("fictional development jobs", () => {
  it("applies text and category filters with AND semantics", async () => {
    const repository = createDevelopmentJobsRepository();

    await expect(
      repository.list({
        ...allFilters,
        q: "north",
        employment: "contract",
        workplace: "hybrid",
        ir35: "outside",
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          title: "Platform Engineer",
          employer: "Fictional North Coast Systems Ltd",
        }),
      ],
      latestListingUpdate: "2026-07-17T08:00:00.000Z",
    });

    await expect(
      repository.list({
        ...allFilters,
        q: "civic evidence",
        workingTime: "full_time",
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: "Public Policy Researcher" })],
    });
  });

  it("uses stable posted-at then id ordering and fixed page semantics", async () => {
    const repository = createDevelopmentJobsRepository();

    const pageOne = await repository.list(allFilters);
    const pageTwo = await repository.list({ ...allFilters, page: 2 });

    expect(pageOne.items.map((item) => item.title)).toEqual([
      "Digital Delivery Lead",
      "Senior Software Engineer",
      "Public Policy Researcher",
      "Customer Support Specialist",
      "Platform Engineer",
      "Data Migration Analyst",
    ]);
    expect(pageOne).toMatchObject({
      total: 6,
      page: 1,
      pageSize: 25,
      latestListingUpdate: "2026-07-17T08:40:00.000Z",
    });
    expect(pageTwo).toMatchObject({
      items: [],
      total: 6,
      page: 2,
      pageSize: 25,
      latestListingUpdate: null,
    });
  });

  it("returns an empty page and no listing update when filters match nothing", async () => {
    const repository = createDevelopmentJobsRepository();

    await expect(
      repository.list({ ...allFilters, q: "no such fictional role" }),
    ).resolves.toMatchObject({
      items: [],
      total: 0,
      latestListingUpdate: null,
    });
  });

  it.each(["north%", "north_", "north\\"])(
    "treats search punctuation literally for fixture parity: %s",
    async (q) => {
      const repository = createDevelopmentJobsRepository();

      await expect(
        repository.list({ ...allFilters, q }),
      ).resolves.toMatchObject({
        items: [],
        total: 0,
      });
    },
  );

  it("covers the UK employment and contract states needed for local UI work", async () => {
    const repository = createDevelopmentJobsRepository();
    const result = await repository.list(allFilters);

    expect(result.dataMode).toBe("fixtures");
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employmentType: "permanent" }),
        expect.objectContaining({ employmentType: "fixed_term" }),
        expect.objectContaining({ workingTime: "part_time" }),
        expect.objectContaining({ workplaceType: "remote" }),
        expect.objectContaining({ workplaceType: "hybrid" }),
        expect.objectContaining({
          employmentType: "contract",
          ir35Status: "inside",
        }),
        expect.objectContaining({
          employmentType: "contract",
          ir35Status: "outside",
        }),
        expect.objectContaining({
          employmentType: "contract",
          ir35Status: "unknown",
        }),
      ]),
    );
  });

  it("uses valid identifiers and explicitly fictional application hosts", async () => {
    const repository = createDevelopmentJobsRepository();
    const result = await repository.list(allFilters);

    for (const item of result.items) {
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const detail = await repository.findById(item.id);
      expect(detail).not.toBeNull();
      expect(new URL(detail!.applicationUrl)).toMatchObject({
        protocol: "https:",
        hostname: "example.test",
      });
      expect(detail!.sourceLabel).toMatch(/fictional/i);
      expect(detail!.ukEligibilityEvidence.length).toBeGreaterThan(0);
    }
  });

  it("stores representative annual and day compensation in minor GBP units", async () => {
    const repository = createDevelopmentJobsRepository();
    const result = await repository.list(allFilters);

    expect(
      result.items.find((item) => item.title === "Senior Software Engineer"),
    ).toMatchObject({
      compensationMinimum: 7_200_000,
      compensationMaximum: 8_400_000,
      compensationPeriod: "year",
    });
    expect(
      result.items.find((item) => item.title === "Digital Delivery Lead"),
    ).toMatchObject({
      compensationMinimum: 55_000,
      compensationMaximum: 60_000,
      compensationPeriod: "day",
    });
  });
});

describe("jobs repository selection", () => {
  it("selects fixtures without constructing a Supabase repository in local mode", async () => {
    const createSupabaseRepository = vi.fn();
    const repository = createJobsRepository(
      { nodeEnv: "development", bypassFlag: "true" },
      createSupabaseRepository,
    );

    expect(createSupabaseRepository).not.toHaveBeenCalled();
    await expect(repository.list(allFilters)).resolves.toMatchObject({
      dataMode: "fixtures",
    });
  });

  it("uses the supplied production repository when local mode is disabled", () => {
    const supabaseRepository = createDevelopmentJobsRepository();
    const createSupabaseRepository = vi.fn(() => supabaseRepository);

    expect(
      createJobsRepository(
        { nodeEnv: "production", bypassFlag: undefined },
        createSupabaseRepository,
      ),
    ).toBe(supabaseRepository);
    expect(createSupabaseRepository).toHaveBeenCalledOnce();
  });
});
