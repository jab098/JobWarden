import { normalisedJobSchema } from "@jobwarden/domain";
import type { NormalisedJob } from "@jobwarden/domain";
import { normaliseProviderJob } from "@jobwarden/ingestion";

import {
  MAX_JOBS_PER_SOURCE,
  MAX_SOURCES_PER_INVOCATION,
  type ClaimedIngestion,
  type IngestionHandlerDependencies,
  type RuntimeLog,
  type SourceCompletion,
} from "./contracts.ts";
import { retryCount, runtimeErrorCode } from "./errors.ts";

const MAX_REQUEST_BYTES = 2_048;
const MAX_INVOCATION_MS = 120_000;
const MIN_SOURCE_START_BUDGET_MS = 90_000;
const PERSISTENCE_RESERVE_MS = 15_000;
const LONDON_TIME_ZONE = "Europe/London";
const SCHEDULED_HOURS = new Set([9, 12, 15, 18]);

type AggregateResult = {
  sourceCount: number;
  failedSourceCount: number;
  receivedCount: number;
  eligibleCount: number;
  upsertedCount: number;
  unchangedCount: number;
};

type SourceResult = Omit<AggregateResult, "sourceCount"> & {
  completed: boolean;
};

class SourceFinalisationError extends Error {
  override readonly name = "SourceFinalisationError";
}

function response(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function unauthorised(): Response {
  const result = response({ error: "unauthorised" }, 401);
  result.headers.set("www-authenticate", "Bearer");
  return result;
}

function bearerToken(header: string | null): string {
  if (header === null) return "";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? "";
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
}

async function secretsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([
    digest(provided),
    digest(expected),
  ]);

  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0 && provided.length > 0;
}

export function isLondonScheduledSlot(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  return (
    weekday !== undefined &&
    weekday !== "Sat" &&
    weekday !== "Sun" &&
    SCHEDULED_HOURS.has(hour)
  );
}

