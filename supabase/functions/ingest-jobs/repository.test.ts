import { normalisedJobSchema } from "@jobwarden/domain";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseIngestionRepository } from "./repository";

const claimedRow = {
  request_id: "20000000-0000-4000-8000-000000000001",
  correlation_id: "30000000-0000-4000-8000-000000000001",
  trigger_type: "admin",
  source_run_id: "40000000-0000-4000-8000-000000000001",
  source_id: "50000000-0000-4000-8000-000000000001",
  provider: "greenhouse",
  board_token: "fictional-board",
  employer_name: "Fictional Employer",
  allowed_hosts: ["boards.greenhouse.io"],
};

const job = normalisedJobSchema.parse({
  sourceId: claimedRow.source_id,
  providerJobId: "job-1",
  title: "Implementation Analyst",
  employer: "Fictional Employer",
  descriptionText: "Analytics implementation role.",
  applicationUrl: "https://boards.greenhouse.io/fictional/jobs/1",
  countryCode: "GB",
  ukEligibilityEvidence: ["London, United Kingdom"],
  employmentType: "permanent",
  workingTime: "full_time",
  workplaceType: "hybrid",
  ir35Status: "not_applicable",
  compensationRaw: "£50,000 per year",
  compensationMinimum: 5_000_000,
  compensationMaximum: 5_000_000,
  compensationCurrency: "GBP",
  compensationPeriod: "year",
  postedAt: null,
  closesAt: null,
  contentHash: "a".repeat(64),
});

function client(responses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(
    async (name: string) => responses[name] ?? { data: null, error: null },
  );
  return { rpc, client: { rpc } };
}

describe("Supabase ingestion repository", () => {
  it("enqueues due scheduled sources through the narrow RPC", async () => {
    const fake = client({
      enqueue_scheduled_ingestion: { data: 3, error: null },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await expect(repository.enqueueScheduled()).resolves.toBe(3);
    expect(fake.rpc).toHaveBeenCalledWith("enqueue_scheduled_ingestion");
  });

  it("claims the bounded queue and validates every returned source row", async () => {
    const fake = client({
      claim_ingestion_requests: { data: [claimedRow], error: null },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await expect(repository.claim(4)).resolves.toEqual([
      {
        requestId: claimedRow.request_id,
        correlationId: claimedRow.correlation_id,
        triggerType: "admin",
        sourceRunId: claimedRow.source_run_id,
        source: {
          id: claimedRow.source_id,
          provider: "greenhouse",
          boardToken: "fictional-board",
          employerName: "Fictional Employer",
          allowedHosts: ["boards.greenhouse.io"],
        },
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("claim_ingestion_requests", {
      maximum_requests: 4,
    });
  });

  it("rejects malformed database rows without returning their content", async () => {
    const fake = client({
      claim_ingestion_requests: {
        data: [{ ...claimedRow, provider: "unknown", board_token: "secret" }],
        error: null,
      },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await expect(repository.claim(4)).rejects.toMatchObject({
      name: "IngestionRepositoryError",
      code: "invalid_claim_response",
      message: "Ingestion database operation failed.",
    });
    await expect(repository.claim(4)).rejects.not.toThrow("secret");
  });

  it("maps normalised jobs to the existing atomic upsert RPC", async () => {
    const fake = client({
      upsert_ingested_jobs: {
        data: [
          {
            inserted_count: 0,
            updated_count: 0,
            unchanged_count: 1,
          },
        ],
        error: null,
      },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await expect(
      repository.upsertJobs(claimedRow.source_run_id, [job]),
    ).resolves.toEqual({
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 1,
    });
    expect(fake.rpc).toHaveBeenCalledWith("upsert_ingested_jobs", {
      target_source_run_id: claimedRow.source_run_id,
      jobs_value: [
        {
          providerJobId: job.providerJobId,
          title: job.title,
          employer: job.employer,
          descriptionText: job.descriptionText,
          applicationUrl: job.applicationUrl,
          countryCode: "GB",
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
          postedAt: job.postedAt,
          closesAt: job.closesAt,
          contentHash: job.contentHash,
        },
      ],
    });
  });

  it("rejects a batch result whose counts do not cover every submitted job", async () => {
    const fake = client({
      upsert_ingested_jobs: {
        data: [{ inserted_count: 0, updated_count: 0, unchanged_count: 0 }],
        error: null,
      },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await expect(
      repository.upsertJobs(claimedRow.source_run_id, [job]),
    ).rejects.toMatchObject({
      name: "IngestionRepositoryError",
      code: "invalid_upsert_response",
    });
  });

  it("finalises a source without accepting a caller-supplied closed count", async () => {
    const fake = client({
      finish_source_ingestion: { data: null, error: null },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await repository.finishSource({
      sourceRunId: claimedRow.source_run_id,
      status: "succeeded",
      responseComplete: true,
      receivedCount: 2,
      eligibleCount: 1,
      upsertedCount: 1,
      unchangedCount: 0,
      durationMs: 25,
      retryCount: 0,
      errorCode: null,
    });

    expect(fake.rpc).toHaveBeenCalledWith("finish_source_ingestion", {
      target_source_run_id: claimedRow.source_run_id,
      requested_status: "succeeded",
      response_was_complete: true,
      received_count_value: 2,
      eligible_count_value: 1,
      upserted_count_value: 1,
      unchanged_count_value: 0,
      reported_closed_count: 0,
      duration_ms_value: 25,
      retry_count_value: 0,
      sanitised_error_code: null,
    });
  });

  it("completes the claimed request through a separate narrow RPC", async () => {
    const fake = client({
      complete_ingestion_request: { data: null, error: null },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    await repository.completeRequest(claimedRow.request_id);

    expect(fake.rpc).toHaveBeenCalledWith("complete_ingestion_request", {
      target_request_id: claimedRow.request_id,
    });
  });

  it("redacts database error messages and details", async () => {
    const fake = client({
      claim_ingestion_requests: {
        data: null,
        error: {
          message: "secret board token leaked",
          details: "raw provider payload",
        },
      },
    });
    const repository = createSupabaseIngestionRepository(fake.client);

    const error = await repository.claim(4).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      name: "IngestionRepositoryError",
      code: "claim_failed",
      message: "Ingestion database operation failed.",
    });
    expect(JSON.stringify(error)).not.toContain("secret board token");
    expect(JSON.stringify(error)).not.toContain("raw provider payload");
  });
});
