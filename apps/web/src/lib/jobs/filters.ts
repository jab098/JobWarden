import { z } from "zod";

import {
  employmentTypes,
  ir35Statuses,
  workplaceTypes,
  workingTimes,
  type JobFilters,
} from "./types";

export const jobFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  employment: z.enum([...employmentTypes, "all"]).catch("all"),
  workingTime: z.enum([...workingTimes, "all"]).catch("all"),
  workplace: z.enum([...workplaceTypes, "all"]).catch("all"),
  ir35: z.enum([...ir35Statuses, "all"]).catch("all"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
}) satisfies z.ZodType<JobFilters>;

type JobFilterInput = Record<string, string | string[] | undefined>;

export function parseJobFilters(input: JobFilterInput): JobFilters {
  return jobFilterSchema.parse({
    q: typeof input.q === "string" ? input.q : undefined,
    employment:
      typeof input.employment === "string" ? input.employment : undefined,
    workingTime:
      typeof input.workingTime === "string" ? input.workingTime : undefined,
    workplace:
      typeof input.workplace === "string" ? input.workplace : undefined,
    ir35: typeof input.ir35 === "string" ? input.ir35 : undefined,
    page: typeof input.page === "string" ? input.page : undefined,
  });
}

export function createJobFiltersQueryString(filters: JobFilters): string {
  const query = new URLSearchParams();

  if (filters.q) query.set("q", filters.q);
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
  if (filters.page !== 1) query.set("page", String(filters.page));

  return query.toString();
}