function durationMilliseconds(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function sourceLog(
  dependencies: IngestionHandlerDependencies,
  invocationCorrelationId: string,
  claim: ClaimedIngestion,
  completion: SourceCompletion,
): void {
  const record: RuntimeLog = {
    event: "ingestion.source_completed",
    invocationCorrelationId,
    sourceCorrelationId: claim.correlationId,
    status: completion.status,
    receivedCount: completion.receivedCount,
    eligibleCount: completion.eligibleCount,
    upsertedCount: completion.upsertedCount,
    unchangedCount: completion.unchangedCount,
    durationMs: completion.durationMs,
    ...(completion.errorCode === null
      ? {}
      : { errorCode: completion.errorCode }),
  };
  dependencies.log(record);
}

async function finaliseFailure(options: {
  dependencies: IngestionHandlerDependencies;
  repository: ReturnType<IngestionHandlerDependencies["createRepository"]>;
  invocationCorrelationId: string;
  claim: ClaimedIngestion;
  startedAt: number;
  receivedCount: number;
  eligibleCount: number;
  upsertedCount: number;
  unchangedCount: number;
  retryCount: number;
  errorCode: string;
}): Promise<SourceResult> {
  const completion: SourceCompletion = {
    sourceRunId: options.claim.sourceRunId,
    status: "failed",
    responseComplete: false,
    receivedCount: options.receivedCount,
    eligibleCount: options.eligibleCount,
    upsertedCount: options.upsertedCount,
    unchangedCount: options.unchangedCount,
    durationMs: durationMilliseconds(
      options.startedAt,
      options.dependencies.now().getTime(),
    ),
    retryCount: options.retryCount,
    errorCode: options.errorCode,
  };

  try {
    await options.repository.finishSource(completion);
    await options.repository.completeRequest(options.claim.requestId);
    sourceLog(
      options.dependencies,
      options.invocationCorrelationId,
      options.claim,
      completion,
    );
  } catch {
    options.dependencies.log({
      event: "ingestion.source_finalisation_failed",
      invocationCorrelationId: options.invocationCorrelationId,
      sourceCorrelationId: options.claim.correlationId,
      status: "failed",
      errorCode: "source_finalisation_failed",
    });
  }

  return {
    completed: false,
    failedSourceCount: 1,
    receivedCount: completion.receivedCount,
    eligibleCount: completion.eligibleCount,
    upsertedCount: completion.upsertedCount,
    unchangedCount: completion.unchangedCount,
  };
}

async function processSource(options: {
  dependencies: IngestionHandlerDependencies;
  repository: ReturnType<IngestionHandlerDependencies["createRepository"]>;
  invocationCorrelationId: string;
  claim: ClaimedIngestion;
  environment: ReturnType<IngestionHandlerDependencies["readEnvironment"]>;
  invocationDeadlineAt: number;
}): Promise<SourceResult> {
  const startedAt = options.dependencies.now().getTime();
  let receivedCount = 0;
  let eligibleCount = 0;
  let upsertedCount = 0;
  let unchangedCount = 0;

  try {
    const adapter = options.dependencies.createAdapter(
      options.claim.source,
      options.environment,
    );
    const adapterBudgetMs = Math.max(
      1,
      options.invocationDeadlineAt -
        options.dependencies.now().getTime() -
        PERSISTENCE_RESERVE_MS,
    );
    const fetchResult = await adapter.fetchJobs(
      options.claim.source,
      AbortSignal.timeout(adapterBudgetMs),
    );
    const { jobs } = fetchResult;
    receivedCount = jobs.length;

    if (jobs.length > MAX_JOBS_PER_SOURCE) {
      return finaliseFailure({
        ...options,
        startedAt,
        receivedCount,
        eligibleCount,
        upsertedCount,
        unchangedCount,
        retryCount: 0,
        errorCode: "source_job_cap_reached",
      });
    }

    const eligibleJobs: NormalisedJob[] = [];
    for (const providerJob of jobs) {
      const result = await normaliseProviderJob(
        options.claim.source,
        providerJob,
      );
      if (result.outcome !== "eligible") continue;

      eligibleJobs.push(normalisedJobSchema.parse(result.job));
    }

    eligibleCount = eligibleJobs.length;
    if (eligibleJobs.length > 0) {
      const outcomes = await options.repository.upsertJobs(
        options.claim.sourceRunId,
        eligibleJobs,
      );
      upsertedCount = outcomes.insertedCount + outcomes.updatedCount;
      unchangedCount = outcomes.unchangedCount;
    }

    const completion: SourceCompletion = {
      sourceRunId: options.claim.sourceRunId,
      status: "succeeded",
      responseComplete: fetchResult.coverage === "complete",
      receivedCount,
      eligibleCount,
      upsertedCount,
      unchangedCount,
      durationMs: durationMilliseconds(
        startedAt,
        options.dependencies.now().getTime(),
      ),
      retryCount: 0,
      errorCode: null,
    };
    try {
      await options.repository.finishSource(completion);
      await options.repository.completeRequest(options.claim.requestId);
    } catch {
      throw new SourceFinalisationError();
    }
    sourceLog(
      options.dependencies,
      options.invocationCorrelationId,
      options.claim,
      completion,
    );

    return {
      completed: true,
      failedSourceCount: 0,
      receivedCount,
      eligibleCount,
      upsertedCount,
      unchangedCount,
    };
  } catch (error) {
    if (error instanceof SourceFinalisationError) {
      options.dependencies.log({
        event: "ingestion.source_finalisation_failed",
        invocationCorrelationId: options.invocationCorrelationId,
        sourceCorrelationId: options.claim.correlationId,
        status: "failed",
        errorCode: "source_finalisation_failed",
      });
      return {
        completed: false,
        failedSourceCount: 1,
        receivedCount,
        eligibleCount,
        upsertedCount,
        unchangedCount,
      };
    }

    return finaliseFailure({
      ...options,
      startedAt,
      receivedCount,
      eligibleCount,
      upsertedCount,
      unchangedCount,
      retryCount: retryCount(error),
      errorCode: runtimeErrorCode(error),
    });
  }
}

function declaredRequestTooLarge(request: Request): boolean {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) return false;
  if (!/^\d+$/.test(rawLength)) return true;
  return Number(rawLength) > MAX_REQUEST_BYTES;
}

