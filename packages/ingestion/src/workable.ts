import { z } from "zod";

import { AdapterError, BoundedJsonTransport } from "./transport.ts";
import type { BoundedTransportOptions } from "./transport.ts";
import type {
  JobSource,
  ProviderAdapter,
  ProviderFetchResult,
  ProviderJob,
} from "./types.ts";

/**
 * One location as Workable states it.
 *
 * `country` and `countryCode` are deliberately excluded from what becomes
 * evidence. They are provider assertions rather than something the advert
 * states, and making a country assertion into eligibility evidence would change
 * the contract for every provider — the same decision recorded in the Lever and
 * Ashby adapters. `city` and `region` are places the advert itself names.
 *
 * `hidden` marks a location the employer has taken off the board. It is not
 * published.
 */
const locationSchema = z.object({
  city: z.string().max(300).nullish(),
  region: z.string().max(300).nullish(),
  hidden: z.boolean().nullish(),
});

/**
 * Workable's documented public account response, validated in full before any
 * part of it is trusted. Fields JobWarden does not use are deliberately absent
 * rather than accepted and ignored, so a shape change is a schema failure
 * instead of a silent behaviour change.
 *
 * There is **no compensation field of any kind** — not on the job, not on the
 * account. That is a property of this provider, not an omission here, and it is
 * why every listing from this source carries `unknown` provenance.
 */
const workableJobSchema = z.object({
  title: z.string().min(1).max(500),
  shortcode: z.string().min(1).max(200),
  employment_type: z.string().max(100).nullish(),
  telecommuting: z.boolean().nullish(),
  department: z.string().max(300).nullish(),
  url: z.string().min(1).max(2_000),
  application_url: z.string().max(2_000).nullish(),
  published_on: z.string().max(100).nullish(),
  city: z.string().max(300).nullish(),
  state: z.string().max(300).nullish(),
  function: z.string().max(300).nullish(),
  industry: z.string().max(300).nullish(),
  locations: z.array(locationSchema).max(200).nullish(),
  description: z.string().max(200_000).nullish(),
});

const workableAccountSchema = z.object({
  name: z.string().max(300).nullish(),
  jobs: z.array(workableJobSchema).max(2_000),
});

export type WorkableAdapterOptions = BoundedTransportOptions;

/** An empty or whitespace-only provider string means absent, not present. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Workable's employment vocabulary — `Full-time`, `Part-time`, `Contract`,
 * `Temporary`, `Internship`.
 *
 * `Full-time` and `Part-time` state **working time, not contract type**, so
 * they must never be read as `permanent`: that would assert a contract type the
 * advert never stated. IR35 is never inferred from any of this, and a contract
 * is not evidence of a determination.
 */
export function classifyWorkableEmploymentType(
  value: string | null | undefined,
): ProviderJob["employmentType"] {
  const normalised =
    present(value)
      ?.toLowerCase()
      .replace(/[\s_-]/g, "") ?? "";
  if (normalised === "internship") return "internship";
  if (normalised === "temporary") return "temporary";
  if (normalised === "contract") return "contract";
  return "unknown";
}

export function classifyWorkableWorkingTime(
  value: string | null | undefined,
): ProviderJob["workingTime"] {
  const normalised =
    present(value)
      ?.toLowerCase()
      .replace(/[\s_-]/g, "") ?? "";
  if (normalised === "fulltime") return "full_time";
  if (normalised === "parttime") return "part_time";
  return "unknown";
}

/** One location rendered as the advert names it: "Leicester, England". */
function locationLabel(city?: string | null, region?: string | null): string {
  return [present(city), present(region)]
    .filter((part): part is string => part !== null)
    .join(", ");
}

/**
 * The location evidence for one advert, gathered across every row that carries
 * its shortcode.
 *
 * Joined with `/` because that is what Task 37 taught the eligibility
 * classifier to split on. The classifier then requires **every** part to be a
 * recognised UK label, so an advert spanning Leicester and Coventry publishes
 * while one spanning London and Paris quarantines. That is the intended
 * behaviour and it is why joining is safe here where appending a stray
 * qualifier would not be.
 *
 * Hidden locations are dropped — including when every location on a row is
 * hidden, which must contribute nothing rather than fall back to the row's
 * top-level city. Duplicates are collapsed, and the result is sorted so the
 * evidence does not depend on provider row order.
 */
