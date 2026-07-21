import { z } from "zod";

import { AdapterError, BoundedJsonTransport } from "./transport.ts";
import type { BoundedTransportOptions } from "./transport.ts";
import type {
  JobSource,
  ProviderAdapter,
  ProviderFetchResult,
} from "./types.ts";

const metadataPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

type MetadataPrimitive = z.infer<typeof metadataPrimitiveSchema>;

/**
 * Greenhouse also sends **objects** here, which this schema once refused.
 *
 * A pay-range field arrives as `{"unit": "USD", "min_value": "320000.0",
 * "max_value": "400000.0"}`. Because the response is validated as a whole, one
 * such field rejected the entire board: Datadog's 421 adverts and MongoDB's 392
 * were discarded on every run, recorded only as `provider_invalid_response`.
 *
 * Accepted here so the board parses. Deliberately kept out of `metadataText` —
 * see the note where that is built.
 */
const metadataValueSchema = z.union([
  metadataPrimitiveSchema,
  z.array(metadataPrimitiveSchema),
  z.record(z.string(), metadataPrimitiveSchema),
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

// `AdapterError` and `AdapterErrorCode` moved to `./transport.ts` when the
// shared transport was extracted. They were never Greenhouse-specific — every
// adapter raised them, and four of them imported the type from here, which read
// as though Greenhouse owned the error vocabulary for the whole package.
export type GreenhouseAdapterOptions = BoundedTransportOptions;

function stablePrimitiveText(
  value: z.infer<typeof metadataPrimitiveSchema>,
): string {
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(value);
  return String(value);
}

function isObjectMetadata(
  value: z.infer<typeof metadataValueSchema>,
): value is Record<string, MetadataPrimitive> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Primitives and arrays only. Objects never reach here — they are filtered out
 * where `metadataText` is built, and the type says so rather than leaving a
 * future caller to discover it.
 */
function stableMetadataValue(
  value: MetadataPrimitive | MetadataPrimitive[],
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

export class GreenhouseAdapter implements ProviderAdapter {
  readonly #transport: BoundedJsonTransport;

  constructor(options: GreenhouseAdapterOptions = {}) {
    this.#transport = new BoundedJsonTransport("Greenhouse", options);
  }

  async fetchJobs(
    source: JobSource,
    callerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    if (source.provider !== "greenhouse") {
      throw new AdapterError(
        "configuration_error",
        "Greenhouse adapter requires a Greenhouse source.",
        0,
      );
    }
    const endpoint = new URL(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs`,
    );
    endpoint.searchParams.set("content", "true");

    const data = await this.#transport.requestJson(
      endpoint,
      greenhouseResponseSchema,
      callerSignal,
    );

    return {
      coverage: "complete",
      jobs: data.jobs.map((job) => ({
        providerJobId: String(job.id),
        title: job.title,
        location: job.location.name,
        descriptionHtml: job.content,
        absoluteUrl: job.absolute_url,
        canonicalApplicationUrl: job.absolute_url,
        updatedAt: job.updated_at,
        // Object-valued metadata is accepted by the schema but never rendered
        // into text, because `metadataText` is where compensation evidence is
        // looked for: `compensationEvidence` picks the first clause matching
        // `£` or `GBP`, and whatever it picks becomes advertised compensation.
        //
        // Every object field observed on a live board is a pay range, and every
        // GBP one is a placeholder — all 24 on MongoDB's board read
        // `{"unit": "GBP", "min_value": "0.0", "max_value": "0.0"}` under names
        // like "Baseline Budgeted Salary". Rendering those would advertise a
        // £0 salary, which is worse than advertising nothing. The non-GBP ones
        // cannot be used either: compensation is GBP-only.
        //
        // Nothing is lost for classification — employment type, working time,
        // workplace and IR35 are read from the title and description, and no
        // object field observed carries any of them. Revisit only if a board
        // is found publishing a genuine non-zero GBP range this way, and then
        // parse it as structured compensation rather than as loose text.
        metadataText: (job.metadata ?? [])
          .flatMap((metadata) =>
            isObjectMetadata(metadata.value)
              ? []
              : [`${metadata.name}: ${stableMetadataValue(metadata.value)}`],
          )
          .sort(compareText),
      })),
    };
  }
}
