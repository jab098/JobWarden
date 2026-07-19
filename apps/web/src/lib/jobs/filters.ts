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
  employment: z.enum([...employmentTypes, "all"]).catch("all"),
  workingTime: z.enum([...workingTimes, "all"]).catch("all"),
  workplace: z.enum([...workplaceTypes, "all"]).catch("all"),
  ir35: z.enum([...ir35Statuses, "all"]).catch("all"),
  compensation: z.enum([...compensationProvenances, "all"]).catch("all"),
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

export function parseJobFilters(input: JobFilterInput): JobFilters {
  const filters = jobFilterSchema.parse({
    q: text(input.q),
    location: text(input.location),
    employment: text(input.employment),
    workingTime: text(input.workingTime),
    workplace: text(input.workplace),
    ir35: text(input.ir35),
    compensation: text(input.compensation),
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
  return !filters.salaryMin || filters.salaryPeriod === "all"
    ? { ...filters, salaryMin: null, salaryPeriod: "all" }
    : filters;
}

export function createJobFiltersQueryString(filters: JobFilters): string {
  const query = new URLSearchParams();

  if (filters.q) query.set("q", filters.q);
  if (filters.location) query.set("location", filters.location);
  if (filters.employment !== "all") {
    query.set("employment", filters.employment);
  }
  if (filters.workingTime !== "all") {
    query.set("workingTime", filters.workingTime);
  }
  if (filters.workplace !== "all") {
    query.set("workplace", filters.workplace);
  }
  if (filters.ir35 !== "all") query.set("ir35", filters.ir35);
  if (filters.compensation && filters.compensation !== "all") {
    query.set("compensation", filters.compensation);
  }
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

const removals: readonly {
  key: string;
  label: (filters: JobFilters) => string | null;
  clear: (filters: JobFilters) => Partial<JobFilters>;
}[] = [
  {
    key: "q",
    label: (filters) => (filters.q ? `“${filters.q}”` : null),
    clear: () => ({ q: "" }),
  },
  {
    key: "location",
    label: (filters) => (filters.location ? `In ${filters.location}` : null),
    clear: () => ({ location: "" }),
  },
  {
    key: "employment",
    label: (filters) =>
      filters.employment === "all"
        ? null
        : filters.employment.replaceAll("_", " "),
    clear: () => ({ employment: "all" }),
  },
  {
    key: "workingTime",
    label: (filters) =>
      filters.workingTime === "all"
        ? null
        : filters.workingTime.replaceAll("_", " "),
    clear: () => ({ workingTime: "all" }),
  },
  {
    key: "workplace",
    label: (filters) =>
      filters.workplace === "all" ? null : filters.workplace,
    clear: () => ({ workplace: "all" }),
  },
  {
    key: "ir35",
    label: (filters) =>
      filters.ir35 === "all"
        ? null
        : `IR35 ${filters.ir35.replaceAll("_", " ")}`,
    clear: () => ({ ir35: "all" }),
  },
  {
    key: "compensation",
    label: (filters) =>
      filters.compensation === "all" ? null : `${filters.compensation} salary`,
    clear: () => ({ compensation: "all" }),
  },
  {
    key: "salary",
    label: (filters) =>
      filters.salaryMin === null || filters.salaryPeriod === "all"
        ? null
        : `£${filters.salaryMin.toLocaleString("en-GB")}+ per ${filters.salaryPeriod}`,
    clear: () => ({ salaryMin: null, salaryPeriod: "all" as const }),
  },
  {
    key: "posted",
    label: (filters) =>
      filters.posted === "any"
        ? null
        : filters.posted === "1"
          ? "Posted in the last 24 hours"
          : `Posted in the last ${filters.posted} days`,
    clear: () => ({ posted: "any" as const }),
  },
];

export function activeJobFilters(filters: JobFilters): ActiveJobFilter[] {
  const active: ActiveJobFilter[] = [];
  for (const removal of removals) {
    const label = removal.label(filters);
    if (label === null) continue;
    active.push({
      key: removal.key,
      label,
      // Lifting one choice returns to the first page: the page the user was on
      // may not exist in the wider result set.
      clearedFilters: { ...filters, ...removal.clear(filters), page: 1 },
    });
  }
  return active;
}
