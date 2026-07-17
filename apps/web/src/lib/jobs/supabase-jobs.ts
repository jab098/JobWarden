import "server-only";

import { z } from "zod";

import type { JobsRepository } from "./repository";
import {
  compensationPeriods,
  employmentTypes,
  ir35Statuses,
  workplaceTypes,
  workingTimes,
  type JobDetail,
  type JobFilters,
  type JobListItem,
} from "./types";

const locationSchema = z.object({
  raw_location: z.string().min(1).max(1_000),
});

const listRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  employment_type: z.enum(employmentTypes),
  working_time: z.enum(workingTimes),
  workplace_type: z.enum(workplaceTypes),
  ir35_status: z.enum(ir35Statuses),
  compensation_minimum: z.number().int().nonnegative().nullable(),
  compensation_maximum: z.number().int().nonnegative().nullable(),
  compensation_currency: z.literal("GBP").nullable(),
  compensation_period: z.enum(compensationPeriods),
  posted_at: z.iso.datetime().nullable(),
  last_seen_at: z.iso.datetime(),
  job_locations: z.array(locationSchema).nullable(),
});

const detailRowSchema = listRowSchema.extend({
  description_text: z.string().max(100_000),
  application_url: z
    .url()
    .refine((url) => url.startsWith("https://"), "HTTPS required"),
  uk_eligibility_evidence: z.array(z.string().min(1).max(500)).min(1),
});

const listColumns = [
  "id",
  "title",
  "employer",
  "employment_type",
  "working_time",
  "workplace_type",
  "ir35_status",
  "compensation_minimum",
  "compensation_maximum",
  "compensation_currency",
  "compensation_period",
  "posted_at",
  "last_seen_at",
  "job_locations(raw_location)",
].join(",");

const detailColumns = [
  listColumns,
  "description_text",
  "application_url",
  "uk_eligibility_evidence",
].join(",");

type QueryResponse = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryBuilder = {
  select(columns: string, options?: { count: "exact" }): QueryBuilder;
  eq(column: string, value: string): QueryBuilder;
  or(filters: string): QueryBuilder;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ): QueryBuilder;
  range(from: number, to: number): Promise<QueryResponse>;
  maybeSingle(): Promise<QueryResponse>;
};

type SupabaseJobsClient = {
  from(table: "jobs"): QueryBuilder;
};

type ListRow = z.infer<typeof listRowSchema>;
type DetailRow = z.infer<typeof detailRowSchema>;

function selectLocation(
  locations: readonly z.infer<typeof locationSchema>[] | null,
): string {
  return (
    locations
      ?.map((location) => location.raw_location.trim())
      .toSorted((left, right) => left.localeCompare(right, "en-GB"))[0] ??
    "UK location not specified"
  );
}

function toListItem(row: ListRow): JobListItem {
  return {
    id: row.id,
    title: row.title,
    employer: row.employer,
    location: selectLocation(row.job_locations),
    employmentType: row.employment_type,
    workingTime: row.working_time,
    workplaceType: row.workplace_type,
    ir35Status: row.ir35_status,
    compensationMinimum: row.compensation_minimum,
    compensationMaximum: row.compensation_maximum,
    compensationCurrency: row.compensation_currency,
    compensationPeriod: row.compensation_period,
    postedAt: row.posted_at,
  };
}

function toDetail(row: DetailRow): JobDetail {
  return {
    ...toListItem(row),
    descriptionText: row.description_text,
    applicationUrl: row.application_url,
    ukEligibilityEvidence: row.uk_eligibility_evidence,
    sourceLabel: "External job listing",
    lastSeenAt: row.last_seen_at,
  };
}

function escapePostgrestLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll('"', '\\"');
}

function createSearchFilter(value: string): string {
  const pattern = `%${escapePostgrestLikePattern(value)}%`;
  return `title.ilike."${pattern}",employer.ilike."${pattern}"`;
}

function newestLastSeenAt(rows: readonly ListRow[]): string | null {
  return (
    rows
      .map((row) => row.last_seen_at)
      .toSorted()
      .at(-1) ?? null
  );
}

export function createSupabaseJobsRepository(client: object): JobsRepository {
  const supabaseClient = client as SupabaseJobsClient;

  return {
    async list(filters: JobFilters) {
      try {
        let query = supabaseClient
          .from("jobs")
          .select(listColumns, { count: "exact" })
          .eq("lifecycle_status", "active");

        if (filters.employment !== "all") {
          query = query.eq("employment_type", filters.employment);
        }
        if (filters.workingTime !== "all") {
          query = query.eq("working_time", filters.workingTime);
        }
        if (filters.workplace !== "all") {
          query = query.eq("workplace_type", filters.workplace);
        }
        if (filters.ir35 !== "all") {
          query = query.eq("ir35_status", filters.ir35);
        }
        if (filters.q) query = query.or(createSearchFilter(filters.q));

        const start = (filters.page - 1) * 25;
        const response = await query
          .order("posted_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(start, start + 24);

        if (response.error) throw new Error("Supabase query failed");

        const rows = z.array(listRowSchema).parse(response.data);
        const total = z.number().int().nonnegative().parse(response.count);

        return {
          items: rows.map(toListItem),
          total,
          latestListingUpdate: newestLastSeenAt(rows),
          page: filters.page,
          pageSize: 25,
          dataMode: "supabase",
        };
      } catch {
        throw new Error("Unable to load jobs");
      }
    },

    async findById(jobId: string) {
      if (!z.string().uuid().safeParse(jobId).success) return null;

      try {
        const response = await supabaseClient
          .from("jobs")
          .select(detailColumns)
          .eq("lifecycle_status", "active")
          .eq("id", jobId)
          .maybeSingle();

        if (response.error) throw new Error("Supabase query failed");
        if (response.data === null) return null;

        return toDetail(detailRowSchema.parse(response.data));
      } catch {
        throw new Error("Unable to load jobs");
      }
    },
  };
}
