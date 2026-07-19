import "server-only";

import { developmentJobs } from "@/lib/jobs/development-jobs";
import { createDevelopmentProfileRepository } from "@/lib/profile/development-profile";

import type { TargetFeedRepository } from "./repository";
import {
  buildTargetFeedResult,
  type TargetFeedCandidate,
} from "./supabase-target-feed";
import type { JobDecision } from "./types";

export class PreviewDecisionUnavailableError extends Error {
  constructor() {
    super("Job decisions are unavailable in this preview.");
    this.name = "PreviewDecisionUnavailableError";
  }
}

function toCandidate(
  job: (typeof developmentJobs)[number],
): TargetFeedCandidate {
  return {
    id: job.id,
    title: job.title,
    employer: job.employer,
    location: job.location,
    employmentType: job.employmentType,
    workingTime: job.workingTime,
    workplaceType: job.workplaceType,
    ir35Status: job.ir35Status,
    compensationMinimum: job.compensationMinimum,
    compensationMaximum: job.compensationMaximum,
    compensationCurrency: job.compensationCurrency,
    compensationPeriod: job.compensationPeriod,
    compensationProvenance: job.compensationProvenance,
    postedAt: job.postedAt,
    descriptionText: job.descriptionText,
  };
}

const developmentCandidates = developmentJobs.map(toCandidate);

export function createDevelopmentTargetFeedRepository(): TargetFeedRepository {
  return {
    async getFeed({ includeDismissed }) {
      const snapshot = await createDevelopmentProfileRepository().getSnapshot();
      const enabledSearches = snapshot.searches.filter(
        (search) => search.enabled,
      );
      const confirmedEvidence = snapshot.evidence.filter(
        (item) => item.confirmationState === "confirmed",
      );

      return buildTargetFeedResult({
        candidates: developmentCandidates,
        enabledSearches,
        confirmedEvidence,
        decisions: new Map<string, JobDecision>(),
        includeDismissed,
        now: new Date(),
        dataMode: "fixtures",
      });
    },
    decide() {
      return Promise.reject(new PreviewDecisionUnavailableError());
    },
  };
}
