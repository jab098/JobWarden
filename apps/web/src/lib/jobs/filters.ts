import { radiusOptions } from "@jobwarden/domain";
import { z } from "zod";

import {
  compensationProvenances,
  employmentTypes,
  ir35Statuses,
  jobSortOrders,
  postedWindows,
  salaryPeriods,
  workplaceTypes,
  workingTimes,
  type JobFilters,
} from "./types";

export const jobFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  location: z.string().trim().max(100).catch(""),
  radius: z.coerce
    .number()
    .int()
    .refine((value): value is (typeof radiusOptions)[number] =>
      (radiusOptions as readonly number[]).includes(value),
    )
    .nullable()
    .catch(null),
  employment: z.array(z.enum(employmentTypes)).catch([]),
  workingTime: z.array(z.enum(workingTimes)).catch([]),
  workplace: z.array(z.enum(workplaceTypes)).catch([]),
  ir35: z.array(z.enum(ir35Statuses)).catch([]),
  compensation: z.array(z.enum(compensationProvenances)).catch([]),
  sources: z.array(z.string().uuid()).max(50).catch([]),
  salaryMin: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .nullable()
    .catch(null),
  salaryPeriod: z.enum([...salaryPeriods, "all"]).catch("all"),
  posted: z.enum(postedWindows).catch("any"),
  sort: z.enum(jobSortOrders).catch("newest"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
}) satisfies z.ZodType<JobFilters>;

type JobFilterInput = Record<string, string | string[] | undefined>;

function text(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * A multi-choice field arrives once per chosen value, or once with "" when
 * nothing is chosen. Invalid entries are dropped one at a time rather than
 * voiding the rest, and duplicates collapse so a chip can never appear twice.
 */
function list(value: string | string[] | undefined): string[] {
  const raw =
    value === undefined ? [] : typeof value === "string" ? [value] : value;
  return [...new Set(raw.map((entry) => entry.trim()).filter(Boolean))];
}

function validList<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  return list(value).filter((entry): entry is T =>
    (allowed as readonly string[]).includes(entry),
  );
}

export function parseJobFilters(input: JobFilterInput): JobFilters {
  const filters = jobFilterSchema.parse({
    q: text(input.q),
    location: text(input.location),
    radius: text(input.radius)?.trim() ? text(input.radius) : null,
    employment: validList(input.employment, employmentTypes),
    workingTime: validList(input.workingTime, workingTimes),
    workplace: validList(input.workplace, workplaceTypes),
    ir35: validList(input.ir35, ir35Statuses),
    compensation: validList(input.compensation, compensationProvenances),
    sources: list(input.source).filter(
      (entry) => z.string().uuid().safeParse(entry).success,
    ),
    // An empty field is "no floor", not zero — coercing "" would otherwise
    // parse as 0 and read as a deliberate answer.
    salaryMin: text(input.salaryMin)?.trim() ? text(input.salaryMin) : null,
    salaryPeriod: text(input.salaryPeriod),
    posted: text(input.posted),
    sort: text(input.sort),
    page: text(input.page),
  });

  // A pay floor is only meaningful against a stated period, and a floor of zero
  // narrows nothing while still hiding every listing with no stated salary.
  // Half an answer applies nothing rather than misleading the result count.
  const paired =
    !filters.salaryMin || filters.salaryPeriod === "all"
      ? { ...filters, salaryMin: null, salaryPeriod: "all" as const }
      : filters;

  // A radius around nothing is not a filter. Dropping it keeps the applied-filter
  // chips honest rather than showing "within 10 miles" of no stated place.
  return paired.location ? paired : { ...paired, radius: null };
}

