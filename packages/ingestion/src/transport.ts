import type { z } from "zod";

import { isTransientStatus, retryDelayMilliseconds, sleep } from "./retry.ts";
import type { Sleep } from "./retry.ts";

/**
 * The bounded JSON transport every single-request provider adapter shares.
 *
 * Four adapters — Greenhouse, Lever, Ashby and Teaching Vacancies — each held a
 * byte-identical copy of this loop, differing only in the provider name inside
 * their error messages. The Lever copy carried a `ponytail:` marker naming five
 * copies as the point where extracting it pays; Ashby was the fifth.
 *
 * **Reed deliberately does not use this**, and that is not an oversight. Reed
 * refuses to retry HTTP 429 at all (`response.status !== 429 &&
 * isTransientStatus(...)`), because a rate limit from a credentialed API is a
 * signal to stop rather than to back off and try again. It also sends an
 * `Authorization` header and hands its caller the raw payload to parse. Folding
 * Reed in would either silently start retrying rate limits against a
 * credentialed provider or push a flag into this class for one caller. If a
 * future provider genuinely needs either behaviour, give it its own path rather
 * than widening this one.
 *
 * Nothing here logs, embeds, or re-throws a provider response body. An error
 * carries a fixed sentence, the provider's name, the attempt count, and for an
 * HTTP failure the status code — never the payload.
 */

export type AdapterErrorCode =
  | "timeout"
  | "network_error"
  | "aborted"
  | "http_error"
  | "invalid_response"
  | "configuration_error";

export class AdapterError extends Error {
  override readonly name = "AdapterError";

  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly attempts: number,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** Every adapter stops after three attempts, including the first. */
export const MAX_ATTEMPTS = 3;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;

export type BoundedTransportOptions = {
  fetch?: typeof fetch;
  sleep?: Sleep;
  random?: () => number;
  now?: () => number;
  createTimeoutSignal?: (milliseconds: number) => AbortSignal;
  timeoutMs?: number;
  maxRetryAfterMs?: number;
};

export class BoundedJsonTransport {
  readonly #provider: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: Sleep;
  readonly #random: () => number;
  readonly #nowFn: () => number;
  readonly #createTimeoutSignal: (milliseconds: number) => AbortSignal;
  readonly #timeoutMs: number;
  readonly #maxRetryAfterMs: number;

  /**
   * @param provider The name used in every error message this transport
   *   raises — "Greenhouse", "Lever", "Ashby", "Teaching Vacancies". It is the
   *   only per-adapter difference in the loop, which is why it is the only
   *   thing the adapter has to say.
   * @param defaultTimeoutMs Teaching Vacancies allows 10s where the ATS boards
   *   allow 8s, so the default is a parameter rather than a constant.
   */
  constructor(
    provider: string,
    options: BoundedTransportOptions = {},
    defaultTimeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    this.#provider = provider;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? sleep;
    this.#random = options.random ?? Math.random;
    this.#nowFn = options.now ?? Date.now;
    this.#createTimeoutSignal =
      options.createTimeoutSignal ??
      ((milliseconds) => AbortSignal.timeout(milliseconds));
    this.#timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.#maxRetryAfterMs =
      options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  }

  /** The injected clock, which adapters need for observation timestamps. */
  now(): number {
    return this.#nowFn();
  }

  #callerAborted(attempts: number): AdapterError {
    return new AdapterError(
      "aborted",
      `${this.#provider} request was cancelled by the caller.`,
      attempts,
    );
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
      now: this.#nowFn,
    });

    try {
      await this.#sleep(delay, callerSignal);
    } catch {
      if (callerSignal?.aborted) throw this.#callerAborted(attempts);
      throw new AdapterError(
        "network_error",
        `${this.#provider} retry scheduling failed.`,
        attempts,
      );
    }
  }

  async #retryTransportFailure(
    code: "timeout" | "network_error",
    retryNumber: number,
    attempts: number,
    callerSignal?: AbortSignal,
  ): Promise<void> {
    if (attempts === MAX_ATTEMPTS) {
      throw new AdapterError(
        code,
        code === "timeout"
          ? `${this.#provider} request timed out after bounded retries.`
          : `${this.#provider} request failed after bounded retries.`,
        attempts,
      );
    }

    await this.#waitBeforeRetry(retryNumber, null, attempts, callerSignal);
  }

  /**
   * Reads one URL and returns its schema-validated payload.
   *
   * The response is validated in full before any part of it is trusted, and a
   * validation failure raises a fixed sentence rather than echoing what
   * arrived. `redirect: "error"` refuses a redirect outright rather than
   * following a provider somewhere else.
   *
   * A paginating adapter calls this once per page; a whole-board adapter calls
   * it once. The retry budget is per call, which is what the paginating
   * adapters already did.
   */
  async requestJson<T>(
    url: URL | string,
    schema: z.ZodType<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    let attempts = 0;

    for (let retryNumber = 1; retryNumber <= MAX_ATTEMPTS; retryNumber += 1) {
      if (callerSignal?.aborted) throw this.#callerAborted(attempts);

      const timeoutSignal = this.#createTimeoutSignal(this.#timeoutMs);
      const requestSignal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : timeoutSignal;
      attempts += 1;

      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/json",
            "User-Agent": "JobWarden/0.1 (+private UK job index)",
          },
          signal: requestSignal,
        });
      } catch {
        if (callerSignal?.aborted) throw this.#callerAborted(attempts);

        const code = timeoutSignal.aborted ? "timeout" : "network_error";
        await this.#retryTransportFailure(
          code,
          retryNumber,
          attempts,
          callerSignal,
        );
        continue;
      }

      if (callerSignal?.aborted) throw this.#callerAborted(attempts);

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
          `${this.#provider} request failed with HTTP status ${response.status}.`,
          attempts,
          response.status,
        );
      }

      let responseBody: string;
      try {
        responseBody = await response.text();
      } catch {
        if (callerSignal?.aborted) throw this.#callerAborted(attempts);

        const code = timeoutSignal.aborted ? "timeout" : "network_error";
        await this.#retryTransportFailure(
          code,
          retryNumber,
          attempts,
          callerSignal,
        );
        continue;
      }

      if (callerSignal?.aborted) throw this.#callerAborted(attempts);
      if (timeoutSignal.aborted) {
        await this.#retryTransportFailure(
          "timeout",
          retryNumber,
          attempts,
          callerSignal,
        );
        continue;
      }

      let untrustedPayload: unknown;
      try {
        untrustedPayload = JSON.parse(responseBody) as unknown;
      } catch {
        throw new AdapterError(
          "invalid_response",
          `${this.#provider} returned invalid JSON syntax.`,
          attempts,
        );
      }

      const result = schema.safeParse(untrustedPayload);
      if (!result.success) {
        throw new AdapterError(
          "invalid_response",
          `${this.#provider} response did not match the expected schema.`,
          attempts,
        );
      }

      return result.data;
    }

    throw new AdapterError(
      "network_error",
      `${this.#provider} request exhausted its bounded retry policy.`,
      attempts,
    );
  }
}