export function toWorkableLocation(
  rows: readonly z.infer<typeof workableJobSchema>[],
): string {
  const labels = new Set<string>();

  for (const row of rows) {
    const stated = row.locations ?? [];
    const visible = stated.filter((location) => location.hidden !== true);

    // Every stated location is hidden, so the employer has taken this row off
    // the board. Contribute nothing. The earlier version fell through to the
    // top-level `city`/`state` here, which restates the same place and
    // published exactly what `hidden` asks it not to.
    if (stated.length > 0 && visible.length === 0) continue;

    let usable = false;
    for (const location of visible) {
      const label = locationLabel(location.city, location.region);
      if (label) {
        labels.add(label);
        usable = true;
      }
    }
    if (usable) continue;

    // No usable nested label — either the row states no locations at all, or
    // the ones it states are empty. The top-level `city`/`state` is then what
    // the row actually says. Guarding this on "produced a usable label" rather
    // than "had any entry" is what stops an empty nested location silently
    // discarding the row.
    const label = locationLabel(row.city, row.state);
    if (label) labels.add(label);
  }

  // Sorted, so the joined evidence does not depend on the order the provider
  // happened to return its rows in. Without this the same advert yields a
  // different `rawLocation` and a different `contentHash` between runs, and
  // every refresh reports it as changed.
  return [...labels].sort().join(" / ");
}

/** An ISO date, or null. Never a guess. */
function isoDate(value: string | null | undefined): string | null {
  const raw = present(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

/**
 * Groups the response's rows into one entry per advert, preserving order.
 *
 * **This is the defining shape of this source.** Workable serves a
 * multi-location advert as one row per location, every row carrying the same
 * `shortcode` and the same `application_url`. A live board returned six rows
 * for two adverts. Emitting those as six jobs would give five of them an
 * identical canonical deduplication key and let them overwrite one another
 * non-deterministically, so the advert is reassembled here instead.
 */
function groupByShortcode(
  jobs: readonly z.infer<typeof workableJobSchema>[],
): z.infer<typeof workableJobSchema>[][] {
  const grouped = new Map<string, z.infer<typeof workableJobSchema>[]>();

  for (const job of jobs) {
    const existing = grouped.get(job.shortcode);
    if (existing) existing.push(job);
    else grouped.set(job.shortcode, [job]);
  }

  return [...grouped.values()];
}

/**
 * Reads an employer's Workable board through the documented public account API.
 *
 * No credential: Workable's own careers-page documentation describes this
 * endpoint as usable without an API key, and two live boards answered an
 * unauthenticated request. The separate `spi/v3/jobs` endpoint **does** require
 * a Bearer token and is deliberately not used. The dated compliance record is
 * in `docs/product/source-coverage.md`.
 */
export class WorkableAdapter implements ProviderAdapter {
  readonly #transport: BoundedJsonTransport;

  constructor(options: WorkableAdapterOptions = {}) {
    this.#transport = new BoundedJsonTransport("Workable", options);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "workable") {
      throw new AdapterError(
        "configuration_error",
        "Workable adapter requires a Workable source.",
        0,
      );
    }

    const endpoint = new URL(
      `https://www.workable.com/api/accounts/${encodeURIComponent(source.boardToken)}`,
    );
    // Without this the response carries no job descriptions, which are where
    // the UK eligibility statements live.
    endpoint.searchParams.set("details", "true");

    const account = await this.#transport.requestJson(
      endpoint,
      workableAccountSchema,
      callerSignal,
    );

    return {
      // One request returns the whole board, so the existing
      // two-consecutive-omissions closure rule applies as it does to
      // Greenhouse, Lever and Ashby. This is not incremental discovery.
      coverage: "complete",
      jobs: groupByShortcode(account.jobs).map((rows) => {
        // Every row for one shortcode carries the same advert; they differ only
        // in location, which `toWorkableLocation` gathers across all of them.
        const first = rows[0]!;

        return {
          providerJobId: first.shortcode,
          title: first.title,
          location: toWorkableLocation(rows),
          descriptionHtml: present(first.description) ?? "",
          absoluteUrl: first.url,
          // The employer's own apply destination where Workable states one, and
          // the advert page otherwise. Never a JobWarden-side submission.
          canonicalApplicationUrl: present(first.application_url) ?? first.url,
          updatedAt: null,
          postedAt: isoDate(first.published_on),
          metadataText: [
            present(first.department)
              ? `Department: ${present(first.department)}`
              : null,
            present(first.function)
              ? `Function: ${present(first.function)}`
              : null,
            present(first.industry)
              ? `Industry: ${present(first.industry)}`
              : null,
          ].filter((value): value is string => value !== null),
          employmentType: classifyWorkableEmploymentType(first.employment_type),
          workingTime: classifyWorkableWorkingTime(first.employment_type),
          // Workable publishes no compensation field at all, so there is never
          // a figure to carry and never one to estimate.
          compensation: {
            raw: null,
            minimum: null,
            maximum: null,
            currency: null,
            period: "unknown",
            provenance: "unknown",
            observedAt: null,
          },
        };
      }),
    };
  }
}
