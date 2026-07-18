import "server-only";

import {
  accessStatusSchema,
  getComplianceReviewState,
} from "@jobwarden/domain";
import { z } from "zod";

import {
  AdminRepositoryError,
  type AdminRepository,
  type AdminRepositoryErrorCode,
} from "./repository";
import type {
  AccessRequestView,
  IngestionRequestResult,
  IngestionRequestView,
  IngestionRunView,
  JobSourceView,
} from "./types";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.iso.datetime({ offset: true });

const accessRowSchema = z.object({
  user_id: z.string().uuid(),
  status: accessStatusSchema,
  requested_at: timestampSchema,
  decided_at: timestampSchema.nullable(),
  decision_reason: z.string().min(3).max(500).nullable(),
});

const profileRowSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(200),
});

const sourceRowSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("greenhouse"),
  board_token: z.string().min(1).max(200),
  employer_name: z.string().min(1).max(300),
  enabled: z.boolean(),
  minimum_sync_interval: z.string().min(1).max(100),
  last_successful_sync_at: timestampSchema.nullable(),
  terms_reviewed_at: dateSchema,
  robots_reviewed_at: dateSchema,
  allowed_method: z.literal("GET"),
  compliance_notes: z.string().min(3).max(5_000),
  allowed_hosts: z.array(z.string().min(1)).min(1).max(10),
});

const sourceJoinSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("greenhouse"),
  employer_name: z.string().min(1).max(300),
});

const parentRunSchema = z.object({
  id: z.string().uuid(),
  trigger_type: z.enum(["scheduled", "admin", "manual"]),
});

const runRowSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  source_id: z.string().uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  response_complete: z.boolean(),
  received_count: z.number().int().nonnegative(),
  eligible_count: z.number().int().nonnegative(),
  upserted_count: z.number().int().nonnegative(),
  unchanged_count: z.number().int().nonnegative(),
  closed_count: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative().nullable(),
  retry_count: z.number().int().min(0).max(10),
  error_code: z.string().min(3).max(100).nullable(),
  started_at: timestampSchema,
  completed_at: timestampSchema.nullable(),
  job_sources: sourceJoinSchema,
  ingestion_runs: parentRunSchema,
});

const requestRowSchema = z.object({
  id: z.string().uuid(),
  correlation_id: z.string().uuid(),
  source_id: z.string().uuid(),
  status: z.enum(["pending", "claimed", "completed", "cancelled"]),
  requested_at: timestampSchema,
  job_sources: sourceJoinSchema.pick({
    employer_name: true,
    provider: true,
  }),
});

const requestResultSchema = z
  .array(
    z.object({
      request_id: z.string().uuid(),
      correlation_id: z.string().uuid(),
      request_state: z.enum(["queued", "coalesced"]),
      eligible_after: timestampSchema,
    }),
  )
  .length(1);

type QueryResponse = { data: unknown; error: unknown };

type QueryBuilder = {
  select(columns: string): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(limit: number): Promise<QueryResponse>;
  in(column: string, values: string[]): Promise<QueryResponse>;
};

type SupabaseAdminClient = {
  from(table: string): QueryBuilder;
  rpc(functionName: string, parameters?: object): Promise<QueryResponse>;
};

const accessColumns = "user_id,status,requested_at,decided_at,decision_reason";
const profileColumns = "user_id,display_name";
const sourceColumns = [
  "id",
  "provider",
  "board_token",
  "employer_name",
  "enabled",
  "minimum_sync_interval",
  "last_successful_sync_at",
  "terms_reviewed_at",
  "robots_reviewed_at",
  "allowed_method",
  "compliance_notes",
  "allowed_hosts",
].join(",");
const runColumns = [
  "id",
  "run_id",
  "source_id",
  "status",
  "response_complete",
  "received_count",
  "eligible_count",
  "upserted_count",
  "unchanged_count",
  "closed_count",
  "duration_ms",
  "retry_count",
  "error_code",
  "started_at",
  "completed_at",
  "job_sources!inner(id,provider,employer_name)",
  "ingestion_runs!inner(id,trigger_type)",
].join(",");
const requestColumns = [
  "id",
  "correlation_id",
  "source_id",
  "status",
  "requested_at",
  "job_sources!inner(employer_name,provider)",
].join(",");

