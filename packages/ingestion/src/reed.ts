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

const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;
const MAX_RESULTS = 50;
const DETAIL_CONCURRENCY = 4;

const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      jobId: z.union([
        z.number().int().nonnegative(),
        z.string().min(1).max(200),
      ]),
    }),
  ),
});

const nullableText = z.string().nullable().optional();
const nullableNumber = z.number().finite().nonnegative().nullable().optional();

const jobDetailSchema = z.object({
  jobId: z.union([z.number().int().nonnegative(), z.string().min(1).max(200)]),
  employerName: z.string().min(1),
  jobTitle: z.string().min(1),
  locationName: z.string(),
  jobDescription: z.string(),
  jobUrl: z.url(),
  externalUrl: nullableText,
  date: nullableText,
  expirationDate: nullableText,
  minimumSalary: nullableNumber,
  maximumSalary: nullableNumber,
  currency: nullableText,
  salaryType: nullableText,
  contractType: nullableText,
  jobType: nullableText,
});

export type ReedAdapterOptions = {
  apiKey: string;
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
    "Reed request was cancelled by the caller.",
    attempts,
  );
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function compensationPeriod(
  value: string | null | undefined,
): NonNullable<ProviderJob["compensation"]>["period"] {
  const normalised = value?.trim().toLowerCase();
  if (normalised === "hourly") return "hour";
  if (normalised === "daily") return "day";
  if (normalised === "weekly") return "week";
  if (normalised === "monthly") return "month";
  if (normalised === "yearly" || normalised === "annual") return "year";
  return "unknown";
}

function employmentType(
  value: string | null | undefined,
): ProviderJob["employmentType"] {
  const normalised = value?.replace(/[^a-z]/gi, "").toLowerCase();
  if (normalised === "permanent") return "permanent";
  if (normalised === "contract") return "contract";
  if (normalised === "temporary") return "temporary";
  return "unknown";
}

function workingTime(
  value: string | null | undefined,
): ProviderJob["workingTime"] {
  const normalised = value?.replace(/[^a-z]/gi, "").toLowerCase();
  if (normalised === "parttime") return "part_time";
  if (normalised === "fulltime") return "full_time";
  return "unknown";
}

function compensationRaw(
  currency: string | null | undefined,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
  period: NonNullable<ProviderJob["compensation"]>["period"],
): string | null {
  if (currency !== "GBP" || (minimum == null && maximum == null)) return null;
  const amount =
    minimum != null && maximum != null
      ? `${minimum} - ${maximum}`
      : String(minimum ?? maximum);
  return `GBP ${amount}${period === "unknown" ? "" : ` per ${period}`}`;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        const value = values[index];
        if (value !== undefined) result[index] = await map(value);
      }
    },
  );
  await Promise.all(workers);
  return result;
}

export class ReedAdapter implements ProviderAdapter {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: Sleep;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #createTimeoutSignal: (milliseconds: number) => AbortSignal;
  readonly #timeoutMs: number;
  readonly #maxRetryAfterMs: number;

