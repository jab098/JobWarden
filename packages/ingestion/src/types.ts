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
  );

export type CompensationProvenance = "advertised" | "estimated" | "unknown";

export type ProviderCompensation = {
  raw: string | null;
  minimum: number | null;
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
