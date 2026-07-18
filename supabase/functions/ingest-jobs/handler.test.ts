import type { ProviderAdapter, ProviderJob } from "@jobwarden/ingestion";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_JOBS_PER_SOURCE,
  MAX_SOURCES_PER_INVOCATION,
  type ClaimedIngestion,
  type IngestionHandlerDependencies,
  type IngestionRepository,
  type RuntimeLog,
  type SourceCompletion,
  type UpsertSummary,
} from "./contracts";
import { createIngestionHandler } from "./handler";

const invocationId = "10000000-0000-4000-8000-000000000001";
const expectedSecret = "fixture-cron-secret-with-sufficient-length";

function source(index: number): ClaimedIngestion {
  return {
    requestId: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    correlationId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    triggerType: index % 2 === 0 ? "scheduled" : "admin",
    sourceRunId: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source: {
      id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      provider: "greenhouse",
      boardToken: `fictional-board-${index}`,
      employerName: `Fictional Employer ${index}`,
      allowedHosts: ["boards.greenhouse.io"],
    },
  };
}

function providerJob(index: number): ProviderJob {
  return {
    providerJobId: String(index),
    title: "Implementation Analyst",
    location: "London, United Kingdom",
    descriptionHtml: "<p>Permanent full-time analytics implementation.</p>",
    absoluteUrl: `https://boards.greenhouse.io/fictional/jobs/${index}`,
    updatedAt: "2026-07-18T08:00:00Z",
    metadataText: [],
  };
}

type RepositoryHarness = {
  repository: IngestionRepository;
  enqueueScheduled: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  upsertJobs: ReturnType<typeof vi.fn>;
  finishSource: ReturnType<typeof vi.fn>;
  completeRequest: ReturnType<typeof vi.fn>;
};

function repositoryHarness(claims: ClaimedIngestion[] = []): RepositoryHarness {
  const enqueueScheduled = vi.fn(async () => 0);
  const pendingClaims = [...claims];
  const claim = vi.fn(async (limit: number) => pendingClaims.splice(0, limit));
  const upsertJobs = vi.fn(
    async (
      _sourceRunId: string,
      jobs: readonly unknown[],
    ): Promise<UpsertSummary> => ({
      insertedCount: jobs.length,
      updatedCount: 0,
      unchangedCount: 0,
    }),
  );
  const finishSource = vi.fn(
    async (_completion: SourceCompletion) => undefined,
  );
  const completeRequest = vi.fn(async (_requestId: string) => undefined);

  return {
    enqueueScheduled,
    claim,
    upsertJobs,
    finishSource,
    completeRequest,
    repository: {
      enqueueScheduled,
      claim,
      upsertJobs,
      finishSource,
      completeRequest,
    },
  };
}

function adapter(jobs: ProviderJob[] | Error): ProviderAdapter {
  return {
    fetchJobs: vi.fn(async () => {
      if (jobs instanceof Error) throw jobs;
      return { coverage: "complete" as const, jobs };
    }),
  };
}

function request(
  options: {
    method?: string;
    secret?: string;
    contentLength?: string;
    body?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (options.secret !== undefined) {
    headers.set("authorization", `Bearer ${options.secret}`);
  }
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }

  return new Request("https://example.test/functions/v1/ingest-jobs", {
    method: options.method ?? "POST",
    headers,
    body: options.body,
  });
}

