import { parseCompensation } from "@jobwarden/domain";
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

const ENDPOINT = "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json";
// The service is slower than an ATS board, so it gets a longer ceiling than the
// shared transport's 8s default.
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Pages read per run.
 *
 * The service returns 100 adverts per page across roughly 30 pages. Reading
 * every page each run would be neither necessary nor polite to a free public
 * service, and reading only one would take over a week to cycle. Five pages is
 * five requests per run, which at the weekday schedule cycles the whole service
 * in under two days while staying trivially small.
 *
 * This is why coverage is incremental: a partial read is not a snapshot.
 */
const DEFAULT_MAX_PAGES = 5;

/**
 * The advert's own address, as the service states it.
 *
 * `addressCountry` is deliberately excluded. Lever's adapter records why:
 * synthesising a location from a provider's country assertion would make that
 * assertion the eligibility evidence, which changes the contract for every
 * provider and is its own task. Locality, region and postcode are places the
 * advert actually names, so joining them is faithful rather than inferred.
 *
 * The postcode is load-bearing here: Task 37 made a full UK postcode count as
 * location evidence, which is what lets an advert whose locality the gazetteer
 * does not carry still publish.
 */
const postalAddressSchema = z.object({
  addressLocality: z.string().nullish(),
  addressRegion: z.string().nullish(),
  postalCode: z.string().nullish(),
});

const jobPostingSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(100_000).nullish(),
  datePosted: z.string().max(100).nullish(),
  validThrough: z.string().max(100).nullish(),
  url: z.string().min(1).max(2_000),
  employmentType: z.array(z.string().max(100)).max(20).nullish(),
  occupationalCategory: z.string().max(200).nullish(),
  industry: z.string().max(200).nullish(),
  jobLocation: z.object({ address: postalAddressSchema.nullish() }).nullish(),
  baseSalary: z
    .object({
      currency: z.string().max(10).nullish(),
      value: z
        .object({
          // Free text, not a number, and its sibling `unitText` is unreliable —
          // an hourly rate is served with unitText "YEAR". Neither is trusted:
          // the text goes to the shared deterministic parser, which infers the
          // period from the words the employer actually wrote.
          value: z.union([z.string().max(2_000), z.number()]).nullish(),
        })
        .nullish(),
    })
    .nullish(),
  hiringOrganization: z
    .object({ name: z.string().max(300).nullish() })
    .nullish(),
});

const responseSchema = z.object({
  data: z.array(jobPostingSchema).max(500),
  links: z.object({ next: z.string().max(2_000).nullish() }).nullish(),
});

export type TeachingVacanciesAdapterOptions = BoundedTransportOptions & {
  maxPages?: number;
};

/** An ISO date, or null. Never a guess. */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

/**
 * The advert identifier.
 *
 * The service exposes no id field, so the final path segment of its own advert
 * URL is used. It carries a UUID and is stable for the life of the advert.
 */
function providerJobId(url: string): string | null {
  const segments = url.split("?")[0]?.split("/").filter(Boolean) ?? [];
  const last = segments[segments.length - 1];
  return last && last.length <= 300 ? last : null;
}

/**
 * Employment type, from what the advert states and nothing else.
 *
 * The service uses schema.org tokens. TEMPORARY is the only one that maps to a
 * JobWarden contract type; FULL_TIME and PART_TIME describe working time, not
 * contract, and must not be read as "permanent" — that would assert a contract
 * type the advert never stated.
 *
 * IR35 is never inferred from any of this.
 */
function employmentType(
  tokens: readonly string[] | null | undefined,
): ProviderJob["employmentType"] {
  const normalised = (tokens ?? []).map((token) => token.trim().toUpperCase());
  if (normalised.includes("TEMPORARY")) return "temporary";
  if (normalised.includes("INTERN")) return "internship";
  return "unknown";
}

function workingTime(
  tokens: readonly string[] | null | undefined,
): ProviderJob["workingTime"] {
  const normalised = (tokens ?? []).map((token) => token.trim().toUpperCase());
  const full = normalised.includes("FULL_TIME");
  const part = normalised.includes("PART_TIME");
  // An advert offering both states neither exclusively, so it stays unknown
  // rather than being resolved by picking one.
  if (full && !part) return "full_time";
  if (part && !full) return "part_time";
  return "unknown";
}

