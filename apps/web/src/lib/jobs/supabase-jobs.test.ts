// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { JobFilters } from "./types";
import { createSupabaseJobsRepository } from "./supabase-jobs";

const allFilters: JobFilters = {
  q: "",
  employment: "all",
  workingTime: "all",
  workplace: "all",
  ir35: "all",
  page: 1,
};

const listRow = {
  id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
  title: "Platform Engineer",
  employer: "Example Employer",
  employment_type: "contract",
  working_time: "full_time",
  workplace_type: "hybrid",
  ir35_status: "outside",
  compensation_minimum: 62_500,
  compensation_maximum: 70_000,
  compensation_currency: "GBP",
  compensation_period: "day",
  posted_at: "2026-07-12T14:30:00.000Z",
  last_seen_at: "2026-07-17T08:00:00.000Z",
  job_locations: [
    { raw_location: "Manchester, England" },
    { raw_location: "Edinburgh, Scotland" },
  ],
};

const detailRow = {
  ...listRow,
  description_text: "A plain-text UK contract listing.",
  application_url: "https://example.test/apply/platform-engineer",
  uk_eligibility_evidence: ["Location: Edinburgh, Scotland"],
};

function createBuilder(response: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);

  return builder;
}

describe("RLS-bound Supabase jobs list", () => {
  it("queries active rows with exact count, stable order, and page-one range", async () => {
    const builder = createBuilder({ data: [listRow], error: null, count: 1 });
    const client = { from: vi.fn().mockReturnValue(builder) };

    const result = await createSupabaseJobsRepository(client).list(allFilters);

    expect(client.from).toHaveBeenCalledWith("jobs");
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining("job_locations(raw_location)"),
      { count: "exact" },
    );
    expect(builder.select.mock.calls[0]?.[0]).not.toContain("job_sources");
    expect(builder.eq).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("lifecycle_status", "active");
    expect(builder.or).not.toHaveBeenCalled();
    expect(builder.order.mock.calls).toEqual([
      ["posted_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
    expect(builder.range).toHaveBeenCalledWith(0, 24);
    expect(result).toEqual({
      items: [
        {
          id: listRow.id,
          title: "Platform Engineer",
          employer: "Example Employer",
          location: "Edinburgh, Scotland",
          employmentType: "contract",
          workingTime: "full_time",
          workplaceType: "hybrid",
          ir35Status: "outside",
          compensationMinimum: 62_500,
          compensationMaximum: 70_000,
          compensationCurrency: "GBP",
          compensationPeriod: "day",
          postedAt: "2026-07-12T14:30:00.000Z",
        },
      ],
      total: 1,
      latestListingUpdate: "2026-07-17T08:00:00.000Z",
      page: 1,
      pageSize: 25,
      dataMode: "supabase",
    });
  });

  it("applies selected category filters and the page-two range", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });
    const client = { from: vi.fn().mockReturnValue(builder) };

    await createSupabaseJobsRepository(client).list({
      ...allFilters,
      employment: "contract",
      workingTime: "part_time",
      workplace: "remote",
      ir35: "inside",
      page: 2,
    });

    expect(builder.eq.mock.calls).toEqual([
      ["lifecycle_status", "active"],
      ["employment_type", "contract"],
      ["working_time", "part_time"],
      ["workplace_type", "remote"],
      ["ir35_status", "inside"],
    ]);
    expect(builder.range).toHaveBeenCalledWith(25, 49);
  });

  it("keeps adversarial search text literal inside raw PostgREST or syntax", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });
    const client = { from: vi.fn().mockReturnValue(builder) };
    const hostileSearch = String.raw`50%_ "platform"\,(or.id.eq.00000000-0000-0000-0000-000000000000)`;

    await createSupabaseJobsRepository(client).list({
      ...allFilters,
      q: hostileSearch,
    });

    const escapedPattern = String.raw`%50\%\_ \"platform\"\\,(or.id.eq.00000000-0000-0000-0000-000000000000)%`;
    expect(builder.or).toHaveBeenCalledWith(
      `title.ilike."${escapedPattern}",employer.ilike."${escapedPattern}"`,
    );
  });

  it("maps missing locations and the newest visible last-seen timestamp safely", async () => {
    const builder = createBuilder({
      data: [
        { ...listRow, job_locations: null },
        {
          ...listRow,
          id: "d10b4459-e154-41ed-8bce-dac32eb9c5e0",
          last_seen_at: "2026-07-17T09:00:00.000Z",
          job_locations: [],
        },
      ],
      error: null,
      count: 2,
    });
    const client = { from: vi.fn().mockReturnValue(builder) };

    const result = await createSupabaseJobsRepository(client).list(allFilters);

    expect(result.items.map((item) => item.location)).toEqual([
      "UK location not specified",
      "UK location not specified",
    ]);
    expect(result.latestListingUpdate).toBe("2026-07-17T09:00:00.000Z");
  });

  it.each([
    {
      response: {
        data: null,
        error: { message: "provider payload" },
        count: null,
      },
      label: "provider errors",
    },
    {
      response: {
        data: [{ ...listRow, employment_type: "invented" }],
        error: null,
        count: 1,
      },
      label: "invalid rows",
    },
    {
      response: { data: [], error: null, count: null },
      label: "missing exact counts",
    },
  ])("uses a generic error for $label", async ({ response }) => {
    const builder = createBuilder(response);
    const client = { from: vi.fn().mockReturnValue(builder) };

    await expect(
      createSupabaseJobsRepository(client).list(allFilters),
    ).rejects.toThrow("Unable to load jobs");
  });
});

describe("RLS-bound Supabase job detail", () => {
  it("rejects invalid UUIDs without issuing a query", async () => {
    const client = { from: vi.fn() };

    await expect(
      createSupabaseJobsRepository(client).findById("not-a-uuid"),
    ).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("requires an active UUID row and uses maybeSingle", async () => {
    const builder = createBuilder({ data: detailRow, error: null });
    const client = { from: vi.fn().mockReturnValue(builder) };

    const detail = await createSupabaseJobsRepository(client).findById(
      detailRow.id,
    );

    expect(builder.select.mock.calls[0]?.[0]).not.toContain("job_sources");
    expect(builder.eq.mock.calls).toEqual([
      ["lifecycle_status", "active"],
      ["id", detailRow.id],
    ]);
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
    expect(detail).toMatchObject({
      id: detailRow.id,
      location: "Edinburgh, Scotland",
      descriptionText: "A plain-text UK contract listing.",
      applicationUrl: "https://example.test/apply/platform-engineer",
      ukEligibilityEvidence: ["Location: Edinburgh, Scotland"],
      sourceLabel: "External job listing",
      lastSeenAt: "2026-07-17T08:00:00.000Z",
    });
  });

  it("returns null when maybeSingle has no row", async () => {
    const builder = createBuilder({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(builder) };

    await expect(
      createSupabaseJobsRepository(client).findById(detailRow.id),
    ).resolves.toBeNull();
  });

  it("uses the same generic error boundary for detail failures", async () => {
    const builder = createBuilder({
      data: null,
      error: { message: "secret provider detail" },
    });
    const client = { from: vi.fn().mockReturnValue(builder) };

    await expect(
      createSupabaseJobsRepository(client).findById(detailRow.id),
    ).rejects.toThrow("Unable to load jobs");
  });
});
