import "server-only";

import {
  resolveDevelopmentAccessMode,
  type DevelopmentAccessInput,
} from "@/lib/development/access-mode";

import { createDevelopmentJobsRepository } from "./development-jobs";
import type { JobDetail, JobFilters, JobsPageResult } from "./types";

export interface JobsRepository {
  list(filters: JobFilters): Promise<JobsPageResult>;
  findById(jobId: string): Promise<JobDetail | null>;
}

export function createJobsRepository(
  developmentAccessInput: DevelopmentAccessInput,
  createSupabaseRepository: () => JobsRepository,
): JobsRepository {
  const developmentAccess = resolveDevelopmentAccessMode(
    developmentAccessInput,
  );

  if (developmentAccess.enabled) return createDevelopmentJobsRepository();

  return createSupabaseRepository();
}
