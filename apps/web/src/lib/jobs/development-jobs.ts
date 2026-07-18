import "server-only";

import type { JobsRepository } from "./repository";
import type { JobDetail, JobFilters, JobListItem } from "./types";

const developmentJobs = [
  {
    id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
    title: "Senior Software Engineer",
    employer: "Fictional Northstar Tools UK Ltd",
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
    descriptionText:
      "A fictional outside-IR35 platform contract with one agreed team day each fortnight in Edinburgh.",
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

function matchesFilters(job: JobDetail, filters: JobFilters): boolean {
  const searchText = `${job.title} ${job.employer}`.toLocaleLowerCase("en-GB");
  const query = filters.q.toLocaleLowerCase("en-GB");

  return (
    searchText.includes(query) &&
    (filters.employment === "all" ||
      job.employmentType === filters.employment) &&
    (filters.workingTime === "all" ||
      job.workingTime === filters.workingTime) &&
    (filters.workplace === "all" || job.workplaceType === filters.workplace) &&
    (filters.ir35 === "all" || job.ir35Status === filters.ir35) &&
    (filters.compensation === "all" ||
      job.compensationProvenance === filters.compensation)
  );
}

function compareJobs(left: JobDetail, right: JobDetail): number {
  if (left.postedAt === null && right.postedAt !== null) return 1;
  if (left.postedAt !== null && right.postedAt === null) return -1;

  const postedAtOrder = (right.postedAt ?? "").localeCompare(
    left.postedAt ?? "",
  );
  if (postedAtOrder !== 0) return postedAtOrder;

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
        .toSorted(compareJobs)
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
