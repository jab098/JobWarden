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
        metadataText: (job.metadata ?? [])
          .map(
            (metadata) =>
              `${metadata.name}: ${stableMetadataValue(metadata.value)}`,
          )
          .sort(compareText),
      })),
    };
  }
}
