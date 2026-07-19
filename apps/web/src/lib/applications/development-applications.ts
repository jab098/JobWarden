import "server-only";

import { developmentJobs } from "@/lib/jobs/development-jobs";

import type { ApplicationsRepository } from "./repository";
import {
  buildApplicationsResult,
  type ApplicationRecordInput,
} from "./supabase-applications";

export class PreviewApplicationsUnavailableError extends Error {
  constructor() {
    super("Application changes are unavailable in this preview.");
    this.name = "PreviewApplicationsUnavailableError";
  }
}

function toJob(job: (typeof developmentJobs)[number]) {
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
  };
}

/** Frozen fictional applications covering active, quiet, and closed states. */
const fictionalRecords: readonly ApplicationRecordInput[] = [
  {
    id: "91000000-0000-4000-8000-000000000001",
    job: toJob(developmentJobs[0]!),
    stage: "interviewing",
    nextAction: "Prepare fictional systems-design examples",
    nextActionDueOn: "2026-07-21",
    notes: "Fictional notes: recruiter call went well; panel is next.",
    updatedAt: "2026-07-17T10:00:00.000Z",
    events: [
      { toStage: "applied", occurredAt: "2026-07-10T09:00:00.000Z" },
      { toStage: "screening", occurredAt: "2026-07-14T09:00:00.000Z" },
      { toStage: "interviewing", occurredAt: "2026-07-17T10:00:00.000Z" },
    ],
  },
  {
    id: "91000000-0000-4000-8000-000000000002",
    job: toJob(developmentJobs[1]!),
    stage: "applied",
    nextAction: "Send fictional follow-up on the employer site",
    nextActionDueOn: "2026-07-12",
    notes: null,
    updatedAt: "2026-06-28T09:00:00.000Z",
    events: [{ toStage: "applied", occurredAt: "2026-06-28T09:00:00.000Z" }],
  },
  {
    id: "91000000-0000-4000-8000-000000000003",
    job: toJob(developmentJobs[2]!),
    stage: "rejected",
    nextAction: null,
    nextActionDueOn: null,
    notes: "Fictional notes: role was filled internally.",
    updatedAt: "2026-07-08T09:00:00.000Z",
    events: [
      { toStage: "applied", occurredAt: "2026-07-01T09:00:00.000Z" },
      { toStage: "screening", occurredAt: "2026-07-05T09:00:00.000Z" },
      { toStage: "rejected", occurredAt: "2026-07-08T09:00:00.000Z" },
    ],
  },
];

export function createDevelopmentApplicationsRepository(): ApplicationsRepository {
  return {
    async getApplications() {
      return buildApplicationsResult({
        records: fictionalRecords,
        now: new Date(),
        dataMode: "fixtures",
      });
    },
    track() {
      return Promise.reject(new PreviewApplicationsUnavailableError());
    },
    transition() {
      return Promise.reject(new PreviewApplicationsUnavailableError());
    },
    updatePlan() {
      return Promise.reject(new PreviewApplicationsUnavailableError());
    },
    remove() {
      return Promise.reject(new PreviewApplicationsUnavailableError());
    },
  };
}
