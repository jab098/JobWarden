import { z } from "zod";

import { AdapterError, BoundedJsonTransport } from "./transport.ts";
import type { BoundedTransportOptions } from "./transport.ts";
import type {
  JobSource,
  ProviderAdapter,
  ProviderCompensation,
  ProviderFetchResult,
  ProviderJob,
} from "./types.ts";

const ENDPOINT = "https://api.adzuna.com/v1/api/jobs/gb/search";

/** The provider's own maximum. Asking for more is silently truncated. */
const RESULTS_PER_PAGE = 50;

/**
 * Pages read per run.
 *
 * The licence caps use at 25 requests/minute, 250/day, 1,000/week and
 * **2,500/month**, and the monthly figure binds first: 2,500 over 30 days is
 * roughly 83 requests a day for the whole product. Four pages is 200 adverts a
 * run, which at the owner's chosen cadence stays inside every ceiling with
 * room to spare.
 *
 * Coverage is therefore incremental by construction — 726,430 GB adverts were
 * indexed when this was written, and no bounded free-tier read approaches that.
 * An absent advert is never evidence that a role closed.
 */
const DEFAULT_MAX_PAGES = 4;

const DEFAULT_TIMEOUT_MS = 10_000;

const locationSchema = z.object({
  display_name: z.string().max(500).nullish(),
  /**
   * Most general first: `["UK", "Scotland", "Perth and Kinross", "Caputh"]`.
   * Observed between one and six deep.
   */
  area: z.array(z.string().max(200)).max(20).nullish(),
});

const resultSchema = z.object({
  id: z.union([z.string().min(1).max(200), z.number()]),
  title: z.string().max(500),
  description: z.string().max(100_000),
  created: z.string().max(100),
  redirect_url: z.string().min(1).max(2_000),
  company: z.object({ display_name: z.string().max(300).nullish() }).nullish(),
  location: locationSchema.nullish(),
  category: z.object({ label: z.string().max(200).nullish() }).nullish(),
  contract_type: z.string().max(100).nullish(),
  contract_time: z.string().max(100).nullish(),
  salary_min: z.number().finite().nullish(),
  salary_max: z.number().finite().nullish(),
  /**
   * A **string** `"0"` or `"1"`, not a boolean. Read it as written rather than
   * coercing, so a future shape change fails loudly instead of quietly
   * reading as false and publishing a prediction as an advertised salary.
   */
  salary_is_predicted: z.string().max(10).nullish(),
});

const searchResponseSchema = z.object({
  results: z.array(resultSchema).max(200),
  count: z.number().finite().nullish(),
});

export type AdzunaAdapterOptions = BoundedTransportOptions & {
  appId: string;
  appKey: string;
  maxPages?: number;
};

/**
 * A figure Adzuna states, or nothing.
 *
 * Two shapes in the live data would publish a wrong salary if taken at face
 * value, and both were observed in a sample of fifty:
 *
 * - **`salary_min` is `0` on 42% of adverts** while `salary_max` carries a real
 *   figure. Zero is the provider's way of saying "no minimum stated", not a
 *   salary of nothing, and recording it would advertise a £0 floor.
 * - **26% are predictions**, flagged `salary_is_predicted: "1"`. Those are
 *   Adzuna's model output, not the employer's words, so they are `estimated`
 *   and must never read as `advertised`.
 *
 * The period is deliberately `unknown`. Adzuna states none, and the figures are
 * not consistently annual — the same sample carried both `45000` and `29`. The
 * mean across the index is £43,346, which makes most of them look annual, and
 * that is exactly the reasoning that published an hourly Teaching Vacancies
 * rate as a yearly one. An unstated period stays unstated.
 */