function compensation(
  baseSalary: z.infer<typeof jobPostingSchema>["baseSalary"],
  observedAt: string,
): ProviderCompensation {
  const rawValue = baseSalary?.value?.value;
  const raw = typeof rawValue === "number" ? String(rawValue) : rawValue;
  const trimmed = raw?.trim();

  if (!trimmed) {
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

  const parsed = parseCompensation(trimmed);
  return {
    // The employer stated this, so it is advertised even where the shared
    // parser cannot resolve a figure from it. Nothing here is ever estimated.
    raw: trimmed,
    minimum: parsed.minimum,
    maximum: parsed.maximum,
    currency: parsed.currency,
    period: parsed.period,
    provenance: "advertised",
    observedAt,
  };
}

function toProviderJob(
  posting: z.infer<typeof jobPostingSchema>,
  observedAt: string,
): ProviderJob | null {
  const id = providerJobId(posting.url);
  if (!id) return null;

  const address = posting.jobLocation?.address;
  const location = [
    address?.addressLocality,
    address?.addressRegion,
    address?.postalCode,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return {
    providerJobId: id,
    title: posting.title,
    location,
    descriptionHtml: posting.description ?? "",
    absoluteUrl: posting.url,
    // The service's own advert page is the canonical application destination.
    canonicalApplicationUrl: posting.url,
    employerName: posting.hiringOrganization?.name ?? null,
    updatedAt: null,
    postedAt: isoDate(posting.datePosted),
    closesAt: isoDate(posting.validThrough),
    metadataText: [
      posting.occupationalCategory
        ? `Category: ${posting.occupationalCategory}`
        : null,
      posting.industry ? `Industry: ${posting.industry}` : null,
    ].filter((value): value is string => value !== null),
    employmentType: employmentType(posting.employmentType),
    workingTime: workingTime(posting.employmentType),
    compensation: compensation(posting.baseSalary, observedAt),
  };
}

/**
 * Reads the Department for Education's Teaching Vacancies service.
 *
 * Open Government Licence v3.0, no credential, and `/api` is permitted by the
 * service's robots.txt. The compliance record in
 * `docs/product/source-coverage.md` carries the dated review.
 *
 * That record notes one licence restriction: no fee or commission may be
 * charged around a reused listing. JobWarden cannot breach it, because it
 * charges users nothing and never handles money — but that is now a licence
 * obligation as well as a product rule, so the guardrail enforcing it is
 * protecting this source's terms too.
 */
export class TeachingVacanciesAdapter implements ProviderAdapter {
  readonly #transport: BoundedJsonTransport;
  readonly #maxPages: number;

  constructor(options: TeachingVacanciesAdapterOptions = {}) {
    this.#transport = new BoundedJsonTransport(
      "Teaching Vacancies",
      options,
      DEFAULT_TIMEOUT_MS,
    );
    this.#maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "teaching_vacancies") {
      throw new AdapterError(
        "configuration_error",
        "Teaching Vacancies adapter requires a Teaching Vacancies source.",
        0,
      );
    }

    const observedAt = new Date(this.#transport.now()).toISOString();
    const jobs: ProviderJob[] = [];
    let nextUrl: string | null = ENDPOINT;

    // The retry budget is per page, which is what the previous #readPage did.
    for (let page = 0; page < this.#maxPages && nextUrl; page += 1) {
      const body: z.infer<typeof responseSchema> =
        await this.#transport.requestJson(
          nextUrl,
          responseSchema,
          callerSignal,
        );

      for (const posting of body.data) {
        const job = toProviderJob(posting, observedAt);
        if (job) jobs.push(job);
      }

      const next = body.links?.next ?? null;
      // A pagination link is a URL the provider supplies, so it is not trusted
      // to stay on the provider's own endpoint. Anything else ends the run
      // rather than being followed.
      nextUrl = next && next.startsWith(`${ENDPOINT}?`) ? next : null;
    }

    return {
      // Incremental, and deliberately so. A bounded read of a paginated service
      // is not a snapshot, so an advert absent from what was read is never
      // evidence that it closed and must never advance an omission counter.
      // An advertised closing date still expires a listing through the existing
      // bounded process.
      coverage: "incremental",
      jobs,
    };
  }
}