export function createJobFiltersQueryString(filters: JobFilters): string {
  const query = new URLSearchParams();

  if (filters.q) query.set("q", filters.q);
  if (filters.location) query.set("location", filters.location);
  if (filters.location && filters.radius !== null) {
    query.set("radius", String(filters.radius));
  }
  for (const value of filters.employment) query.append("employment", value);
  for (const value of filters.workingTime) query.append("workingTime", value);
  for (const value of filters.workplace) query.append("workplace", value);
  for (const value of filters.ir35) query.append("ir35", value);
  for (const value of filters.compensation) {
    query.append("compensation", value);
  }
  for (const value of filters.sources) query.append("source", value);
  if (filters.salaryMin !== null && filters.salaryPeriod !== "all") {
    query.set("salaryMin", String(filters.salaryMin));
    query.set("salaryPeriod", filters.salaryPeriod);
  }
  if (filters.posted !== "any") query.set("posted", filters.posted);
  if (filters.sort !== "newest") query.set("sort", filters.sort);
  if (filters.page !== 1) query.set("page", String(filters.page));

  return query.toString();
}

export function jobsHref(filters: JobFilters): string {
  const query = createJobFiltersQueryString(filters);
  return query ? `/jobs?${query}` : "/jobs";
}

/** The narrowing choices, as removable chips. Paging is not one of them. */
export type ActiveJobFilter = {
  key: string;
  label: string;
  /** The same search with this one choice lifted. */
  clearedFilters: JobFilters;
};

function without<T>(values: readonly T[], value: T): T[] {
  return values.filter((entry) => entry !== value);
}

/** One chip per chosen value, each lifting only itself. */
function listChips<
  Field extends
    "employment" | "workingTime" | "workplace" | "ir35" | "compensation",
>(
  filters: JobFilters,
  field: Field,
  label: (value: string) => string,
): ActiveJobFilter[] {
  return filters[field].map((value) => ({
    key: `${field}:${value}`,
    label: label(value),
    clearedFilters: {
      ...filters,
      [field]: without(filters[field], value),
      page: 1,
    },
  }));
}

export function activeJobFilters(
  filters: JobFilters,
  sourceLabels?: ReadonlyMap<string, string>,
): ActiveJobFilter[] {
  const active: ActiveJobFilter[] = [];

  if (filters.q) {
    active.push({
      key: "q",
      label: `“${filters.q}”`,
      clearedFilters: { ...filters, q: "", page: 1 },
    });
  }
  if (filters.location) {
    active.push({
      key: "location",
      label:
        filters.radius === null
          ? `In ${filters.location}`
          : `Within ${filters.radius} miles of ${filters.location}`,
      // The radius goes with it: a radius around nothing narrows nothing, and
      // leaving it set would resurrect itself the next time a place was typed.
      clearedFilters: { ...filters, location: "", radius: null, page: 1 },
    });
  }
  active.push(
    ...listChips(filters, "employment", (value) => value.replaceAll("_", " ")),
    ...listChips(filters, "workingTime", (value) => value.replaceAll("_", " ")),
    ...listChips(filters, "workplace", (value) => value),
    ...listChips(
      filters,
      "ir35",
      (value) => `IR35 ${value.replaceAll("_", " ")}`,
    ),
    ...listChips(filters, "compensation", (value) => `${value} salary`),
  );
  for (const source of filters.sources) {
    active.push({
      key: `source:${source}`,
      label: sourceLabels?.get(source) ?? "Selected source",
      clearedFilters: {
        ...filters,
        sources: without(filters.sources, source),
        page: 1,
      },
    });
  }
  if (filters.salaryMin !== null && filters.salaryPeriod !== "all") {
    active.push({
      key: "salary",
      label: `£${filters.salaryMin.toLocaleString("en-GB")}+ per ${filters.salaryPeriod}`,
      clearedFilters: {
        ...filters,
        salaryMin: null,
        salaryPeriod: "all",
        page: 1,
      },
    });
  }
  if (filters.posted !== "any") {
    active.push({
      key: "posted",
      label:
        filters.posted === "1"
          ? "Posted in the last 24 hours"
          : `Posted in the last ${filters.posted} days`,
      clearedFilters: { ...filters, posted: "any", page: 1 },
    });
  }

  return active;
}
