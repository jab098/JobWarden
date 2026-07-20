import { z } from "zod";

import { AdapterError } from "./greenhouse.ts";
import { isTransientStatus, retryDelayMilliseconds, sleep } from "./retry.ts";
import type { Sleep } from "./retry.ts";
import type {
  JobSource,
  ProviderAdapter,
  ProviderFetchResult,
  ProviderJob,
} from "./types.ts";

// ponytail: a third copy of the bounded transport loop, matching Greenhouse
// and Reed rather than refactoring two reviewed security-sensitive adapters as
// a side effect of adding a third. Greenhouse and Lever are the two with a
// genuinely identical shape; if Ashby and Workable also duplicate it, five
// copies is where extracting a shared transport pays.
const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;

/**
 * Lever's documented public postings response, validated in full before any
 * part of it is trusted. Fields JobWarden does not use are deliberately absent
 * rather than accepted and ignored, so a shape change is a schema failure
 * instead of a silent behaviour change.
 *
 * `salaryRange` is optional because most adverts omit it; when it is absent the
 * compensation provenance is `unknown` and no figure is invented.
 */
const leverPostingSchema = z.object({
  id: z.string().min(1).max(200),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string(),
  createdAt: z.number().int().nonnegative().nullable().optional(),
  categories: z
    .object({
      location: z.string().nullable().optional(),
      commitment: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  descriptionPlain: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  additionalPlain: z.string().nullable().optional(),
  additional: z.string().nullable().optional(),
  lists: z
    .array(z.object({ text: z.string(), content: z.string() }))
    .nullable()
    .optional(),
  salaryRange: z
    .object({
      currency: z.string().nullable().optional(),
      interval: z.string().nullable().optional(),
      min: z.number().finite().nullable().optional(),
      max: z.number().finite().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const leverResponseSchema = z.array(leverPostingSchema);

export type LeverAdapterOptions = {
  fetch?: typeof fetch;
  sleep?: Sleep;
  random?: () => number;
  now?: () => number;
  createTimeoutSignal?: (milliseconds: number) => AbortSignal;
  timeoutMs?: number;
  maxRetryAfterMs?: number;
};

function callerAborted(attempts: number): AdapterError {
  return new AdapterError(
    "aborted",
    "Lever request was cancelled by the caller.",
    attempts,
  );
}

/**
 * Lever's commitment is free employer text. It informs employment type only.
 * IR35 is never inferred from it: a contract is not evidence of a determination,
 * and `AGENTS.md` forbids the inference outright.
 */
export function classifyCommitment(
  commitment: string | null | undefined,
): ProviderJob["employmentType"] {
  const value = (commitment ?? "").trim().toLowerCase();
  if (value === "") return "unknown";
  if (value.includes("intern")) return "internship";
  if (value.includes("apprentice")) return "apprenticeship";
  if (value.includes("temp")) return "temporary";
  if (value.includes("fixed term") || value.includes("fixed-term")) {
    return "fixed_term";
  }
  if (value.includes("contract")) return "contract";
  if (value.includes("zero hour") || value.includes("zero-hour")) {
    return "zero_hours";
  }
  if (value.includes("casual")) return "casual";
  if (value.includes("full-time") || value.includes("full time")) {
    return "permanent";
  }
  return "unknown";
}

/**
 * Lever documents intervals such as `per-year-salary` and `per-hour-wage`. Only
 * an interval JobWarden actually recognises produces a period; anything else is
 * `unknown`, which keeps an unrecognised interval from being quietly read as a
 * yearly salary.
 */
export function classifySalaryInterval(
  interval: string | null | undefined,
): NonNullable<ProviderJob["compensation"]>["period"] {
  const value = (interval ?? "").trim().toLowerCase();
  if (value.includes("hour")) return "hour";
  if (value.includes("day")) return "day";
  if (value.includes("week")) return "week";
  if (value.includes("month")) return "month";
  if (value.includes("year") || value.includes("annum")) return "year";
  return "unknown";
}

/**
 * Advertised only when the employer actually stated a GBP figure. A range in
 * another currency, or one with no bound at all, carries no GBP claim, so it
 * stays `unknown` rather than being converted or guessed at.
 */
export function toCompensation(
  salaryRange: z.infer<typeof leverPostingSchema>["salaryRange"],
): ProviderJob["compensation"] {
  const currency = salaryRange?.currency?.trim().toUpperCase() ?? null;
  const minimum = salaryRange?.min ?? null;
  const maximum = salaryRange?.max ?? null;
  const period = classifySalaryInterval(salaryRange?.interval);

  if (currency !== "GBP" || (minimum === null && maximum === null)) {
    return {
      raw: null,
      minimum: null,
      maximum: null,
      currency: null,
      period: "unknown",
      provenance: "unknown",
      observedAt: null,
    };
  }

  const amount =
    minimum !== null && maximum !== null
      ? `${minimum} - ${maximum}`
      : String(minimum ?? maximum);

  return {
    raw: `GBP ${amount}${period === "unknown" ? "" : ` per ${period}`}`,
    minimum,
    maximum,
    currency: "GBP",
    period,
    provenance: "advertised",
    observedAt: null,
  };
}

/**
 * The advert text the classifier reads. Lever splits a posting across an
 * opening, structured lists, and a closing block; all three carry UK
 * eligibility statements in practice, so all three are joined. HTML is
 * preferred where present because the shared sanitiser strips non-visible and
 * unsafe content before any classifier sees it.
 */
export function toDescriptionHtml(
  posting: z.infer<typeof leverPostingSchema>,
): string {
  const listMarkup = (posting.lists ?? [])
    .map((list) => `<h3>${list.text}</h3>${list.content}`)
    .join("");

  return [
    posting.description ?? posting.descriptionPlain ?? "",
    listMarkup,
    posting.additional ?? posting.additionalPlain ?? "",
  ]
    .filter((part) => part !== "")
    .join("");
}

export class LeverAdapter implements ProviderAdapter {
  readonly #fetch: typeof fetch;
  readonly #sleep: Sleep;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #createTimeoutSignal: (milliseconds: number) => AbortSignal;
  readonly #timeoutMs: number;
  readonly #maxRetryAfterMs: number;

  constructor(options: LeverAdapterOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? sleep;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
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
      now: this.#now,
    });

    try {
      await this.#sleep(delay, callerSignal);
    } catch {
      if (callerSignal?.aborted) throw callerAborted(attempts);
      throw new AdapterError(
        "network_error",
        "Lever retry scheduling failed.",
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
          ? "Lever request timed out after bounded retries."
          : "Lever request failed after bounded retries.",
        attempts,
      );
    }

    await this.#waitBeforeRetry(retryNumber, null, attempts, callerSignal);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "lever") {
      throw new AdapterError(
        "configuration_error",
        "Lever adapter requires a Lever source.",
        0,
      );
    }

    const endpoint = new URL(
      `https://api.lever.co/v0/postings/${encodeURIComponent(source.boardToken)}`,
    );
    endpoint.searchParams.set("mode", "json");

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
        await this.#retryTransportFailure(
          code,
          retryNumber,
          attempts,
          callerSignal,
        );
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
          `Lever request failed with HTTP status ${response.status}.`,
          attempts,
          response.status,
        );
      }

      let responseBody: string;
      try {
        responseBody = await response.text();
      } catch {
        if (callerSignal?.aborted) throw callerAborted(attempts);

        const code = timeoutSignal.aborted ? "timeout" : "network_error";
        await this.#retryTransportFailure(
          code,
          retryNumber,
          attempts,
          callerSignal,
        );
        continue;
      }

      if (callerSignal?.aborted) throw callerAborted(attempts);
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
          "Lever returned invalid JSON syntax.",
          attempts,
        );
      }

      const result = leverResponseSchema.safeParse(untrustedPayload);
      if (!result.success) {
        throw new AdapterError(
          "invalid_response",
          "Lever response did not match the expected schema.",
          attempts,
        );
      }

      return {
        // One request returns the whole board, so the existing
        // two-consecutive-omissions closure rule applies as it does to
        // Greenhouse. This is not incremental discovery like Reed.
        coverage: "complete",
        jobs: result.data.map((posting) => ({
          providerJobId: posting.id,
          title: posting.text,
          // The classifier's location evidence. `country` is deliberately not
          // used here: synthesising a location string from an ISO code would
          // fabricate evidence the advert never stated, and teaching the
          // classifier to read a provider's country assertion changes the
          // eligibility contract for every provider, which is its own task.
          location: posting.categories?.location ?? "",
          descriptionHtml: toDescriptionHtml(posting),
          absoluteUrl: posting.hostedUrl,
          canonicalApplicationUrl: posting.applyUrl,
          updatedAt: null,
          postedAt:
            posting.createdAt == null
              ? null
              : new Date(posting.createdAt).toISOString(),
          metadataText: [],
          employmentType: classifyCommitment(posting.categories?.commitment),
          compensation: toCompensation(posting.salaryRange),
        })),
      };
    }

    throw new AdapterError(
      "network_error",
      "Lever request exhausted its bounded retry policy.",
      attempts,
    );
  }
}
