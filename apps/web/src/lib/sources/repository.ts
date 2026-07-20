import type { SourcesResult } from "./types";

export type SourcesRepository = {
  /** The enabled sources listings can come from, for the source filter. */
  listEnabled(): Promise<SourcesResult>;
};
