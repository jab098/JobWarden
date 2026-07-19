// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createJobFiltersQueryString, parseJobFilters } from "./filters";
import { createSupabaseJobsRepository } from "./supabase-jobs";

const jobId = "33333333-3333-4333-8333-333333333333";

function client(rpcRows: unknown = [{ job_id: jobId }]) {
  const calls: { rpc: unknown[][]; filters: [string, unknown][] } = {
    rpc: [],
    filters: [],
  };
  const selectedColumns: string[] = [];
  const builder = {
    select: vi.fn((columns: string) => {
      selectedColumns.push(columns);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.filters.push([`eq:${column}`, value]);
      return builder;
    }),
    gte: vi.fn(() => builder),
    ilike: vi.fn((column: string, pattern: string) => {
      calls.filters.push([`ilike:${column}`, pattern]);
      return builder;
    }),
    in: vi.fn((column: string, values: readonly string[]) => {
      calls.filters.push([`in:${column}`, [...values]]);
      return builder;
    }),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => ({ data: [], error: null, count: 0 })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  const rpc = vi.fn(
    async (name: string, parameters: Record<string, unknown>) => {
      calls.rpc.push([name, parameters]);
      return { data: rpcRows, error: null };
    },
  );
  return {
    calls,
    selectedColumns,
    client: { from: vi.fn(() => builder), rpc },
  };
}

const baseFilters = parseJobFilters({});

describe("radius search", () => {
  it("asks the database for the ids and filters the listing by them", async () => {
    const fake = client();
    await createSupabaseJobsRepository(fake.client).list({
      ...baseFilters,
      location: "Manchester",
      radius: 10,
    });

    expect(fake.calls.rpc).toEqual([
      ["jobs_within_radius", { location_text: "Manchester", radius_miles: 10 }],
    ]);
    expect(fake.calls.filters).toContainEqual(["in:id", [jobId]]);
  });

  it("drops the location join under a radius so listings are not lost to it", async () => {
    const fake = client();
    await createSupabaseJobsRepository(fake.client).list({
      ...baseFilters,
      location: "Manchester",
      radius: 10,
    });

    expect(fake.selectedColumns.join(" ")).not.toContain("job_locations!inner");
    expect(
      fake.calls.filters.some(([key]) => key.startsWith("ilike:job_locations")),
    ).toBe(false);
  });

  it("keeps the original text behaviour when no radius is set", async () => {
    const fake = client();
    await createSupabaseJobsRepository(fake.client).list({
      ...baseFilters,
      location: "Manchester",
      radius: null,
    });

    expect(fake.calls.rpc).toEqual([]);
    expect(fake.selectedColumns.join(" ")).toContain("job_locations!inner");
    expect(fake.calls.filters).toContainEqual([
      "ilike:job_locations.raw_location",
      "%Manchester%",
    ]);
  });

  it("returns nothing rather than everything when no job is in range", async () => {
    // Skipping the filter on an empty id set would widen a ten-mile search to
    // the whole country, which is the worst possible way to be wrong.
    const fake = client([]);
    await createSupabaseJobsRepository(fake.client).list({
      ...baseFilters,
      location: "Manchester",
      radius: 5,
    });

    expect(fake.calls.filters).toContainEqual(["in:id", []]);
  });

  it("does not consult the database when there is no place to measure from", async () => {
    const fake = client();
    await createSupabaseJobsRepository(fake.client).list({
      ...baseFilters,
      location: "",
      radius: 10,
    });

    expect(fake.calls.rpc).toEqual([]);
  });
});

describe("radius in the URL", () => {
  it("survives a round trip", () => {
    const filters = parseJobFilters({ location: "Leeds", radius: "20" });
    expect(filters.radius).toBe(20);
    expect(createJobFiltersQueryString(filters)).toContain("radius=20");
  });

  it("refuses a radius the product does not offer", () => {
    expect(
      parseJobFilters({ location: "Leeds", radius: "7" }).radius,
    ).toBeNull();
    expect(
      parseJobFilters({ location: "Leeds", radius: "999999" }).radius,
    ).toBeNull();
    expect(
      parseJobFilters({ location: "Leeds", radius: "abc" }).radius,
    ).toBeNull();
  });

  it("drops a radius that has no location to surround", () => {
    const filters = parseJobFilters({ radius: "10" });
    expect(filters.radius).toBeNull();
    expect(createJobFiltersQueryString(filters)).not.toContain("radius");
  });
});