function unavailable(): AdminRepositoryError {
  return new AdminRepositoryError(
    "unavailable",
    "Administrator data is unavailable",
  );
}

function parseIntervalMinutes(value: string): number {
  const dayOnly = value.match(/^(\d+)\s+days?$/);
  const dayAndTime = value.match(
    /^(?:(\d+)\s+days?\s+)?(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d+))?$/,
  );

  const days = Number(dayOnly?.[1] ?? dayAndTime?.[1] ?? 0);
  const hours = Number(dayAndTime?.[2] ?? 0);
  const minutes = Number(dayAndTime?.[3] ?? 0);
  const seconds = Number(dayAndTime?.[4] ?? 0);
  const fractionalSeconds = Number(`0.${dayAndTime?.[5] ?? 0}`);
  const total = days * 1_440 + hours * 60 + minutes;
  if (
    (!dayOnly && !dayAndTime) ||
    seconds !== 0 ||
    fractionalSeconds !== 0 ||
    !Number.isInteger(total) ||
    total < 15 ||
    total > 10_080
  ) {
    throw unavailable();
  }
  return total;
}

function mapDatabaseError(error: unknown): AdminRepositoryError {
  if (!error || typeof error !== "object") return unavailable();

  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  let mapped: AdminRepositoryErrorCode = "unavailable";
  if (code === "P0001" && message.includes("cooldown")) mapped = "cooldown";
  else if (code === "P0001" || code === "23505") mapped = "conflict";
  else if (code === "P0002") mapped = "not_found";
  else if (code === "22023") mapped = "conflict";

  return new AdminRepositoryError(
    mapped,
    mapped === "unavailable"
      ? "Administrator data is unavailable"
      : "Administrator operation could not be completed",
  );
}

function assertResponse(response: QueryResponse): unknown {
  if (response.error) throw mapDatabaseError(response.error);
  return response.data;
}

