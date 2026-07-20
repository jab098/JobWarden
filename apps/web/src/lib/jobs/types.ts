import type { RadiusMiles } from "@jobwarden/domain";

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
export const compensationProvenances = [
  "advertised",
  "estimated",
  "unknown",
] as const;

/**
 * How far back a search will look. Values are days, and `any` is the default
 * because a listing with no stated posting date cannot satisfy a window — a
 * date filter necessarily hides them.
 */
export const postedWindows = ["any", "1", "3", "7", "14", "30"] as const;

/**
 * Sorting a day rate against an annual salary by raw amount would rank a
 * £70,000 salary above a £600 day rate, so salary sort is deliberately absent.
 * Both offered orders are unambiguous regardless of how pay is expressed.
 *
 * ponytail: no salary sort until the product decides an annual-equivalent
 * conversion; that decision invents working-day assumptions the source data
 * does not state, which the compensation invariant forbids.
 */
export const jobSortOrders = ["newest", "closing"] as const;

/**
 * The periods a pay floor can be stated in. `unknown` is deliberately absent:
 * a floor against an unstated period cannot be compared to anything.
 */
export const salaryPeriods = ["year", "month", "week", "day", "hour"] as const;

export type SalaryPeriod = (typeof salaryPeriods)[number];
export type PostedWindow = (typeof postedWindows)[number];
export type JobSortOrder = (typeof jobSortOrders)[number];
export type EmploymentType = (typeof employmentTypes)[number];
export type WorkingTime = (typeof workingTimes)[number];
export type WorkplaceType = (typeof workplaceTypes)[number];
export type Ir35Status = (typeof ir35Statuses)[number];
export type CompensationPeriod = (typeof compensationPeriods)[number];
export type CompensationProvenance = (typeof compensationProvenances)[number];

export type JobListItem = {
  id: string;
  /**
   * The configured source this listing was ingested from. Optional because
   * embedded job snapshots (an application's listing) do not carry it; the
   * search repositories always set it so the source filter can apply.
   */
  sourceId?: string;
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
  compensationProvenance: CompensationProvenance;
  postedAt: string | null;
  closesAt: string | null;
};

export type JobFilters = {
  q: string;
  /** Free text matched against the listing's stated UK locations. */
  location: string;
  /**
   * Miles around `location`. Null means match the stated location text alone,
   * which is what every search did before radius existed. A radius without a
   * location has nothing to be a radius around, so the two apply together or
   * not at all.
   */
  radius: RadiusMiles | null;
  /**
   * Multi-choice allow-lists. An empty list means the choice is not applied,
   * which is what "all" used to say; several values are ORed together.
   */
  employment: readonly EmploymentType[];
  workingTime: readonly WorkingTime[];
  workplace: readonly WorkplaceType[];
  ir35: readonly Ir35Status[];
  compensation: readonly CompensationProvenance[];
  /** Source ids the listings must come from. Empty applies no source test. */
  sources: readonly string[];
  /**
   * Whole pounds, paired with the period below. A floor without a period would
   * compare a day rate to an annual salary, so neither applies without both.
   */
  salaryMin: number | null;
  salaryPeriod: SalaryPeriod | "all";
  posted: PostedWindow;
  sort: JobSortOrder;
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
