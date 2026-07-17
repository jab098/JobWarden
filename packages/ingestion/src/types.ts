import type { NormalisedJob } from "@jobwarden/domain";

export type JobSource = {
  id: string;
  provider: "greenhouse";
  boardToken: string;
  employerName: string;
  allowedHosts: readonly string[];
};

export type ProviderJob = {
  providerJobId: string;
  title: string;
  location: string;
  descriptionHtml: string;
  absoluteUrl: string;
  updatedAt: string | null;
  metadataText: string[];
};

export interface ProviderAdapter {
  fetchJobs(source: JobSource, signal?: AbortSignal): Promise<ProviderJob[]>;
}

export type NormalisationResult =
  | { outcome: "eligible"; job: NormalisedJob }
  | {
      outcome: "quarantined";
      reason: "ambiguous_uk_eligibility" | "invalid_application_url";
      providerJobId: string;
    }
  | { outcome: "excluded"; reason: "non_uk"; providerJobId: string };
