import "server-only";

import { placesWithinRadius, resolveUkPlaces } from "@jobwarden/domain";

import type { JobsRepository } from "./repository";
import type { JobDetail, JobFilters, JobListItem } from "./types";

/** The fictional source ids the fixture sources module also announces. */
export const developmentSourceIds = {
  northstar: "5c000000-0000-4000-8000-000000000001",
  civic: "5c000000-0000-4000-8000-000000000002",
} as const;

export const developmentJobs = [
  {
    id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
    title: "Senior Software Engineer",
    employer: "Fictional Northstar Tools UK Ltd",
    sourceId: developmentSourceIds.northstar,
    location: "Manchester, England",
    employmentType: "permanent",
    workingTime: "full_time",
    workplaceType: "hybrid",
    ir35Status: "not_applicable",
    compensationMinimum: 7_200_000,
    compensationMaximum: 8_400_000,
    compensationCurrency: "GBP",
    compensationPeriod: "year",
    compensationProvenance: "advertised",
    postedAt: "2026-07-15T09:00:00.000Z",
    closesAt: "2026-08-14T23:00:00.000Z",
    descriptionText:
      "A fictional permanent role building internal workflow tools. Two days each week are spent with the Manchester team.",
    applicationUrl: "https://example.test/apply/senior-software-engineer",
    ukEligibilityEvidence: [
      "The fictional advert states that the role is based in Manchester, England.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T08:30:00.000Z",
  },
  {
    id: "d10b4459-e154-41ed-8bce-dac32eb9c5e0",
    title: "Public Policy Researcher",
    employer: "Fictional Civic Evidence Partnership",
    sourceId: developmentSourceIds.civic,
    location: "Cardiff, Wales",
    employmentType: "fixed_term",
    workingTime: "full_time",
    workplaceType: "onsite",
    ir35Status: "not_applicable",
    compensationMinimum: 3_800_000,
    compensationMaximum: 4_200_000,
    compensationCurrency: "GBP",
    compensationPeriod: "year",
    compensationProvenance: "advertised",
    postedAt: "2026-07-14T12:00:00.000Z",
    closesAt: "2026-07-28T23:00:00.000Z",
    descriptionText:
      "A fictional twelve-month fixed-term research post based in central Cardiff.",
    applicationUrl: "https://example.test/apply/public-policy-researcher",
    ukEligibilityEvidence: [
      "The fictional advert explicitly identifies Cardiff, Wales as the work location.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T08:20:00.000Z",
  },
  {
    id: "2dff65c2-c153-43db-befc-f3bb66210458",
    title: "Customer Support Specialist",
    employer: "Fictional Harbour Desk Ltd",
    sourceId: developmentSourceIds.northstar,
    location: "Remote within the United Kingdom",
    employmentType: "permanent",
    workingTime: "part_time",
    workplaceType: "remote",
    ir35Status: "not_applicable",
    compensationMinimum: 1_600_000,
    compensationMaximum: 1_900_000,
    compensationCurrency: "GBP",
    compensationPeriod: "year",
    compensationProvenance: "advertised",
    postedAt: "2026-07-13T10:15:00.000Z",
    closesAt: null,
    descriptionText:
      "A fictional twenty-hour-per-week support role that may be performed remotely from anywhere in the United Kingdom.",
    applicationUrl: "https://example.test/apply/customer-support-specialist",
    ukEligibilityEvidence: [
      "The fictional advert explicitly permits remote work from within the United Kingdom.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T08:10:00.000Z",
  },
  {
    id: "77666bdf-2e96-49d4-8cfa-764271731640",
    title: "Digital Delivery Lead",
    employer: "Fictional Calder Programme Office",
    sourceId: developmentSourceIds.civic,
    location: "Leeds, England (remote within the UK)",
    employmentType: "contract",
    workingTime: "full_time",
    workplaceType: "remote",
    ir35Status: "inside",
    compensationMinimum: 55_000,
    compensationMaximum: 60_000,
    compensationCurrency: "GBP",
    compensationPeriod: "day",
    compensationProvenance: "advertised",
    postedAt: "2026-07-16T08:00:00.000Z",
    closesAt: "2026-07-24T23:00:00.000Z",
    descriptionText:
      "A fictional six-month delivery contract explicitly assessed as inside IR35 and open to remote workers located in the UK.",
    applicationUrl: "https://example.test/apply/digital-delivery-lead",
    ukEligibilityEvidence: [
      "The fictional advert explicitly permits remote delivery from within the United Kingdom.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T08:40:00.000Z",
  },
  {
    id: "a3fa829f-4e9f-47d4-b7fe-4098b3098b61",
    title: "Platform Engineer",
    employer: "Fictional North Coast Systems Ltd",
    sourceId: developmentSourceIds.northstar,
    location: "Edinburgh, Scotland",
    employmentType: "contract",
    workingTime: "full_time",
    workplaceType: "hybrid",
    ir35Status: "outside",
    compensationMinimum: 62_500,
    compensationMaximum: 70_000,
    compensationCurrency: "GBP",
    compensationPeriod: "day",
    compensationProvenance: "advertised",
    postedAt: "2026-07-12T14:30:00.000Z",
    closesAt: "2026-09-01T23:00:00.000Z",
    descriptionText:
      "A fictional outside-IR35 platform contract maintaining SQL reporting pipelines, with one agreed team day each fortnight in Edinburgh.",
    applicationUrl: "https://example.test/apply/platform-engineer-contract",
    ukEligibilityEvidence: [
      "The fictional advert explicitly names Edinburgh, Scotland as the hybrid work location.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T08:00:00.000Z",
  },
  {
    id: "7bdb95d3-7fde-4a08-9d37-4501525e61b6",
    title: "Data Migration Analyst",
    employer: "Fictional Severn Records Project",
    sourceId: developmentSourceIds.civic,
    location: "Bristol, England",
    employmentType: "contract",
    workingTime: "full_time",
    workplaceType: "onsite",
    ir35Status: "unknown",
    compensationMinimum: 40_000,
    compensationMaximum: 47_500,
    compensationCurrency: "GBP",
    compensationPeriod: "day",
    compensationProvenance: "advertised",
    postedAt: null,
    closesAt: null,
    descriptionText:
      "A fictional Bristol-based data migration contract. The fictional advert does not state an IR35 determination.",
    applicationUrl: "https://example.test/apply/data-migration-analyst",
    ukEligibilityEvidence: [
      "The fictional advert explicitly states that work is performed in Bristol, England.",
    ],
    sourceLabel: "Fictional local fixture",
    lastSeenAt: "2026-07-17T07:50:00.000Z",
  },
] as const satisfies readonly JobDetail[];

function toListItem(job: JobDetail): JobListItem {
  return {
    id: job.id,
    sourceId: job.sourceId,
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
    closesAt: job.closesAt,
  };
}

function matchesSalaryFloor(job: JobDetail, filters: JobFilters): boolean {
  if (filters.salaryMin === null || filters.salaryPeriod === "all") return true;
  // A listing that states no salary cannot be shown to meet a floor.
  if (job.compensationMinimum === null) return false;
  return (
    job.compensationPeriod === filters.salaryPeriod &&
    job.compensationMinimum >= filters.salaryMin * 100
  );
}

function matchesPostedWindow(job: JobDetail, filters: JobFilters): boolean {
  if (filters.posted === "any") return true;
  if (job.postedAt === null) return false;
  const cutoff = Date.now() - Number(filters.posted) * 86_400_000;
  return new Date(job.postedAt).getTime() >= cutoff;
}

/**
 * The fixture preview resolves the radius the same way the database does, using
 * the same bundled centroids, so the two agree about which towns are near.
 */
function matchesLocation(job: JobDetail, filters: JobFilters): boolean {
  if (!filters.location) return true;
  if (filters.radius === null) {
    return job.location
      .toLocaleLowerCase("en-GB")
      .includes(filters.location.toLocaleLowerCase("en-GB"));
  }
  const near = placesWithinRadius(filters.location, filters.radius);
  return near.some((place) =>
    resolveUkPlaces(job.location).some(
      (jobPlace) =>
        jobPlace.latitude === place.latitude &&
        jobPlace.longitude === place.longitude,
    ),
  );
}

function matchesFilters(job: JobDetail, filters: JobFilters): boolean {
  const searchText =
    `${job.title} ${job.employer} ${job.descriptionText}`.toLocaleLowerCase(
      "en-GB",
    );
  const query = filters.q.toLocaleLowerCase("en-GB");

  return (
    searchText.includes(query) &&
    matchesLocation(job, filters) &&
    (filters.employment.length === 0 ||
      filters.employment.includes(job.employmentType)) &&
    (filters.workingTime.length === 0 ||
      filters.workingTime.includes(job.workingTime)) &&
    (filters.workplace.length === 0 ||
      filters.workplace.includes(job.workplaceType)) &&
    (filters.ir35.length === 0 || filters.ir35.includes(job.ir35Status)) &&
    (filters.compensation.length === 0 ||
      filters.compensation.includes(job.compensationProvenance)) &&
    (filters.sources.length === 0 ||
      filters.sources.includes(job.sourceId ?? "")) &&
    matchesSalaryFloor(job, filters) &&
    matchesPostedWindow(job, filters)
  );
}

/** Nulls sort last in both orders: an absent date is not a soonest or newest. */
function byNullableDate(
  left: string | null,
  right: string | null,
  ascending: boolean,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return ascending ? left.localeCompare(right) : right.localeCompare(left);
}

function compareJobs(
  left: JobDetail,
  right: JobDetail,
  sort: JobFilters["sort"],
): number {
  const primary =
    sort === "closing"
      ? byNullableDate(left.closesAt, right.closesAt, true)
      : byNullableDate(left.postedAt, right.postedAt, false);
  if (primary !== 0) return primary;

  return right.id.localeCompare(left.id);
}

export function createDevelopmentJobsRepository(): JobsRepository {
  return {
    async list(filters: JobFilters) {
      const filteredJobs = developmentJobs.filter((job) =>
        matchesFilters(job, filters),
      );
      const start = (filters.page - 1) * 25;
      const visibleJobs = filteredJobs
        .toSorted((left, right) => compareJobs(left, right, filters.sort))
        .slice(start, start + 25);

      return {
        items: visibleJobs.map(toListItem),
        total: filteredJobs.length,
        latestListingUpdate:
          visibleJobs
            .map((job) => job.lastSeenAt)
            .toSorted()
            .at(-1) ?? null,
        page: filters.page,
        pageSize: 25,
        dataMode: "fixtures",
      };
    },
    async findById(jobId: string) {
      return developmentJobs.find((job) => job.id === jobId) ?? null;
    },
  };
}
