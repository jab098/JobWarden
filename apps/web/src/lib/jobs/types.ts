export const employmentTypes = [
  "permanent",
  "fixed_term",
  "contract",
  "temporary",
  "apprenticeship",
  "internship",
  "casual",
  "zero_hours",
  "unknown",
] as const;

export const workingTimes = [
  "full_time",
  "part_time",
  "flexible",
  "unknown",
] as const;

export const workplaceTypes = [
  "onsite",
  "hybrid",
  "remote",
  "unknown",
] as const;

export const ir35Statuses = [
  "inside",
  "outside",
  "not_applicable",
  "unknown",
] as const;

export const compensationPeriods = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "unknown",
] as const;

export type EmploymentType = (typeof employmentTypes)[number];
export type WorkingTime = (typeof workingTimes)[number];
export type WorkplaceType = (typeof workplaceTypes)[number];
export type Ir35Status = (typeof ir35Statuses)[number];
export type CompensationPeriod = (typeof compensationPeriods)[number];

export type JobListItem = {
  id: string;
  title: string;
  employer: string;
  location: string;
  employmentType: EmploymentType;
  workingTime: WorkingTime;
  workplaceType: WorkplaceType;
  ir35Status: Ir35Status;
  compensationMinimum: number | null;
  compensationMaximum: number | null;
  compensationCurrency: "GBP" | null;
  compensationPeriod: CompensationPeriod;
  postedAt: string | null;
};

export type JobFilters = {
  q: string;
  employment: EmploymentType | "all";
  workingTime: WorkingTime | "all";
  workplace: WorkplaceType | "all";
  ir35: Ir35Status | "all";
  page: number;
};

export type JobDetail = JobListItem & {
  descriptionText: string;
  applicationUrl: string;
  ukEligibilityEvidence: readonly string[];
  sourceLabel: string;
  lastSeenAt: string;
};

export type JobsPageResult = {
  items: readonly JobListItem[];
  total: number;
  latestListingUpdate: string | null;
  page: number;
  pageSize: 25;
  dataMode: "supabase" | "fixtures";
};
