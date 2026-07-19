import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { JobsRepository } from "@/lib/jobs/repository";
import type { JobDetail, JobsPageResult } from "@/lib/jobs/types";

const {
  getJobsRepository,
  getTargetFeedRepository,
  getApplicationsRepository,
  notFound,
} = vi.hoisted(() => ({
  getJobsRepository: vi.fn(),
  getTargetFeedRepository: vi.fn(),
  getApplicationsRepository: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/jobs/get-repository", () => ({ getJobsRepository }));
vi.mock("@/lib/target-feed/get-repository", () => ({
  getTargetFeedRepository,
}));
vi.mock("@/lib/applications/get-repository", () => ({
  getApplicationsRepository,
}));
vi.mock("next/navigation", () => ({ notFound }));

import MatchesPage from "../matches/page";
import JobDetailPage from "./[jobId]/page";
import SearchJobsPage from "./page";

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
  compensationProvenance: "unknown",
  postedAt: null,
  closesAt: null,
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

function targetFeedRepository(enabledProfileNames: string[] = []) {
  return {
    getFeed: vi.fn().mockResolvedValue({
      items: [],
      enabledProfileNames,
      candidateCap: 200 as const,
      dataMode: "fixtures" as const,
    }),
    decide: vi.fn(),
    getDecisions: vi.fn().mockResolvedValue(new Map()),
  };
}

describe("jobs routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetFeedRepository.mockResolvedValue(targetFeedRepository());
  });

  it("parses URL filters and loads the selected repository", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);

    render(
      await SearchJobsPage({
        searchParams: Promise.resolve({
          q: "  engineer  ",
          location: " Leeds ",
          salaryMin: "45000",
          salaryPeriod: "year",
          posted: "7",
          sort: "closing",
          workplace: "hybrid",
          radius: "10",
          page: "2",
        }),
      }),
    );

    expect(jobsRepository.list).toHaveBeenCalledWith({
      q: "engineer",
      location: "Leeds",
      radius: 10,
      employment: "all",
      workingTime: "all",
      workplace: "hybrid",
      ir35: "all",
      compensation: "all",
      salaryMin: 45_000,
      salaryPeriod: "year",
      posted: "7",
      sort: "closing",
      page: 2,
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Search jobs" }),
    ).toBeInTheDocument();
  });

  it("searches every UK listing without consulting the scored feed", async () => {
    // Search is the whole catalogue. An enabled profile narrows matches, and
    // must not quietly narrow what a search returns.
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);
    const feed = targetFeedRepository(["Data platform lead"]);
    getTargetFeedRepository.mockResolvedValue(feed);

    render(await SearchJobsPage({ searchParams: Promise.resolve({}) }));

    expect(feed.getFeed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Search jobs" }),
    ).toBeInTheDocument();
  });

  it("reads existing decisions so search never offers to save a job twice", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);
    const feed = targetFeedRepository();
    getTargetFeedRepository.mockResolvedValue(feed);

    render(await SearchJobsPage({ searchParams: Promise.resolve({}) }));

    expect(feed.getDecisions).toHaveBeenCalledOnce();
  });

  it("still lists jobs when the decisions read fails", async () => {
    // Browsing the catalogue must not depend on a personalisation read. The
    // save controls fall back to unsaved rather than the search failing.
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);
    const feed = targetFeedRepository();
    feed.getDecisions.mockRejectedValue(
      new Error("Unable to load job decisions"),
    );
    getTargetFeedRepository.mockResolvedValue(feed);

    render(await SearchJobsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Search jobs" }),
    ).toBeInTheDocument();
  });

  it("renders the scored feed on its own route", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);
    getTargetFeedRepository.mockResolvedValue(
      targetFeedRepository(["Data platform lead"]),
    );

    render(await MatchesPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Your matches" }),
    ).toBeInTheDocument();
  });

  it("renders a detail from the repository with tracked-application state", async () => {
    const jobsRepository = repository();
    getJobsRepository.mockResolvedValue(jobsRepository);
    getApplicationsRepository.mockResolvedValue({
      getApplications: vi.fn().mockResolvedValue({
        items: [{ id: "91000000-0000-4000-8000-000000000001", job }],
        insights: null,
        dataMode: "fixtures",
      }),
    });

    render(await JobDetailPage({ params: Promise.resolve({ jobId: job.id }) }));

    expect(jobsRepository.findById).toHaveBeenCalledWith(job.id);
    expect(
      screen.getByRole("heading", { level: 1, name: job.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you are tracking an application for this job/i),
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