function dependencies(
  options: {
    harness?: RepositoryHarness;
    at?: Date;
    adapterFor?: IngestionHandlerDependencies["createAdapter"];
    logs?: RuntimeLog[];
  } = {},
): IngestionHandlerDependencies {
  const harness = options.harness ?? repositoryHarness();
  return {
    readEnvironment: () => ({
      supabaseUrl: "https://fixture.supabase.co",
      serviceRoleKey: "fixture-service-role-key-with-sufficient-length",
      cronSecret: expectedSecret,
    }),
    createRepository: () => harness.repository,
    createAdapter: options.adapterFor ?? (() => adapter([providerJob(1)])),
    now: () => options.at ?? new Date("2026-07-20T08:00:00.000Z"),
    randomUuid: () => invocationId,
    log: (record) => options.logs?.push(record),
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("shared ingestion Edge Function handler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("accepts only POST without initialising database dependencies", async () => {
    const createRepository = vi.fn();
    const handler = createIngestionHandler({
      ...dependencies(),
      createRepository,
    });

    const response = await handler(request({ method: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await json(response)).toEqual({ error: "method_not_allowed" });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong-secret", "", "Bearer nested"])(
    "returns one indistinguishable unauthorised response for %s",
    async (secret) => {
      const createRepository = vi.fn();
      const handler = createIngestionHandler({
        ...dependencies(),
        createRepository,
      });

      const response = await handler(request({ secret }));

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await json(response)).toEqual({ error: "unauthorised" });
      expect(createRepository).not.toHaveBeenCalled();
    },
  );

  it("rejects a declared oversized request before queue access", async () => {
    const createRepository = vi.fn();
    const handler = createIngestionHandler({
      ...dependencies(),
      createRepository,
    });

    const response = await handler(
      request({ secret: expectedSecret, contentLength: "2049" }),
    );

    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: "request_too_large" });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body without a content-length header", async () => {
    const createRepository = vi.fn();
    const handler = createIngestionHandler({
      ...dependencies(),
      createRepository,
    });

    const response = await handler(
      request({ secret: expectedSecret, body: "x".repeat(2049) }),
    );

    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: "request_too_large" });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("enqueues a valid London weekday slot then claims just in time", async () => {
    const harness = repositoryHarness();
    const handler = createIngestionHandler(dependencies({ harness }));

    const response = await handler(request({ secret: expectedSecret }));

    expect(response.status).toBe(200);
    expect(harness.enqueueScheduled).toHaveBeenCalledOnce();
    expect(harness.claim).toHaveBeenCalledOnce();
    expect(harness.claim).toHaveBeenCalledWith(1);
  });

  it("does not enqueue scheduled sources outside a London target slot", async () => {
    const harness = repositoryHarness();
    const handler = createIngestionHandler(
      dependencies({
        harness,
        at: new Date("2026-07-20T09:00:00.000Z"),
      }),
    );

    await handler(request({ secret: expectedSecret }));

    expect(harness.enqueueScheduled).not.toHaveBeenCalled();
    expect(harness.claim).toHaveBeenCalledWith(1);
  });

  it("processes no more than the global per-invocation source cap", async () => {
    const claims = Array.from(
      { length: MAX_SOURCES_PER_INVOCATION + 2 },
      (_, index) => source(index + 1),
    );
    const harness = repositoryHarness(claims);
    const handler = createIngestionHandler(dependencies({ harness }));

    const response = await handler(request({ secret: expectedSecret }));

    expect(harness.claim).toHaveBeenCalledTimes(MAX_SOURCES_PER_INVOCATION);
    expect(harness.claim).toHaveBeenCalledWith(1);
    expect(harness.completeRequest).toHaveBeenCalledTimes(
      MAX_SOURCES_PER_INVOCATION,
    );
    expect(await json(response)).toMatchObject({
      sourceCount: MAX_SOURCES_PER_INVOCATION,
    });
  });

  it("does not claim another source without a safe invocation budget", async () => {
    const harness = repositoryHarness([source(1), source(2)]);
    const currentTime = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-07-20T08:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-07-20T08:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-07-20T08:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-07-20T08:00:01.000Z"))
      .mockReturnValue(new Date("2026-07-20T08:00:31.000Z"));
    const handler = createIngestionHandler({
      ...dependencies({ harness }),
      now: currentTime,
    });

    const response = await handler(request({ secret: expectedSecret }));

    expect(response.status).toBe(200);
    expect(harness.claim).toHaveBeenCalledOnce();
    expect(harness.completeRequest).toHaveBeenCalledOnce();
    expect(await json(response)).toMatchObject({ sourceCount: 1 });
  });

  it("normalises and persists eligible UK jobs before successful completion", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    harness.upsertJobs.mockResolvedValueOnce({
      insertedCount: 1,
      updatedCount: 0,
      unchangedCount: 1,
    });
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: () => adapter([providerJob(1), providerJob(2)]),
      }),
    );

    const response = await handler(request({ secret: expectedSecret }));

    expect(response.status).toBe(200);
    expect(harness.upsertJobs).toHaveBeenCalledOnce();
    expect(harness.upsertJobs).toHaveBeenCalledWith(claim.sourceRunId, [
      expect.objectContaining({
        countryCode: "GB",
        sourceId: claim.source.id,
      }),
      expect.objectContaining({
        countryCode: "GB",
        sourceId: claim.source.id,
      }),
    ]);
    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRunId: claim.sourceRunId,
        status: "succeeded",
        responseComplete: true,
        receivedCount: 2,
        eligibleCount: 2,
        upsertedCount: 1,
        unchangedCount: 1,
        errorCode: null,
      }),
    );
    expect(harness.completeRequest).toHaveBeenCalledWith(claim.requestId);
    expect(await json(response)).toMatchObject({
      correlationId: invocationId,
      status: "succeeded",
      sourceCount: 1,
      failedSourceCount: 0,
      receivedCount: 2,
      eligibleCount: 2,
      upsertedCount: 1,
      unchangedCount: 1,
    });
  });

  it("isolates a source failure and continues with later queue claims", async () => {
    const first = source(1);
    const second = source(2);
    const harness = repositoryHarness([first, second]);
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: (jobSource) =>
          jobSource.id === first.source.id
            ? adapter(new Error("provider response contained secret payload"))
            : adapter([providerJob(2)]),
      }),
    );

    const response = await handler(request({ secret: expectedSecret }));

    expect(harness.finishSource).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceRunId: first.sourceRunId,
        status: "failed",
        responseComplete: false,
        errorCode: "runtime_unexpected",
      }),
    );
    expect(harness.finishSource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceRunId: second.sourceRunId,
        status: "succeeded",
        responseComplete: true,
      }),
    );
    expect(harness.completeRequest).toHaveBeenCalledTimes(2);
    expect(await json(response)).toMatchObject({
      status: "partial_failure",
      sourceCount: 2,
      failedSourceCount: 1,
    });
  });

  it("marks a response over the job ceiling incomplete without writing jobs", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const jobs = Array.from({ length: MAX_JOBS_PER_SOURCE + 1 }, (_, index) =>
      providerJob(index + 1),
    );
    const handler = createIngestionHandler(
      dependencies({ harness, adapterFor: () => adapter(jobs) }),
    );

    await handler(request({ secret: expectedSecret }));

    expect(harness.upsertJobs).not.toHaveBeenCalled();
    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        responseComplete: false,
        receivedCount: MAX_JOBS_PER_SOURCE + 1,
        errorCode: "source_job_cap_reached",
      }),
    );
    expect(harness.completeRequest).toHaveBeenCalledWith(claim.requestId);
  });

  it("leaves a request claimed for lease recovery if source finalisation fails", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    harness.finishSource.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const handler = createIngestionHandler(dependencies({ harness }));

    const response = await handler(request({ secret: expectedSecret }));

    expect(response.status).toBe(200);
    expect(harness.completeRequest).not.toHaveBeenCalled();
    expect(await json(response)).toMatchObject({
      status: "partial_failure",
      failedSourceCount: 1,
    });
  });

  it("logs only the approved structured fields", async () => {
    const logs: RuntimeLog[] = [];
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const secretMarker = "never-log-secret-marker";
    const payloadMarker = "never-log-description-marker";
    const handler = createIngestionHandler({
      ...dependencies({
        harness,
        logs,
        adapterFor: () =>
          adapter([
            {
              ...providerJob(1),
              descriptionHtml: `<p>${payloadMarker}</p>`,
            },
          ]),
      }),
      readEnvironment: () => ({
        supabaseUrl: "https://fixture.supabase.co",
        serviceRoleKey: secretMarker,
        cronSecret: expectedSecret,
      }),
    });

    await handler(request({ secret: expectedSecret }));

    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain(secretMarker);
    expect(serialised).not.toContain(payloadMarker);
    expect(serialised).not.toContain(claim.source.boardToken);
    expect(serialised).not.toContain(claim.source.employerName);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "ingestion.source_completed",
          invocationCorrelationId: invocationId,
          sourceCorrelationId: claim.correlationId,
          status: "succeeded",
        }),
      ]),
    );
  });
});