function mapAccessRows(
  accessData: unknown,
  profileData: unknown,
): AccessRequestView[] {
  const rows = z.array(accessRowSchema).parse(accessData);
  const profiles = new Map(
    z
      .array(profileRowSchema)
      .parse(profileData)
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const statusOrder = new Map([
    ["pending", 0],
    ["suspended", 1],
    ["rejected", 2],
    ["approved", 3],
  ]);

  return rows
    .map((row) => ({
      userId: row.user_id,
      displayName:
        profiles.get(row.user_id)?.trim() || "Private beta applicant",
      status: row.status,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decisionReason: row.decision_reason,
    }))
    .toSorted(
      (left, right) =>
        (statusOrder.get(left.status) ?? 99) -
          (statusOrder.get(right.status) ?? 99) ||
        right.requestedAt.localeCompare(left.requestedAt),
    );
}

export function createSupabaseAdminRepository(
  client: object,
  now: () => Date = () => new Date(),
): AdminRepository {
  const supabase = client as SupabaseAdminClient;

  return {
    async listAccessRequests() {
      try {
        const accessResponse = await supabase
          .from("access_requests")
          .select(accessColumns)
          .order("requested_at", { ascending: false })
          .limit(200);
        const accessData = assertResponse(accessResponse);
        const accessRows = z.array(accessRowSchema).parse(accessData);
        if (accessRows.length === 0) return [];

        const profileResponse = await supabase
          .from("profiles")
          .select(profileColumns)
          .in(
            "user_id",
            accessRows.map((row) => row.user_id),
          );
        return mapAccessRows(accessRows, assertResponse(profileResponse));
      } catch (error) {
        if (error instanceof AdminRepositoryError) throw error;
        throw unavailable();
      }
    },

    async getAccessRequestsEnabled() {
      const response = await supabase.rpc("get_access_requests_enabled");
      try {
        return z.boolean().parse(assertResponse(response));
      } catch (error) {
        if (error instanceof AdminRepositoryError) throw error;
        throw unavailable();
      }
    },

    async listSources() {
      try {
        const response = await supabase
          .from("job_sources")
          .select(sourceColumns)
          .order("employer_name", { ascending: true })
          .limit(200);
        const rows = z.array(sourceRowSchema).parse(assertResponse(response));

        return rows.map<JobSourceView>((row) => ({
          sourceId: row.id,
          provider: row.provider,
          boardToken: row.board_token,
          employerName: row.employer_name,
          enabled: row.enabled,
          minimumSyncMinutes: parseIntervalMinutes(row.minimum_sync_interval),
          lastSuccessfulSyncAt: row.last_successful_sync_at,
          termsReviewedAt: row.terms_reviewed_at,
          robotsReviewedAt: row.robots_reviewed_at,
          termsReviewState: getComplianceReviewState(
            row.terms_reviewed_at,
            now(),
          ),
          robotsReviewState: getComplianceReviewState(
            row.robots_reviewed_at,
            now(),
          ),
          complianceNotes: row.compliance_notes,
          allowedHosts: row.allowed_hosts,
        }));
      } catch (error) {
        if (error instanceof AdminRepositoryError) throw error;
        throw unavailable();
      }
    },

    async listIngestionRuns(limit) {
      try {
        const response = await supabase
          .from("ingestion_source_runs")
          .select(runColumns)
          .order("started_at", { ascending: false })
          .limit(Math.min(Math.max(limit, 1), 50));
        const rows = z.array(runRowSchema).parse(assertResponse(response));
        return rows.map<IngestionRunView>((row) => ({
          id: row.id,
          runId: row.run_id,
          sourceId: row.source_id,
          employerName: row.job_sources.employer_name,
          provider: row.job_sources.provider,
          triggerType: row.ingestion_runs.trigger_type,
          status: row.status,
          responseComplete: row.response_complete,
          receivedCount: row.received_count,
          eligibleCount: row.eligible_count,
          upsertedCount: row.upserted_count,
          unchangedCount: row.unchanged_count,
          closedCount: row.closed_count,
          durationMs: row.duration_ms,
          retryCount: row.retry_count,
          errorCode: row.error_code,
          startedAt: row.started_at,
          completedAt: row.completed_at,
        }));
      } catch (error) {
        if (error instanceof AdminRepositoryError) throw error;
        throw unavailable();
      }
    },

    async listIngestionRequests(limit) {
      try {
        const response = await supabase
          .from("ingestion_requests")
          .select(requestColumns)
          .order("requested_at", { ascending: false })
          .limit(Math.min(Math.max(limit, 1), 50));
        const rows = z.array(requestRowSchema).parse(assertResponse(response));
        return rows.map<IngestionRequestView>((row) => ({
          id: row.id,
          correlationId: row.correlation_id,
          sourceId: row.source_id,
          employerName: row.job_sources.employer_name,
          provider: row.job_sources.provider,
          status: row.status,
          requestedAt: row.requested_at,
        }));
      } catch (error) {
        if (error instanceof AdminRepositoryError) throw error;
        throw unavailable();
      }
    },

    async decideAccess(input) {
      const response = await supabase.rpc("decide_access_request", {
        target_user_id: input.userId,
        next_status: input.nextStatus,
        decision_reason: input.reason,
      });
      if (response.error) throw mapDatabaseError(response.error);
    },

    async setAccessRequestsEnabled(enabled) {
      const response = await supabase.rpc("set_access_requests_enabled", {
        enabled,
      });
      if (response.error) throw mapDatabaseError(response.error);
    },

    async saveSource(input) {
      const response = await supabase.rpc("upsert_job_source", {
        target_source_id: input.sourceId,
        provider_name: input.provider,
        board_token_value: input.boardToken,
        employer_name_value: input.employerName,
        enabled_value: input.enabled,
        minimum_sync_minutes: input.minimumSyncMinutes,
        terms_reviewed_on: input.termsReviewedAt,
        robots_reviewed_on: input.robotsReviewedAt,
        allowed_method_value: "GET",
        compliance_notes_value: input.complianceNotes,
        allowed_hosts_value: input.allowedHosts,
      });
      if (response.error) throw mapDatabaseError(response.error);
      try {
        return { sourceId: z.string().uuid().parse(response.data) };
      } catch {
        throw unavailable();
      }
    },

    async requestSourceIngestion(sourceId) {
      const response = await supabase.rpc("request_source_ingestion", {
        target_source_id: sourceId,
      });
      if (response.error) throw mapDatabaseError(response.error);

      try {
        const [row] = requestResultSchema.parse(response.data);
        return {
          requestId: row.request_id,
          correlationId: row.correlation_id,
          state: row.request_state,
          eligibleAfter: row.eligible_after,
        } satisfies IngestionRequestResult;
      } catch {
        throw unavailable();
      }
    },
  };
}
