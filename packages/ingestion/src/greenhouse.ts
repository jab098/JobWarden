import { z } from "zod";

import { isTransientStatus, retryDelayMilliseconds, sleep } from "./retry";
import type { Sleep } from "./retry";
import type { JobSource, ProviderAdapter, ProviderJob } from "./types";

const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;

const metadataPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const metadataValueSchema = z.union([
  metadataPrimitiveSchema,
  z.array(metadataPrimitiveSchema),
]);

const greenhouseResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number().int().nonnegative(), z.string().min(1).max(200)]),
      title: z.string(),
      location: z.object({ name: z.string() }),
      content: z.string(),
      absolute_url: z.string(),
      updated_at: z.iso.datetime({ offset: true }).nullable(),
      metadata: z
        .array(
          z.object({
            name: z.string(),
            value: metadataValueSchema,
          }),
        )
        .nullable(),
    }),
  ),
});

export type AdapterErrorCode =
  "aborted" | "timeout" | "network_error" | "http_error" | "invalid_response";

export class AdapterError extends Error {
  readonly name = "AdapterError";

  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly attempts: number,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export type GreenhouseAdapterOptions = {
  fetch?: typeof fetch;
  sleep?: Sleep;
  random?: () => number;
  createTimeoutSignal?: (milliseconds: number) => AbortSignal;
  timeoutMs?: number;
  maxRetryAfterMs?: number;
};

function stablePrimitiveText(
  value: z.infer<typeof metadataPrimitiveSchema>,
): string {
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(value);
  return String(value);
}

function stableMetadataValue(
  value: z.infer<typeof metadataValueSchema>,
): string {
  return Array.isArray(value)
    ? value.map(stablePrimitiveText).join(", ")
    : stablePrimitiveText(value);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function callerAborted(attempts: number): AdapterError {
  return new AdapterError(
    "aborted",
    "Greenhouse request was cancelled by the caller.",
    attempts,
  );
}

export class GreenhouseAdapter implements ProviderAdapter {
  readonly #fetch: typeof fetch;
  readonly #sleep: Sleep;
  readonly #random: () => number;
  readonly #createTimeoutSignal: (milliseconds: number) => AbortSignal;
  readonly #timeoutMs: number;
  readonly #maxRetryAfterMs: number;

  constructor(options: GreenhouseAdapterOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? sleep;
    this.#random = options.random ?? Math.random;
    this.#createTimeoutSignal =
      options.createTimeoutSignal ??
      ((milliseconds) => AbortSignal.timeout(milliseconds));
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetryAfterMs =
      options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  }

  async #waitBeforeRetry(
    retryNumber: number,
    retryAfter: string | null,
    attempts: number,
    callerSignal?: AbortSignal,
  ): Promise<void> {
    const delay = retryDelayMilliseconds({
      retryNumber,
      retryAfter,
      maximumRetryAfterMilliseconds: this.#maxRetryAfterMs,
      random: this.#random,
    });

    try {
      await this.#sleep(delay, callerSignal);
    } catch {
      if (callerSignal?.aborted) throw callerAborted(attempts);
      throw new AdapterError(
        "network_error",
        "Greenhouse retry scheduling failed.",
        attempts,
      );
    }
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderJob[]> {
    const endpoint = new URL(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs`,
    );
    endpoint.searchParams.set("content", "true");

    let attempts = 0;
    for (let retryNumber = 1; retryNumber <= MAX_ATTEMPTS; retryNumber += 1) {
      if (callerSignal?.aborted) throw callerAborted(attempts);

      const timeoutSignal = this.#createTimeoutSignal(this.#timeoutMs);
      const requestSignal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : timeoutSignal;
      attempts += 1;

      let response: Response;
      try {
        response = await this.#fetch(endpoint, {
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/json",
            "User-Agent": "JobWarden/0.1 (+private UK job index)",
          },
          signal: requestSignal,
        });
      } catch {
        if (callerSignal?.aborted) throw callerAborted(attempts);

        const code = timeoutSignal.aborted ? "timeout" : "network_error";
        if (attempts === MAX_ATTEMPTS) {
          throw new AdapterError(
            code,
            code === "timeout"
              ? "Greenhouse request timed out after bounded retries."
              : "Greenhouse request failed after bounded retries.",
            attempts,
          );
        }

        await this.#waitBeforeRetry(retryNumber, null, attempts, callerSignal);
        continue;
      }

      if (callerSignal?.aborted) throw callerAborted(attempts);

      if (!response.ok) {
        if (isTransientStatus(response.status) && attempts < MAX_ATTEMPTS) {
          await this.#waitBeforeRetry(
            retryNumber,
            response.headers.get("retry-after"),
            attempts,
            callerSignal,
          );
          continue;
        }

        throw new AdapterError(
          "http_error",
          `Greenhouse request failed with HTTP status ${response.status}.`,
          attempts,
          response.status,
        );
      }

      let untrustedPayload: unknown;
      try {
        untrustedPayload = await response.json();
      } catch {
        if (callerSignal?.aborted) throw callerAborted(attempts);
        throw new AdapterError(
          "invalid_response",
          "Greenhouse returned an invalid JSON response.",
          attempts,
        );
      }

      if (callerSignal?.aborted) throw callerAborted(attempts);

      const result = greenhouseResponseSchema.safeParse(untrustedPayload);
      if (!result.success) {
        throw new AdapterError(
          "invalid_response",
          "Greenhouse response did not match the expected schema.",
          attempts,
        );
      }

      return result.data.jobs.map((job) => ({
        providerJobId: String(job.id),
        title: job.title,
        location: job.location.name,
        descriptionHtml: job.content,
        absoluteUrl: job.absolute_url,
        updatedAt: job.updated_at,
        metadataText: (job.metadata ?? [])
          .map(
            (metadata) =>
              `${metadata.name}: ${stableMetadataValue(metadata.value)}`,
          )
          .sort(compareText),
      }));
    }

    throw new AdapterError(
      "network_error",
      "Greenhouse request exhausted its bounded retry policy.",
      attempts,
    );
  }
}
