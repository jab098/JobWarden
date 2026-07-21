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

/**
 * A postal address as Ashby serves it.
 *
 * Every field is frequently an **empty string** rather than absent, which is
 * why each is trimmed and emptiness is treated as missing. `addressCountry` is
 * deliberately absent from this schema: it is a provider assertion rather than
 * something the advert states, and making a country assertion into eligibility
 * evidence would change the contract for every provider. Lever's adapter
 * records the same decision.
 */
const postalAddressSchema = z.object({
  addressLocality: z.string().max(300).nullish(),
  addressRegion: z.string().max(300).nullish(),
  postalCode: z.string().max(50).nullish(),
});

/**
 * Ashby's documented public job posting response, validated in full before any
 * part of it is trusted. Fields JobWarden does not use are deliberately absent
 * rather than accepted and ignored, so a shape change is a schema failure
 * instead of a silent behaviour change.
 *
 * `secondaryLocations` is **not** read. The primary `location` is what the
 * advert headlines, and reading secondary locations changes what a listing's
 * location means — that is its own decision, not a detail of this adapter.
 */
const ashbyPostingSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  location: z.string().max(500).nullish(),
  department: z.string().max(300).nullish(),
  team: z.string().max(300).nullish(),
  employmentType: z.string().max(100).nullish(),
  publishedAt: z.string().max(100).nullish(),
  isListed: z.boolean().nullish(),
  jobUrl: z.string().min(1).max(2_000),
  applyUrl: z.string().max(2_000).nullish(),
  descriptionHtml: z.string().max(200_000).nullish(),
  descriptionPlain: z.string().max(200_000).nullish(),
  address: z.object({ postalAddress: postalAddressSchema.nullish() }).nullish(),
  compensation: z
    .object({
      compensationTierSummary: z.string().max(2_000).nullish(),
      scrapeableCompensationSalarySummary: z.string().max(2_000).nullish(),
    })
    .nullish(),
});

const ashbyResponseSchema = z.object({
  jobs: z.array(ashbyPostingSchema).max(2_000),
});

export type AshbyAdapterOptions = BoundedTransportOptions;

/** An empty or whitespace-only provider string means absent, not present. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Ashby's own employment vocabulary — `FullTime`, `PartTime`, `Intern`,
 * `Contract`, `Temporary` — which is not the schema.org token set.
 *
 * `FullTime` and `PartTime` state **working time, not contract type**, so they
 * must never be read as `permanent`: that would assert a contract type the
 * advert never stated. IR35 is never inferred from any of this, and a contract
 * is not evidence of a determination.
 */
export function classifyEmploymentType(
  value: string | null | undefined,
): ProviderJob["employmentType"] {
  const normalised =
    present(value)
      ?.toLowerCase()
      .replace(/[\s_-]/g, "") ?? "";
  if (normalised === "intern") return "internship";
  if (normalised === "apprenticeship") return "apprenticeship";
  if (normalised === "temporary") return "temporary";
  if (normalised === "contract") return "contract";
  return "unknown";
}

export function classifyWorkingTime(
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

/**
 * The location string the classifier reads as evidence.
 *
 * The primary `location` is used as the advert wrote it. The postal address is
 * a **fallback for when that is absent**, never an addition to it: appending a
 * locality to a location that already publishes can only lose publications,
 * because eligibility requires every label to be recognised, so
 * `"London" + "Head Office"` would quarantine where `"London"` alone publishes.
 *
 * `isRemote` and `workplaceType` are never consulted. A remote role needs
 * explicit UK permission, and the live sample's first posting is exactly why:
 * `isRemote: true` with `location: "Remote - European Union"`. Treating those
 * fields as location evidence would publish a role that is explicitly not in
 * the UK.
 */
export function toAshbyLocation(
  posting: z.infer<typeof ashbyPostingSchema>,
): string {
  const primary = present(posting.location);
  if (primary) return primary;

  const address = posting.address?.postalAddress;
  return [
    present(address?.addressLocality),
    present(address?.addressRegion),
    present(address?.postalCode),
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

/**
 * Compensation, from what the advert states and nothing else.
 *
 * Ashby's summaries are **free text**, not numbers, so they go to the shared
 * deterministic parser rather than being read structurally. The employer stated
 * the text, so provenance is `advertised` even where the parser resolves no
 * figure from it — a figure is never invented, and text the parser cannot
 * resolve stays advertised with null bounds rather than being guessed at.
 *
 * `compensationTierSummary` is preferred because it is the summary Ashby
 * renders on the advert itself; the scrapeable variant is the fallback.
 */
export function toAshbyCompensation(
  compensation: z.infer<typeof ashbyPostingSchema>["compensation"],
  observedAt: string,
): ProviderCompensation {
  const summary =
    present(compensation?.compensationTierSummary) ??
    present(compensation?.scrapeableCompensationSalarySummary);

  if (!summary) {
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

  const parsed = parseCompensation(summary);
  return {
    raw: summary,
    minimum: parsed.minimum,
    maximum: parsed.maximum,
    currency: parsed.currency,
    period: parsed.period,
    provenance: "advertised",
    observedAt,
  };
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
 * Reads an employer's Ashby job board through the documented public posting
 * API.
 *
 * No credential: Ashby documents this endpoint as public for published
 * postings, and the more capable endpoints that do need a key are a separate
 * customer API JobWarden does not use. The dated compliance record is in
 * `docs/product/source-coverage.md`.
 */
export class AshbyAdapter implements ProviderAdapter {
  readonly #transport: BoundedJsonTransport;

  constructor(options: AshbyAdapterOptions = {}) {
    this.#transport = new BoundedJsonTransport("Ashby", options);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "ashby") {
      throw new AdapterError(
        "configuration_error",
        "Ashby adapter requires an Ashby source.",
        0,
      );
    }

    const endpoint = new URL(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.boardToken)}`,
    );
    // Without this the compensation object is omitted entirely rather than
    // served empty, so an advert with a stated salary would read as unknown.
    endpoint.searchParams.set("includeCompensation", "true");

    const data = await this.#transport.requestJson(
      endpoint,
      ashbyResponseSchema,
      callerSignal,
    );

    const observedAt = new Date(this.#transport.now()).toISOString();

    return {
      // One request returns the whole board, so the existing
      // two-consecutive-omissions closure rule applies as it does to
      // Greenhouse and Lever. This is not incremental discovery like Reed.
      coverage: "complete",
      jobs: data.jobs
        // `isListed: false` means the posting is not on the employer's board.
        // It is not published. An absent flag is treated as listed, which is
        // how Ashby serves an ordinary live posting.
        .filter((posting) => posting.isListed !== false)
        .map((posting) => ({
          providerJobId: posting.id,
          title: posting.title,
          location: toAshbyLocation(posting),
          descriptionHtml:
            present(posting.descriptionHtml) ??
            present(posting.descriptionPlain) ??
            "",
          absoluteUrl: posting.jobUrl,
          // The employer's own apply destination where Ashby states one, and
          // the advert page otherwise. Never a JobWarden-side submission.
          canonicalApplicationUrl: present(posting.applyUrl) ?? posting.jobUrl,
          updatedAt: null,
          postedAt: isoDate(posting.publishedAt),
          metadataText: [
            present(posting.department)
              ? `Department: ${present(posting.department)}`
              : null,
            present(posting.team) ? `Team: ${present(posting.team)}` : null,
          ].filter((value): value is string => value !== null),
          employmentType: classifyEmploymentType(posting.employmentType),
          workingTime: classifyWorkingTime(posting.employmentType),
          compensation: toAshbyCompensation(posting.compensation, observedAt),
        })),
    };
  }
}