function readCompensation(
  result: z.infer<typeof resultSchema>,
  observedAt: string,
): ProviderCompensation {
  const stated = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;

  const minimum = stated(result.salary_min);
  const maximum = stated(result.salary_max);

  if (minimum === null && maximum === null) {
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

  const predicted = result.salary_is_predicted === "1";
  return {
    // The provider gives no salary text, only figures, so there is no advertised
    // wording to preserve. Recording a sentence we composed would read as the
    // employer's words.
    raw: null,
    minimum,
    maximum,
    // Major units. Adzuna publishes pounds, and `normaliseProviderJob` converts.
    currency: "GBP",
    period: "unknown",
    provenance: predicted ? "estimated" : "advertised",
    observedAt,
  };
}

/**
 * The place the advert names.
 *
 * `area[0]` is always the literal `"UK"` — the provider asserting the country —
 * and it is never used. The Lever and Teaching Vacancies adapters record why:
 * making a provider's country assertion into the eligibility evidence changes
 * the contract for every provider and is its own task. `display_name` is the
 * settlement the advert itself names, which is what `classifyUkEligibility` is
 * built to read, with the most specific area as a fallback when it is absent.
 *
 * **The gazetteer, not this function, is what limits Adzuna's yield.** Measured
 * over fifty live adverts: `display_name` alone published 8, the most specific
 * area 11, and joining the whole hierarchy only 9 of 100 — every strategy loses
 * roughly four fifths to `ambiguous_uk_eligibility`, because Adzuna surfaces
 * small settlements the gazetteer does not carry: Caputh, Helsington,
 * Whittington Moor, Newport-On-Tay. That is the same missing-settlement gap
 * already recorded against `uk-places.generated.json`, and widening it is a
 * data task that lifts every source at once rather than something to tune here.
 * Do not be tempted to read `area[0]` to close it.
 */
function locationText(location: z.infer<typeof locationSchema> | null): string {
  const named = (location?.display_name ?? "").trim();
  if (named.length > 0) return named;

  const areas = (location?.area ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.toUpperCase() !== "UK");

  return areas.at(-1) ?? "";
}

export class AdzunaAdapter implements ProviderAdapter {
  readonly #transport: BoundedJsonTransport;
  readonly #appId: string;
  readonly #appKey: string;
  readonly #maxPages: number;

  constructor(options: AdzunaAdapterOptions) {
    const { appId, appKey, maxPages, ...transportOptions } = options;
    this.#transport = new BoundedJsonTransport(
      "Adzuna",
      transportOptions,
      DEFAULT_TIMEOUT_MS,
    );
    this.#appId = appId;
    this.#appKey = appKey;
    this.#maxPages = Math.max(1, maxPages ?? DEFAULT_MAX_PAGES);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "adzuna") {
      throw new AdapterError(
        "configuration_error",
        "Adzuna adapter requires an Adzuna source.",
        0,
      );
    }

    const jobs: ProviderJob[] = [];
    const seen = new Set<string>();
    const observedAt = new Date().toISOString();

    for (let page = 1; page <= this.#maxPages; page += 1) {
      const endpoint = new URL(`${ENDPOINT}/${page}`);
      endpoint.searchParams.set("app_id", this.#appId);
      endpoint.searchParams.set("app_key", this.#appKey);
      endpoint.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
      endpoint.searchParams.set("content-type", "application/json");

      const data = await this.#transport.requestJson(
        endpoint,
        searchResponseSchema,
        callerSignal,
      );

      for (const result of data.results) {
        const providerJobId = String(result.id);
        // The provider paginates a moving index, so the same advert can appear
        // on two pages of one run.
        if (seen.has(providerJobId)) continue;
        seen.add(providerJobId);

        jobs.push({
          providerJobId,
          title: result.title,
          location: locationText(result.location ?? null),
          // Adzuna truncates every description to 500 characters and appends an
          // ellipsis. It is plain text, not markup, and the full advert exists
          // only behind the redirect.
          descriptionHtml: result.description,
          absoluteUrl: result.redirect_url,
          canonicalApplicationUrl: result.redirect_url,
          employerName: result.company?.display_name ?? null,
          updatedAt: result.created,
          metadataText: [
            result.category?.label ? `Category: ${result.category.label}` : "",
            result.contract_type
              ? `Contract type: ${result.contract_type}`
              : "",
            result.contract_time
              ? `Contract time: ${result.contract_time}`
              : "",
          ].filter((value) => value.length > 0),
          compensation: readCompensation(result, observedAt),
        });
      }

      if (data.results.length < RESULTS_PER_PAGE) break;
    }

    // Incremental, never complete: a bounded free-tier read cannot see the whole
    // index, so an absent advert is not evidence that the role closed and must
    // never advance an omission counter.
    return { coverage: "incremental", jobs };
  }
}