async function requestBodyTooLarge(request: Request): Promise<boolean> {
  if (declaredRequestTooLarge(request)) return true;
  if (request.body === null) return false;

  const reader = request.body.getReader();
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return false;

      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return true;
      }
    }
  } catch {
    return true;
  } finally {
    reader.releaseLock();
  }
}

export function createIngestionHandler(
  dependencies: IngestionHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      const result = response({ error: "method_not_allowed" }, 405);
      result.headers.set("allow", "POST");
      return result;
    }

    let environment;
    try {
      environment = dependencies.readEnvironment();
    } catch {
      return response({ error: "runtime_unavailable" }, 503);
    }

    if (
      !(await secretsMatch(
        bearerToken(request.headers.get("authorization")),
        environment.cronSecret,
      ))
    ) {
      return unauthorised();
    }

    if (await requestBodyTooLarge(request)) {
      return response({ error: "request_too_large" }, 413);
    }

    const invocationCorrelationId = dependencies.randomUuid();
    const invocationStartedAt = dependencies.now();
    const invocationDeadlineAt =
      invocationStartedAt.getTime() + MAX_INVOCATION_MS;
    const repository = dependencies.createRepository(environment);
    const aggregate: AggregateResult = {
      sourceCount: 0,
      failedSourceCount: 0,
      receivedCount: 0,
      eligibleCount: 0,
      upsertedCount: 0,
      unchangedCount: 0,
    };

    try {
      if (isLondonScheduledSlot(invocationStartedAt)) {
        await repository.enqueueScheduled();
      }

      for (
        let sourceIndex = 0;
        sourceIndex < MAX_SOURCES_PER_INVOCATION;
        sourceIndex += 1
      ) {
        if (
          invocationDeadlineAt - dependencies.now().getTime() <
          MIN_SOURCE_START_BUDGET_MS
        ) {
          break;
        }

        const [claim] = await repository.claim(1);
        if (claim === undefined) break;

        aggregate.sourceCount += 1;
        const result = await processSource({
          dependencies,
          repository,
          invocationCorrelationId,
          claim,
          environment,
          invocationDeadlineAt,
        });
        aggregate.failedSourceCount += result.failedSourceCount;
        aggregate.receivedCount += result.receivedCount;
        aggregate.eligibleCount += result.eligibleCount;
        aggregate.upsertedCount += result.upsertedCount;
        aggregate.unchangedCount += result.unchangedCount;
      }
    } catch {
      dependencies.log({
        event: "ingestion.queue_failed",
        invocationCorrelationId,
        status: "failed",
        errorCode: "queue_unavailable",
      });
      return response(
        {
          correlationId: invocationCorrelationId,
          status: "unavailable",
        },
        503,
      );
    }

    const status =
      aggregate.sourceCount === 0
        ? "idle"
        : aggregate.failedSourceCount > 0
          ? "partial_failure"
          : "succeeded";
    dependencies.log({
      event: "ingestion.invocation_completed",
      invocationCorrelationId,
      status,
      receivedCount: aggregate.receivedCount,
      eligibleCount: aggregate.eligibleCount,
      upsertedCount: aggregate.upsertedCount,
      unchangedCount: aggregate.unchangedCount,
    });

    return response(
      {
        correlationId: invocationCorrelationId,
        status,
        ...aggregate,
      },
      200,
    );
  };
}
