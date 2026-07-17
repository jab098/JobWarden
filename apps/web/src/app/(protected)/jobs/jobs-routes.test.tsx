import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { JobsRepository } from "@/lib/jobs/repository";
import type { JobDetail, JobsPageResult } from "@/lib/jobs/types";

const { getJobsRepository, notFound } = vi.hoisted(() => ({
  getJobsRepository: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/jobs/get-repository", () => ({ getJobsRepository }));
vi.mock("next/navigation", () => ({ notFound }));

import JobDetailPage from "./[jobId]/page";
import JobsPage from "./page";

const result: JobsPageResult = {
  items: [],
  total: 0,
  latestListingUpdate: null,
  page: 1,
  pageSize: 25,
  dataMode: "fixtures",
};

const job: JobDetail = {
  id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
  title: "Senior Software Engineer",
  employer: "Fictional Northstar Tools UK Ltd",
  location: "Manchester, England",
  employmentType: "contract",
  workingTime: "full_time",
  workplaceType: "hybrid",
  ir35Status: "unknown",
  compensationMinimum: null,
  compensationMaximum: null,
  compensationCurrency: null,
  compensationPeriod: "unknown",
  postedAt: null,
  descriptionText: "A fictional UK role.",
  applicationUrl: "https://example.test/apply/senior-software-engineer",
  ukEligibilityEvidence: ["The role is based in Manchester, England."],
  sourceLabel: "Fictional local fixture",
  lastSeenAt: "2026-07-17T08:30:00.000Z",
};

function repository(overrides: Partial<JobsRepository> = {}): JobsRepository {
  return {
    list: vi.fn().mockResolvedValue(result),
    findById: vi.fn().mockResolvedValue(job),
    ...overrides,
  };
}

describe("jobs routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses URL filters and loads the selected repository", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);

    render(
      await JobsPage({
        searchParams: Promise.resolve({
          q: "  engineer  ",
          workplace: "hybrid",
          page: "2",
        }),
      }),
    );

    expect(jobsRepository.list).toHaveBeenCalledWith({
      q: "engineer",
      employment: "all",
      workingTime: "all",
      workplace: "hybrid",
      ir35: "all",
      page: 2,
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "UK jobs" }),
    ).toBeInTheDocument();
  });

  it("renders a detail from the repository", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);

    render(await JobDetailPage({ params: Promise.resolve({ jobId: job.id }) }));

    expect(jobsRepository.findById).toHaveBeenCalledWith(job.id);
    expect(
      screen.getByRole("heading", { level: 1, name: job.title }),
    ).toBeInTheDocument();
  });

  it("uses Next not-found for invalid or missing job identifiers", async () => {
    const jobsRepository = repository({
      findById: vi.fn().mockResolvedValue(null),
    });
    getJobsRepository.mockResolvedValue(jobsRepository);

    await expect(
      JobDetailPage({ params: Promise.resolve({ jobId: "not-a-uuid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