  constructor(options: ReedAdapterOptions) {
    this.#apiKey = options.apiKey.trim();
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

  async #request(url: URL, callerSignal?: AbortSignal): Promise<unknown> {
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
        response = await this.#fetch(url, {
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${btoa(`${this.#apiKey}:`)}`,
            "User-Agent": "JobWarden/0.1 (+private UK job index)",
          },
          signal: requestSignal,
        });
      } catch {
        if (callerSignal?.aborted) throw callerAborted(attempts);
        if (attempts === MAX_ATTEMPTS) {
          throw new AdapterError(
            timeoutSignal.aborted ? "timeout" : "network_error",
            "Reed request failed after bounded retries.",
            attempts,
          );
        }
        await this.#sleep(
          retryDelayMilliseconds({
            retryNumber,
            retryAfter: null,
            maximumRetryAfterMilliseconds: this.#maxRetryAfterMs,
            random: this.#random,
            now: this.#now,
          }),
          callerSignal,
        );
        continue;
      }

      if (!response.ok) {
        const mayRetry =
          response.status !== 429 && isTransientStatus(response.status);
        if (mayRetry && attempts < MAX_ATTEMPTS) {
          await this.#sleep(
            retryDelayMilliseconds({
              retryNumber,
              retryAfter: response.headers.get("retry-after"),
              maximumRetryAfterMilliseconds: this.#maxRetryAfterMs,
              random: this.#random,
              now: this.#now,
            }),
            callerSignal,
          );
          continue;
        }
        throw new AdapterError(
          "http_error",
          `Reed request failed with HTTP status ${response.status}.`,
          attempts,
          response.status,
        );
      }

      let body: string;
      try {
        body = await response.text();
      } catch {
        throw new AdapterError(
          timeoutSignal.aborted ? "timeout" : "network_error",
          "Reed response could not be read.",
          attempts,
        );
      }

      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new AdapterError(
          "invalid_response",
          "Reed returned invalid JSON syntax.",
          attempts,
        );
      }
    }

    throw new AdapterError(
      "network_error",
      "Reed request exhausted its bounded retry policy.",
      MAX_ATTEMPTS,
    );
  }

  async #fetchDetail(
    jobId: string,
    observedAt: string,
    callerSignal?: AbortSignal,
  ): Promise<ProviderJob> {
    const payload = await this.#request(
      new URL(
        `https://www.reed.co.uk/api/1.0/jobs/${encodeURIComponent(jobId)}`,
      ),
      callerSignal,
    );
    const parsed = jobDetailSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdapterError(
        "invalid_response",
        "Reed job detail did not match the expected schema.",
        1,
      );
    }

    const job = parsed.data;
    const period = compensationPeriod(job.salaryType);
    const isGbp = job.currency?.trim().toUpperCase() === "GBP";
    const minimum = isGbp ? (job.minimumSalary ?? null) : null;
    const maximum = isGbp ? (job.maximumSalary ?? null) : null;
    const raw = compensationRaw(isGbp ? "GBP" : null, minimum, maximum, period);

    return {
      providerJobId: String(job.jobId),
      title: job.jobTitle,
      employerName: job.employerName,
      location: job.locationName,
      descriptionHtml: job.jobDescription,
      absoluteUrl: job.jobUrl,
      canonicalApplicationUrl: job.externalUrl ?? null,
      updatedAt: null,
      postedAt: isoDate(job.date),
      closesAt: isoDate(job.expirationDate),
      metadataText: [
        job.contractType ? `Contract type: ${job.contractType}` : null,
        job.jobType ? `Job type: ${job.jobType}` : null,
      ].filter((value): value is string => value !== null),
      employmentType: employmentType(job.contractType),
      workingTime: workingTime(job.jobType),
      compensation: {
        raw,
        minimum,
        maximum,
        currency: isGbp ? "GBP" : null,
        period,
        provenance: raw ? "advertised" : "unknown",
        observedAt: raw ? observedAt : null,
      },
    };
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (!this.#apiKey) {
      throw new AdapterError(
        "configuration_error",
        "Reed API key is not configured.",
        0,
      );
    }
    if (source.provider !== "reed") {
      throw new AdapterError(
        "configuration_error",
        "Reed adapter requires a Reed source.",
        0,
      );
    }

    const searchUrl = new URL("https://www.reed.co.uk/api/1.0/search");
    searchUrl.searchParams.set("resultsToTake", String(MAX_RESULTS));
    searchUrl.searchParams.set("resultsToSkip", "0");
    searchUrl.searchParams.set("sortBy", "DisplayDate");
    const payload = await this.#request(searchUrl, callerSignal);
    const parsed = searchResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdapterError(
        "invalid_response",
        "Reed search response did not match the expected schema.",
        1,
      );
    }

    const observedAt = new Date(this.#now()).toISOString();
    const jobIds = parsed.data.results
      .slice(0, MAX_RESULTS)
      .map(({ jobId }) => String(jobId));
    const jobs = await mapConcurrent(jobIds, DETAIL_CONCURRENCY, (jobId) =>
      this.#fetchDetail(jobId, observedAt, callerSignal),
    );

    return { coverage: "incremental", jobs };
  }
}
