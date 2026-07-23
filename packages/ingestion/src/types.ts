import type {
  CompensationPeriod,
  EmploymentType,
  NormalisedJob,
} from "@jobwarden/domain";

type JobSourceBase = {
  id: string;
  boardToken: string;
  employerName: string;
  allowedHosts: readonly string[];
};

export type JobSource = JobSourceBase &
  (
    | { provider: "greenhouse" }
    | { provider: "lever" }
    | { provider: "ashby" }
    | { provider: "workable" }
    | { provider: "reed"; boardToken: "gb-discovery" }
    | { provider: "teaching_vacancies"; boardToken: "gb-discovery" }
    | { provider: "adzuna"; boardToken: "gb-discovery" }
  );

export type CompensationProvenance = "advertised" | "estimated" | "unknown";

export type ProviderCompensation = {
  raw: string | null;
  /**
   * **Major units — pounds, not pence.**
   *
   * `normaliseProviderJob` multiplies this by 100 to reach the minor units the
   * database stores, so an adapter that puts minor units here publishes a
   * salary 100× too high under `advertised` provenance. Two adapters did
   * exactly that before an independent review caught it. An adapter reading a
   * figure out of free text must go through
   * `advertisedCompensationFromText`, which owns the conversion.
   */
  minimum: number | null;
  /** Major units — pounds, not pence. See `minimum`. */
  maximum: number | null;
  currency: "GBP" | null;
  period: CompensationPeriod;
  provenance: CompensationProvenance;
  observedAt: string | null;
};

export type ProviderJob = {
  providerJobId: string;
  title: string;
  location: string;
  descriptionHtml: string;
  absoluteUrl: string;
  canonicalApplicationUrl?: string | null;
  employerName?: string | null;
  updatedAt: string | null;
  postedAt?: string | null;
  closesAt?: string | null;
  metadataText: string[];
  employmentType?: EmploymentType;
  workingTime?: NormalisedJob["workingTime"];
  compensation?: ProviderCompensation;
  /**
   * Whether the provider structurally asserts UK jurisdiction for this advert —
   * a country-scoped endpoint (Adzuna GB, whose `area[0]` is always "UK"), not a
   * free-text location guess. `classifyUkEligibility` takes it as decisive UK
   * evidence only after a foreign location or a UK-excluding description has had
   * its say, so it never overrides the advert's own words. Absent for adapters
   * that read a per-employer feed with no country guarantee.
   */
  assertsUkJurisdiction?: boolean;
};

export type ProviderFetchResult = {
  coverage: "complete" | "incremental";
  jobs: ProviderJob[];
};

export interface ProviderAdapter {
  fetchJobs(
    source: JobSource,
    signal?: AbortSignal,
  ): Promise<ProviderFetchResult>;
}

export type NormalisationResult =
  | { outcome: "eligible"; job: NormalisedJob }
  | {
      outcome: "quarantined";
      reason: "invalid_application_url";
      providerJobId: string;
    }
  | {
      outcome: "quarantined";
      reason: "ambiguous_uk_eligibility";
      providerJobId: string;
      /**
       * The advert's location text, carried so ingestion can record which place
       * names recognition is missing. Only this reason has it: an advert
       * rejected for its application URL is never classified for location.
       */
      locationText: string;
    }
  | { outcome: "excluded"; reason: "non_uk"; providerJobId: string };
