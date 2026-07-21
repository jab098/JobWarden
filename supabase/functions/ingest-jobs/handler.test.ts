import {
  AdapterError,
  type ProviderAdapter,
  type ProviderJob,
} from "@jobwarden/ingestion";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_ELIGIBLE_PER_SOURCE,
  MAX_RECEIVED_PER_SOURCE,
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

function adapter(
  jobs: ProviderJob[] | Error,
  coverage: "complete" | "incremental" = "complete",
): ProviderAdapter {
  return {
    fetchJobs: vi.fn(async () => {
      if (jobs instanceof Error) throw jobs;
      return { coverage, jobs };
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

  // Every non-eligible outcome used to be skipped by one `continue`, so a run
  // that discarded almost everything recorded nothing but a low eligible count.
  it("records why each discarded advert was discarded", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    harness.upsertJobs.mockResolvedValueOnce({
      insertedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
    });
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: () =>
          adapter([
            providerJob(1),
            { ...providerJob(2), location: "Austin, Texas" },
            {
              ...providerJob(3),
              location: "Ashby-de-la-Zouch, Leicestershire",
            },
            {
              ...providerJob(4),
              location: "Ashby-de-la-Zouch, Leicestershire",
            },
            { ...providerJob(5), location: "Hebden Bridge, West Yorkshire" },
            {
              ...providerJob(6),
              absoluteUrl: "https://not-an-allowed-host.example/jobs/6",
            },
          ]),
      }),
    );

    await handler(request({ secret: expectedSecret }));

    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedCount: 6,
        eligibleCount: 1,
        excludedNonUkCount: 1,
        quarantinedAmbiguousCount: 3,
        quarantinedInvalidUrlCount: 1,
        // Deduplicated: the same unrecognised town across two adverts is one
        // gap in the gazetteer, not two.
        unrecognisedLocations: [
          "Ashby-de-la-Zouch, Leicestershire",
          "Hebden Bridge, West Yorkshire",
        ],
      }),
    );
  });

  // Completeness, not attribution: this catches an outcome that is counted
  // nowhere, while the test above catches one counted under the wrong reason.
  // Scoped to adverts that reached normalisation — the per-source cap returns
  // before the loop, so a capped run legitimately reports received with no
  // outcomes at all.
  it("counts every normalised advert under exactly one outcome", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    harness.upsertJobs.mockResolvedValueOnce({
      insertedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
    });
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: () =>
          adapter([
            providerJob(1),
            { ...providerJob(2), location: "Austin, Texas" },
            { ...providerJob(3), location: "Somewhere, Nowhere" },
          ]),
      }),
    );

    await handler(request({ secret: expectedSecret }));

    const completion = harness.finishSource.mock.calls[0][0];
    expect(
      completion.eligibleCount +
        completion.excludedNonUkCount +
        completion.quarantinedAmbiguousCount +
        completion.quarantinedInvalidUrlCount,
    ).toBe(completion.receivedCount);
  });

  // The diagnosis must survive the runs most worth diagnosing. A throw after
  // normalisation used to finalise with every drop count at zero.
  it("keeps the drop breakdown when the run fails after normalising", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    harness.upsertJobs.mockRejectedValueOnce(new Error("fictional_db_error"));
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: () =>
          adapter([
            providerJob(1),
            { ...providerJob(2), location: "Austin, Texas" },
            {
              ...providerJob(3),
              location: "Ashby-de-la-Zouch, Leicestershire",
            },
          ]),
      }),
    );

    await handler(request({ secret: expectedSecret }));

    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        excludedNonUkCount: 1,
        quarantinedAmbiguousCount: 1,
        unrecognisedLocations: ["Ashby-de-la-Zouch, Leicestershire"],
      }),
    );
  });

  it("bounds the recorded locations however many places go unrecognised", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: () =>
          adapter(
            Array.from({ length: 40 }, (_, index) => ({
              ...providerJob(index + 1),
              location: `Fictional Town ${index + 1}, Nowhereshire`,
            })),
          ),
      }),
    );

    await handler(request({ secret: expectedSecret }));

    const completion = harness.finishSource.mock.calls[0][0];
    expect(completion.quarantinedAmbiguousCount).toBe(40);
    expect(completion.unrecognisedLocations).toHaveLength(25);
  });

  it("finalises incremental discovery successfully without claiming a complete snapshot", async () => {
    const claim = source(1);
    claim.source = {
      ...claim.source,
      provider: "reed",
      boardToken: "gb-discovery",
      employerName: "Reed",
      allowedHosts: ["www.reed.co.uk"],
    };
    const harness = repositoryHarness([claim]);
    const handler = createIngestionHandler(
      dependencies({ harness, adapterFor: () => adapter([], "incremental") }),
    );

    const response = await handler(request({ secret: expectedSecret }));

    expect(response.status).toBe(200);
    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        responseComplete: false,
        receivedCount: 0,
        errorCode: null,
      }),
    );
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

  it("isolates a missing Reed credential and still processes later Greenhouse work", async () => {
    const reed = source(1);
    reed.source = {
      ...reed.source,
      provider: "reed",
      boardToken: "gb-discovery",
      employerName: "Reed",
      allowedHosts: ["www.reed.co.uk"],
    };
    const greenhouse = source(2);
    const harness = repositoryHarness([reed, greenhouse]);
    const handler = createIngestionHandler(
      dependencies({
        harness,
        adapterFor: (jobSource) => {
          if (jobSource.provider === "reed") {
            throw new AdapterError(
              "configuration_error",
              "Reed API key is not configured.",
              0,
            );
          }
          return adapter([providerJob(2)]);
        },
      }),
    );

    const response = await handler(request({ secret: expectedSecret }));

    expect(harness.finishSource).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: "failed",
        errorCode: "provider_configuration_error",
      }),
    );
    expect(harness.finishSource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "succeeded", responseComplete: true }),
    );
    expect(await json(response)).toMatchObject({
      status: "partial_failure",
      sourceCount: 2,
      failedSourceCount: 1,
    });
  });

  it("marks a runaway response incomplete without writing jobs", async () => {
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const jobs = Array.from({ length: MAX_RECEIVED_PER_SOURCE + 1 }, (_, index) =>
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
        receivedCount: MAX_RECEIVED_PER_SOURCE + 1,
        errorCode: "source_received_cap_reached",
      }),
    );
    expect(harness.completeRequest).toHaveBeenCalledWith(claim.requestId);
  });

  it("ingests a large board whose UK-eligible subset is small", async () => {
    // The defect: the ceiling counted the provider's WHOLE response, so
    // Databricks' 780 worldwide adverts failed outright even though only 48
    // were UK-eligible and the write limit is 500. This is that exact shape.
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const jobs = [
      ...Array.from({ length: 700 }, (_, index) => ({
        ...providerJob(index + 1),
        location: "San Francisco, United States",
      })),
      ...Array.from({ length: 40 }, (_, index) => providerJob(1000 + index)),
    ];
    const handler = createIngestionHandler(
      dependencies({ harness, adapterFor: () => adapter(jobs) }),
    );

    await handler(request({ secret: expectedSecret }));

    expect(harness.upsertJobs).toHaveBeenCalledTimes(1);
    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        receivedCount: 740,
        eligibleCount: 40,
      }),
    );
  });

  it("still refuses a batch larger than the write limit", async () => {
    // The defect this replaces: the ceiling counted the provider's whole
    // response, so Databricks' 780 worldwide adverts failed outright even
    // though only 48 were UK-eligible and the write limit is 500.
    const claim = source(1);
    const harness = repositoryHarness([claim]);
    const jobs = Array.from({ length: MAX_ELIGIBLE_PER_SOURCE + 200 }, (_, index) =>
      providerJob(index + 1),
    );
    const handler = createIngestionHandler(
      dependencies({ harness, adapterFor: () => adapter(jobs) }),
    );

    await handler(request({ secret: expectedSecret }));

    // Every fixture job is UK-eligible, so this batch does exceed the write
    // limit and must still fail — but on the eligible count, not the received.
    expect(harness.finishSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "source_job_cap_reached",
        receivedCount: MAX_ELIGIBLE_PER_SOURCE + 200,
      }),
    );
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
