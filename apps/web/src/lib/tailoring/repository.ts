import "server-only";

import type { TailoringOperation } from "@jobwarden/domain";

import type { RenderedVariant, TailoringWorkspace } from "./types";

export class TailoringUnavailableError extends Error {
  constructor(
    readonly reason:
      | "job_not_found"
      | "source_unavailable"
      | "variant_not_found"
      | "unavailable",
  ) {
    super(`Tailoring unavailable: ${reason}`);
    this.name = "TailoringUnavailableError";
  }
}

export interface TailoringRepository {
  getWorkspace(jobId: string): Promise<TailoringWorkspace>;
  saveVariant(input: {
    jobId: string;
    name: string;
    operations: readonly TailoringOperation[];
  }): Promise<string>;
  promoteVariant(variantId: string): Promise<void>;
  deleteVariant(variantId: string): Promise<void>;
  /** Regenerates from the stored original; never returns a cached binary. */
  renderVariant(variantId: string): Promise<RenderedVariant>;
}
