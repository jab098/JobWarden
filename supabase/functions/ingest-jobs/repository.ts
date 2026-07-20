import type { NormalisedJob } from "@jobwarden/domain";
import { z } from "zod";

import type { IngestionRpcClient } from "../_shared/supabase.ts";
import type {
  ClaimedIngestion,
  IngestionRepository,
  SourceCompletion,
  UpsertSummary,
} from "./contracts.ts";

const hostSchema = z
  .string()
  .min(4)
  .max(253)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/);

const claimedRowSchema = z
  .object({
    request_id: z.string().uuid(),
    correlation_id: z.string().uuid(),
    trigger_type: z.enum(["admin", "scheduled"]),
    source_run_id: z.string().uuid(),
    source_id: z.string().uuid(),
    provider: z.enum(["greenhouse", "reed"]),
    board_token: z.string().min(1).max(200),
    employer_name: z.string().min(1).max(300),
    allowed_hosts: z.array(hostSchema).min(1).max(10),
  })
  .refine(
    (row) =>
      row.provider !== "reed" ||
      (row.board_token === "gb-discovery" &&
        row.employer_name === "Reed" &&
        row.allowed_hosts.length === 1 &&
        row.allowed_hosts[0] === "www.reed.co.uk"),
    { message: "Invalid Reed discovery source." },
  );

const upsertResultSchema = z
  .array(
    z.object({
      inserted_count: z.number().int().nonnegative(),
      updated_count: z.number().int().nonnegative(),
      unchanged_count: z.number().int().nonnegative(),
    }),
  )
  .length(1);

export type IngestionRepositoryErrorCode =
  | "enqueue_failed"
  | "invalid_enqueue_response"
  | "claim_failed"
  | "invalid_claim_response"
  | "upsert_failed"
  | "invalid_upsert_response"
  | "finish_failed"
  | "complete_failed";

export class IngestionRepositoryError extends Error {
  override readonly name = "IngestionRepositoryError";

  constructor(readonly code: IngestionRepositoryErrorCode) {
    super("Ingestion database operation failed.");
  }
}

function databaseFailure(
  error: unknown,
  code: IngestionRepositoryErrorCode,
): void {
  if (error !== null && error !== undefined) {
    throw new IngestionRepositoryError(code);
  }
}

function mapClaim(row: z.infer<typeof claimedRowSchema>): ClaimedIngestion {
  const common = {
    id: row.source_id,
    employerName: row.employer_name,
    allowedHosts: row.allowed_hosts,
  };
  return {
    requestId: row.request_id,
    correlationId: row.correlation_id,
    triggerType: row.trigger_type,
    sourceRunId: row.source_run_id,
    source:
      row.provider === "reed"
        ? { ...common, provider: "reed", boardToken: "gb-discovery" }
        : {
            ...common,
            provider: "greenhouse",
            boardToken: row.board_token,
          },
  };
}

function jobParameters(job: NormalisedJob) {
  return {
    providerJobId: job.providerJobId,
    title: job.title,
    employer: job.employer,
    descriptionText: job.descriptionText,
    applicationUrl: job.applicationUrl,
    countryCode: job.countryCode,
    rawLocation: job.rawLocation,
    remoteEligibility: job.remoteEligibility,
    ukEligibilityEvidence: job.ukEligibilityEvidence,
    employmentType: job.employmentType,
    workingTime: job.workingTime,
    workplaceType: job.workplaceType,
    ir35Status: job.ir35Status,
    compensationRaw: job.compensationRaw,
    compensationMinimum: job.compensationMinimum,
    compensationMaximum: job.compensationMaximum,
    compensationCurrency: job.compensationCurrency,
    compensationPeriod: job.compensationPeriod,
    compensationProvenance: job.compensationProvenance,
    compensationObservedAt: job.compensationObservedAt,
    postedAt: job.postedAt,
    closesAt: job.closesAt,
    deduplicationKey: job.deduplicationKey,
    contentHash: job.contentHash,
  };
}

function finishParameters(completion: SourceCompletion) {
  return {
    target_source_run_id: completion.sourceRunId,
    requested_status: completion.status,
    response_was_complete: completion.responseComplete,
    received_count_value: completion.receivedCount,
    eligible_count_value: completion.eligibleCount,
    upserted_count_value: completion.upsertedCount,
    unchanged_count_value: completion.unchangedCount,
    reported_closed_count: 0,
    duration_ms_value: completion.durationMs,
    retry_count_value: completion.retryCount,
    sanitised_error_code: completion.errorCode,
  };
}

export function createSupabaseIngestionRepository(
  client: IngestionRpcClient,
): IngestionRepository {
  return {
    async enqueueScheduled(): Promise<number> {
      const { data, error } = await client.rpc("enqueue_scheduled_ingestion");
      databaseFailure(error, "enqueue_failed");

      const result = z.number().int().nonnegative().safeParse(data);
      if (!result.success) {
        throw new IngestionRepositoryError("invalid_enqueue_response");
      }
      return result.data;
    },

    async claim(limit: number): Promise<ClaimedIngestion[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 4) {
        throw new IngestionRepositoryError("invalid_claim_response");
      }

      const { data, error } = await client.rpc("claim_ingestion_requests", {
        maximum_requests: limit,
      });
      databaseFailure(error, "claim_failed");

      const result = z.array(claimedRowSchema).max(4).safeParse(data);
      if (!result.success) {
        throw new IngestionRepositoryError("invalid_claim_response");
      }
      return result.data.map(mapClaim);
    },

    async upsertJobs(
      sourceRunId: string,
      jobs: readonly NormalisedJob[],
    ): Promise<UpsertSummary> {
      if (jobs.length < 1 || jobs.length > 500) {
        throw new IngestionRepositoryError("invalid_upsert_response");
      }

      const { data, error } = await client.rpc("upsert_ingested_jobs", {
        target_source_run_id: sourceRunId,
        jobs_value: jobs.map(jobParameters),
      });
      databaseFailure(error, "upsert_failed");

      const result = upsertResultSchema.safeParse(data);
      if (!result.success) {
        throw new IngestionRepositoryError("invalid_upsert_response");
      }
      const counts = result.data[0];
      if (
        counts.inserted_count +
          counts.updated_count +
          counts.unchanged_count !==
        jobs.length
      ) {
        throw new IngestionRepositoryError("invalid_upsert_response");
      }
      return {
        insertedCount: counts.inserted_count,
        updatedCount: counts.updated_count,
        unchangedCount: counts.unchanged_count,
      };
    },

    async finishSource(completion: SourceCompletion): Promise<void> {
      const { error } = await client.rpc(
        "finish_source_ingestion",
        finishParameters(completion),
      );
      databaseFailure(error, "finish_failed");
    },

    async completeRequest(requestId: string): Promise<void> {
      const { error } = await client.rpc("complete_ingestion_request", {
        target_request_id: requestId,
      });
      databaseFailure(error, "complete_failed");
    },
  };
}
