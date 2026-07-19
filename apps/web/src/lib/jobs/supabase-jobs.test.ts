// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseJobFilters } from "./filters";
import { postedSince } from "./supabase-jobs";
import { createSupabaseJobsRepository } from "./supabase-jobs";

const allFilters = parseJobFilters({});

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
  compensation_provenance: "advertised",
  posted_at: "2026-07-12T14:30:00.000Z",
  closes_at: null,
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

function searchFilter(pattern: string): string {
  return [
    `title.ilike."${pattern}"`,
    `employer.ilike."${pattern}"`,
    `description_text.ilike."${pattern}"`,
  ].join(",");
}

function createBuilder(response: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    ilike: vi.fn(),
    not: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
  };

  for (const method of [
    builder.select,
    builder.eq,
    builder.gte,
    builder.ilike,
    builder.not,
    builder.or,
    builder.order,
  ]) {
    method.mockReturnValue(builder);
  }

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
          compensationProvenance: "advertised",
          postedAt: "2026-07-12T14:30:00.000Z",
          closesAt: null,
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
      compensation: "unknown",
      page: 2,
    });

    expect(builder.eq.mock.calls).toEqual([
      ["lifecycle_status", "active"],
      ["employment_type", "contract"],
      ["working_time", "part_time"],
      ["workplace_type", "remote"],
      ["ir35_status", "inside"],
      ["compensation_provenance", "unknown"],
    ]);
    expect(builder.range).toHaveBeenCalledWith(25, 49);
  });

  it("joins location rows only while a location is actually being searched", async () => {
    // An inner join drops listings that state no location, which would be a
    // silent narrowing of an unrelated search.
    const plain = createBuilder({ data: [], error: null, count: 0 });
    await createSupabaseJobsRepository({
      from: vi.fn().mockReturnValue(plain),
    }).list(allFilters);
    expect(plain.select.mock.calls[0]?.[0]).not.toContain("!inner");
    expect(plain.ilike).not.toHaveBeenCalled();

    const located = createBuilder({ data: [], error: null, count: 0 });
    await createSupabaseJobsRepository({
      from: vi.fn().mockReturnValue(located),
    }).list({ ...allFilters, location: "Leeds" });
    expect(located.select.mock.calls[0]?.[0]).toContain(
      "job_locations!inner(raw_location)",
    );
    expect(located.ilike).toHaveBeenCalledWith(
      "job_locations.raw_location",
      "%Leeds%",
    );
  });

  it.each([
    // `ilike` carries its own value, so it needs SQL LIKE escaping only. The
    // quoted-string layer `or()` needs would arrive at SQL as literal
    // backslashes, turning "contains a percent" into a match on nothing.
    ["50%", String.raw`%50\%%`],
    ["a_b", String.raw`%a\_b%`],
    [String.raw`c\d`, String.raw`%c\\d%`],
    // PostgREST rewrites `*` to `%`, so an asterisk must not become a wildcard.
    ["*", String.raw`%\*%`],
    // A quote is not special outside a quoted operand and passes through.
    ['say "hi"', '%say "hi"%'],
  ])(
    "escapes the location pattern %s for a value-carrying filter",
    async (location, expected) => {
      const builder = createBuilder({ data: [], error: null, count: 0 });

      await createSupabaseJobsRepository({
        from: vi.fn().mockReturnValue(builder),
      }).list({ ...allFilters, location });

      expect(builder.ilike).toHaveBeenCalledWith(
        "job_locations.raw_location",
        expected,
      );
    },
  );

  it("converts a pay floor to minor units and pins it to its period", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });

    await createSupabaseJobsRepository({
      from: vi.fn().mockReturnValue(builder),
    }).list({ ...allFilters, salaryMin: 45_000, salaryPeriod: "year" });

    expect(builder.eq).toHaveBeenCalledWith("compensation_period", "year");
    expect(builder.gte).toHaveBeenCalledWith("compensation_minimum", 4_500_000);
  });

  it("excludes undated listings from a posting window rather than assuming one", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });

    await createSupabaseJobsRepository({
      from: vi.fn().mockReturnValue(builder),
    }).list({ ...allFilters, posted: "7" });

    expect(builder.not).toHaveBeenCalledWith("posted_at", "is", null);
    expect(builder.gte).toHaveBeenCalledWith(
      "posted_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it.each([
    ["1", "2026-07-16T12:00:00.000Z"],
    ["30", "2026-06-17T12:00:00.000Z"],
    ["any", null],
  ])(
    "resolves the %s posting window against a fixed clock",
    (window, expected) => {
      expect(postedSince(window, new Date("2026-07-17T12:00:00.000Z"))).toBe(
        expected,
      );
    },
  );

  it("orders by closing date, nulls last, when asked for closing soonest", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });

    await createSupabaseJobsRepository({
      from: vi.fn().mockReturnValue(builder),
    }).list({ ...allFilters, sort: "closing" });

    expect(builder.order.mock.calls).toEqual([
      ["closes_at", { ascending: true, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });

  it.each([
    {
      label: "comma",
      input: ",",
      pattern: `%,%`,
    },
    {
      label: "parentheses",
      input: "()",
      pattern: `%()%`,
    },
    {
      label: "colon",
      input: ":",
      pattern: `%:%`,
    },
    {
      label: "dot",
      input: ".",
      pattern: `%.%`,
    },
    {
      label: "double quote",
      input: `"`,
      pattern: String.raw`%\"%`,
    },
    {
      label: "backslash",
      input: "\\",
      pattern: String.raw`%\\\\%`,
    },
    {
      label: "percent",
      input: "%",
      pattern: String.raw`%\\%%`,
    },
    {
      label: "underscore",
      input: "_",
      pattern: String.raw`%\\_%`,
    },
    {
      label: "combined backslash, percent, and underscore",
      input: String.raw`\%_`,
      pattern: String.raw`%\\\\\\%\\_%`,
    },
  ])(
    "keeps $label literal inside raw PostgREST or syntax",
    async ({ input, pattern }) => {
      const builder = createBuilder({ data: [], error: null, count: 0 });
      const client = { from: vi.fn().mockReturnValue(builder) };

      await createSupabaseJobsRepository(client).list({
        ...allFilters,
        q: input,
      });

      expect(builder.or).toHaveBeenCalledWith(searchFilter(pattern));
    },
  );

  it("keeps a combined hostile search literal inside raw PostgREST or syntax", async () => {
    const builder = createBuilder({ data: [], error: null, count: 0 });
    const client = { from: vi.fn().mockReturnValue(builder) };
    const hostileSearch = String.raw`50%_ "platform"\,(or.id.eq.00000000-0000-0000-0000-000000000000)`;

    await createSupabaseJobsRepository(client).list({
      ...allFilters,
      q: hostileSearch,
    });

    const escapedPattern = String.raw`%50\\%\\_ \"platform\"\\\\,(or.id.eq.00000000-0000-0000-0000-000000000000)%`;
    expect(builder.or).toHaveBeenCalledWith(searchFilter(escapedPattern));
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

  it("ignores whitespace-only locations before deterministic selection", async () => {
    const builder = createBuilder({
      data: [
        {
          ...listRow,
          job_locations: [
            { raw_location: "   " },
            { raw_location: "Edinburgh, Scotland" },
          ],
        },
        {
          ...listRow,
          id: "d10b4459-e154-41ed-8bce-dac32eb9c5e0",
          job_locations: [{ raw_location: "\t" }],
        },
      ],
      error: null,
      count: 2,
    });
    const client = { from: vi.fn().mockReturnValue(builder) };

    const result = await createSupabaseJobsRepository(client).list(allFilters);

    expect(result.items.map((item) => item.location)).toEqual([
      "Edinburgh, Scotland",
      "UK location not specified",
    ]);
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
