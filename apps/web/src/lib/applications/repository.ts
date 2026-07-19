import "server-only";

import type { ApplicationStage } from "@jobwarden/domain";

import type { ApplicationPlan, ApplicationsResult } from "./types";

export interface ApplicationsRepository {
  getApplications(): Promise<ApplicationsResult>;
  track(jobId: string): Promise<void>;
  transition(applicationId: string, stage: ApplicationStage): Promise<void>;
  updatePlan(applicationId: string, plan: ApplicationPlan): Promise<void>;
  remove(applicationId: string): Promise<void>;
}
