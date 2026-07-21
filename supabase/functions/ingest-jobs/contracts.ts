import type { NormalisedJob } from "@jobwarden/domain";
import type { JobSource, ProviderAdapter } from "@jobwarden/ingestion";

export const MAX_SOURCES_PER_INVOCATION = 4;

/**
 * The most jobs that may be written for one source in one run.
 *
 * This is not a policy number: `upsert_ingested_jobs` refuses a batch above
 * 500, so it is that limit restated where the run can fail cleanly instead of
 * throwing inside the repository.
 *
 * It counts **eligible** jobs, not received ones. Applying it to the provider's
 * whole response discarded exactly the boards worth having — Databricks sends
 * 780 adverts worldwide of which 48 are UK, Stripe 522 of which 39 are — and
 * both saved nothing while sitting far inside the real limit.
 */
export const MAX_ELIGIBLE_PER_SOURCE = 500;

/**
 * The most adverts one source may return before the run gives up.
 *
 * A separate concern from the write limit: every received advert is normalised,
 * and an unbounded response would spend the whole invocation budget doing it.
 * Set well above any real board — the largest observed is Databricks at 780 —
 * so it bounds a runaway provider rather than a big employer.
 */
export const MAX_RECEIVED_PER_SOURCE = 5_000;

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
  adzunaAppId?: string;
  adzunaAppKey?: string;
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
