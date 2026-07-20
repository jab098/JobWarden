import type { NormalisedJob } from "@jobwarden/domain";
import type { JobSource, ProviderAdapter } from "@jobwarden/ingestion";

export const MAX_SOURCES_PER_INVOCATION = 4;
export const MAX_JOBS_PER_SOURCE = 500;

export type IngestionTrigger = "admin" | "scheduled";

export type ClaimedIngestion = {
  requestId: string;
  correlationId: string;
  triggerType: IngestionTrigger;
  sourceRunId: string;
  source: JobSource;
};

export type UpsertSummary = {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
};

/**
 * Why a run discarded the adverts it discarded.
 *
 * Every non-eligible outcome used to be skipped by one `continue`, so a source
 * dropping 95% of its stock was indistinguishable from a source without much UK
 * content — which is how the eligibility classifier defect survived so long.
 */
export type DropBreakdown = {
  excludedNonUkCount: number;
  quarantinedAmbiguousCount: number;
  quarantinedInvalidUrlCount: number;
  /** Distinct location text of ambiguous adverts, so the gazetteer gap is nameable. */
  unrecognisedLocations: string[];
};

export type SourceCompletion = {
  sourceRunId: string;
  status: "succeeded" | "failed";
  responseComplete: boolean;
  receivedCount: number;
  eligibleCount: number;
  upsertedCount: number;
  unchangedCount: number;
  durationMs: number;
  retryCount: number;
  errorCode: string | null;
} & DropBreakdown;

export interface IngestionRepository {
  enqueueScheduled(): Promise<number>;
  claim(limit: number): Promise<ClaimedIngestion[]>;
  upsertJobs(
    sourceRunId: string,
    jobs: readonly NormalisedJob[],
  ): Promise<UpsertSummary>;
  finishSource(completion: SourceCompletion): Promise<void>;
  completeRequest(requestId: string): Promise<void>;
}

export type RuntimeEnvironment = {
  supabaseUrl: string;
  serviceRoleKey: string;
  cronSecret: string;
  reedApiKey?: string;
};

export type RuntimeLog = Readonly<{
  event: string;
  invocationCorrelationId: string;
  sourceCorrelationId?: string;
  status?: string;
  receivedCount?: number;
  eligibleCount?: number;
  upsertedCount?: number;
  unchangedCount?: number;
  durationMs?: number;
  errorCode?: string;
}>;

export type IngestionHandlerDependencies = {
  readEnvironment(): RuntimeEnvironment;
  createRepository(environment: RuntimeEnvironment): IngestionRepository;
  createAdapter(
    source: JobSource,
    environment: RuntimeEnvironment,
  ): ProviderAdapter;
  now(): Date;
  randomUuid(): string;
  log(record: RuntimeLog): void;
};
