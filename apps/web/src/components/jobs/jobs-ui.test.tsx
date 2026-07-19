import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The save control imports a server action; the component test only needs the
// control's own behaviour, not the action's server module graph.
vi.mock("@/app/(protected)/matches/actions", () => ({
  decideJobAction: vi.fn(async () => ({
    kind: "success" as const,
    message: "Job decision saved.",
  })),
}));

import { AppShell } from "@/components/app-shell";
import { JobsErrorView } from "@/components/jobs/jobs-error-view";
import { JobDetailView } from "@/components/jobs/job-detail-view";
import { JobsFeedView } from "@/components/jobs/jobs-feed-view";
import { JobsLoadingView } from "@/components/jobs/jobs-loading-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import type { JobDetail, JobListItem, JobsPageResult } from "@/lib/jobs/types";
import type { JobDecision } from "@/lib/target-feed/types";

const defaultFilters = parseJobFilters({});
const noDecisions = new Map<string, JobDecision>();

const populatedJob: JobListItem = {
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
  closesAt: null,
};

const unknownContract: JobListItem = {
  id: "7bdb95d3-7fde-4a08-9d37-4501525e61b6",
  title: "Data Migration Analyst",
  employer: "Fictional Severn Records Project",
  location: "Bristol, England",
  employmentType: "contract",
  workingTime: "full_time",
  workplaceType: "onsite",
  ir35Status: "unknown",
  compensationMinimum: null,
  compensationMaximum: null,
  compensationCurrency: null,
  compensationPeriod: "unknown",
  compensationProvenance: "unknown",
  postedAt: null,
  closesAt: null,
};

function createResult(overrides: Partial<JobsPageResult> = {}): JobsPageResult {
  return {
    items: [populatedJob, unknownContract],
    total: 2,
    latestListingUpdate: "2026-07-17T08:30:00.000Z",
    page: 1,
    pageSize: 25,
    dataMode: "fixtures",
    ...overrides,
  };
}

const detail: JobDetail = {
  ...populatedJob,
  employmentType: "contract",
  ir35Status: "outside",
  descriptionText:
    "Build dependable workflow tools for a fictional UK employer.",
  applicationUrl: "https://example.test/apply/senior-software-engineer",
  ukEligibilityEvidence: [
    "The fictional advert states that the role is based in Manchester, England.",
  ],
  sourceLabel: "Fictional local fixture",
  lastSeenAt: "2026-07-17T08:30:00.000Z",
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-07-17T12:00:00.000Z").getTime(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jobs workspace", () => {
  it("renders one semantic feed with labelled GET filters and stable job metadata", () => {
    render(
      <JobsFeedView
        decisions={noDecisions}
        filters={defaultFilters}
        result={createResult()}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Search jobs" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("form", { name: "Search jobs" })[0],
    ).toHaveAttribute("method", "get");
    expect(screen.getAllByLabelText("Keywords")[0]).toHaveAttribute(
      "name",
      "q",
    );
    expect(screen.getAllByLabelText("Location")[0]).toHaveAttribute(
      "name",
      "location",
    );
    expect(screen.getAllByLabelText("Date posted")[0]).toHaveAttribute(
      "name",
      "posted",
    );
    expect(
      screen.getAllByLabelText("Minimum salary in pounds")[0],
    ).toHaveAttribute("name", "salaryMin");
    expect(screen.getAllByLabelText("Salary period")[0]).toHaveAttribute(
      "name",
      "salaryPeriod",
    );
    expect(screen.getAllByLabelText("Employment type")[0]).toHaveAttribute(
      "name",
      "employment",
    );
    expect(screen.getAllByLabelText("Working time")[0]).toHaveAttribute(
      "name",
      "workingTime",
    );
    expect(screen.getAllByLabelText("Workplace")[0]).toHaveAttribute(
      "name",
      "workplace",
    );
    expect(screen.getAllByLabelText("IR35 status")[0]).toHaveAttribute(
      "name",
      "ir35",
    );
    expect(screen.getAllByLabelText("Salary information")[0]).toHaveAttribute(
      "name",
      "compensation",
    );
    expect(
      screen.getAllByRole("link", { name: "Clear all" })[0],
    ).toHaveAttribute("href", "/jobs");

    const firstJob = screen
      .getByRole("heading", { level: 2, name: populatedJob.title })
      .closest("article");
    expect(firstJob).not.toBeNull();
    expect(firstJob).toHaveClass("[overflow-wrap:anywhere]");
    const copy = firstJob?.textContent ?? "";
    const expectedOrder = [
      populatedJob.title,
      populatedJob.employer,
      populatedJob.location,
      "Hybrid",
      "Permanent",
      "Full time",
      "£72,000–£84,000 per year",
      "Advertised salary",
      "Posted 2 days ago",
      "View details",
    ];
    expectedOrder.reduce((previousIndex, value) => {
      const index = copy.indexOf(value);
      expect(index).toBeGreaterThan(previousIndex);
      return index;
    }, -1);

    const contract = screen
      .getByRole("heading", { level: 2, name: unknownContract.title })
      .closest("article");
    expect(contract).toHaveTextContent("IR35 status not stated");
    expect(contract).toHaveTextContent("Salary not stated");
    expect(contract).not.toHaveTextContent("£");
    expect(screen.getByText("2 jobs")).toBeInTheDocument();
    expect(screen.getByText(/Latest listing update/)).toBeInTheDocument();
    expect(screen.getByText("Development data")).toBeInTheDocument();
  });

  it("offers every active choice as a chip that lifts only itself", async () => {
    const filters = parseJobFilters({
      q: "engineer",
      location: "Leeds",
      workplace: "remote",
      page: "3",
    });

    render(
      <JobsFeedView
        decisions={noDecisions}
        filters={filters}
        result={createResult()}
      />,
    );

    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(
      within(chips).getByRole("link", { name: /In Leeds/ }),
    ).toHaveAttribute("href", "/jobs?q=engineer&workplace=remote");
    expect(within(chips).getByRole("link", { name: /remote/ })).toHaveAttribute(
      "href",
      "/jobs?q=engineer&location=Leeds",
    );
  });

  it("keeps the sort order as links so it works without JavaScript", () => {
    render(
      <JobsFeedView
        decisions={noDecisions}
        filters={parseJobFilters({ q: "engineer" })}
        result={createResult()}
      />,
    );

    const sort = screen.getByRole("navigation", { name: "Sort results" });
    expect(
      within(sort).getByRole("link", { name: "Closing soonest" }),
    ).toHaveAttribute("href", "/jobs?q=engineer&sort=closing");
  });

  it("says a job is already saved rather than offering to save it twice", () => {
    render(
      <JobsFeedView
        decisions={new Map([[populatedJob.id, "saved" as const]])}
        filters={defaultFilters}
        result={createResult()}
      />,
    );

    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("opens and closes accessible mobile navigation and filter sheets", async () => {
    const user = userEvent.setup();
    render(
      <AppShell dataMode="fixtures">
        <JobsFeedView
          decisions={noDecisions}
          filters={defaultFilters}
          result={createResult()}
        />
      </AppShell>,
    );

    expect(screen.getByText("UK jobs workspace")).toHaveClass("text-[#596173]");

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("dialog", { name: "JobWarden navigation" }),
    ).toBeInTheDocument();
    for (const label of screen.getAllByText("UK jobs workspace")) {
      expect(label).toHaveClass("text-[#596173]");
    }
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "JobWarden navigation" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open job filters" }));
    expect(
      screen.getByRole("dialog", { name: "Search jobs" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "Search jobs" }),
    ).not.toBeInTheDocument();
  });

  it("designs empty and no-results states without losing active filters", () => {
    const { rerender } = render(
      <JobsFeedView
        decisions={noDecisions}
        filters={defaultFilters}
        result={createResult({
          items: [],
          total: 0,
          latestListingUpdate: null,
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Listings are not available yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/permitted sources have not produced active listings/i),
    ).toBeInTheDocument();

    rerender(
      <JobsFeedView
        decisions={noDecisions}
        filters={{ ...defaultFilters, q: "cobol" }}
        result={createResult({
          items: [],
          total: 0,
          latestListingUpdate: null,
        })}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No jobs match this search" }),
    ).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("cobol")[0]).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Clear all filters" })[0],
    ).toHaveAttribute("href", "/jobs");

    rerender(
      <JobsFeedView
        decisions={noDecisions}
        filters={{ ...defaultFilters, page: 2 }}
        result={createResult({ items: [], total: 6, page: 2 })}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No jobs on this page" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/permitted sources have not produced/i),
    ).not.toBeInTheDocument();

    rerender(
      <JobsFeedView
        decisions={noDecisions}
        filters={{ ...defaultFilters, page: 1_000 }}
        result={createResult({ items: [], total: 6, page: 1_000 })}
      />,
    );
    expect(
      screen.getByRole("link", { name: /last available page/i }),
    ).toHaveAttribute("href", "/jobs");
  });

  it("preserves fractional and one-sided compensation semantics", () => {
    const hourly = {
      ...populatedJob,
      id: "d10b4459-e154-41ed-8bce-dac32eb9c5e0",
      compensationMinimum: 1_250,
      compensationMaximum: 1_475,
      compensationPeriod: "hour" as const,
    };
    const singleAmount = {
      ...hourly,
      id: "2dff65c2-c153-43db-befc-f3bb66210458",
      title: "Support Engineer",
      compensationMaximum: null,
    };

    render(
      <JobsFeedView
        decisions={noDecisions}
        filters={defaultFilters}
        result={createResult({ items: [hourly, singleAmount] })}
      />,
    );

    expect(screen.getByText("£12.50–£14.75 per hour")).toBeInTheDocument();
    expect(screen.getByText("£12.50 per hour")).toBeInTheDocument();
    expect(screen.queryByText(/From £12.50/)).not.toBeInTheDocument();
  });

  it("uses designed generic loading and error states", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const { rerender } = render(<JobsLoadingView />);

    expect(
      screen.getByRole("heading", { name: "Loading UK jobs" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("job-skeleton")).toHaveLength(4);

    rerender(<JobsErrorView reset={reset} />);
    expect(
      screen.getByRole("heading", { name: "Jobs are temporarily unavailable" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Supabase");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders a plain-text detail with a safe manual application link", () => {
    render(<JobDetailView dataMode="fixtures" job={detail} />);

    expect(
      screen.getByRole("heading", { level: 1, name: detail.title }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { level: 1, name: detail.title })
        .closest("article"),
    ).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByText(detail.descriptionText)).toBeInTheDocument();
    expect(
      screen.getByText(detail.ukEligibilityEvidence[0]),
    ).toBeInTheDocument();
    expect(screen.getByText(detail.sourceLabel)).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
    expect(screen.getByText("Full time")).toBeInTheDocument();
    expect(screen.getByText("£72,000–£84,000 per year")).toBeInTheDocument();
    expect(screen.getAllByText("Advertised salary").length).toBeGreaterThan(0);
    expect(screen.getByText("Posted 2 days ago")).toBeInTheDocument();

    const applyLink = screen.getByRole("link", {
      name: "Apply on employer website",
    });
    expect(applyLink).toHaveAttribute("href", detail.applicationUrl);
    expect(applyLink).toHaveAttribute("target", "_blank");
    expect(applyLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.queryByRole("form", { name: /application/i }),
    ).not.toBeInTheDocument();
  });

  it("never infers outside IR35 from a not-applicable detail value", () => {
    render(
      <JobDetailView
        dataMode="fixtures"
        job={{ ...detail, ir35Status: "not_applicable" }}
      />,
    );

    expect(screen.getByText("IR35 not applicable")).toBeInTheDocument();
    expect(screen.queryByText("Outside IR35")).not.toBeInTheDocument();
  });

  it("contains none of the deferred or prohibited product language", () => {
    render(
      <AppShell dataMode="fixtures">
        <JobsFeedView
          decisions={noDecisions}
          filters={defaultFilters}
          result={createResult()}
        />
      </AppShell>,
    );
    const page = document.body.textContent ?? "";
    for (const phrase of [
      "pricing",
      "premium",
      "upgrade",
      "AI score",
      "auto-apply",
    ]) {
      expect(page).not.toMatch(new RegExp(phrase, "i"));
    }
    expect(
      screen.queryByRole("link", { name: /admin/i }),
    ).not.toBeInTheDocument();
  });

  it("has no detectable axe violations in populated, no-results, and detail views", async () => {
    const populated = render(
      <JobsFeedView
        decisions={noDecisions}
        filters={defaultFilters}
        result={createResult()}
      />,
    );
    expect(await axe(populated.container)).toHaveNoViolations();
    populated.unmount();

    const noResults = render(
      <JobsFeedView
        decisions={noDecisions}
        filters={{ ...defaultFilters, workplace: "remote" }}
        result={createResult({
          items: [],
          total: 0,
          latestListingUpdate: null,
        })}
      />,
    );
    expect(await axe(noResults.container)).toHaveNoViolations();
    noResults.unmount();

    const jobDetail = render(
      <JobDetailView dataMode="fixtures" job={detail} />,
    );
    expect(await axe(jobDetail.container)).toHaveNoViolations();
  });

  it("uses visible focus styles for every primary workspace action", () => {
    render(
      <JobsFeedView
        decisions={noDecisions}
        filters={defaultFilters}
        result={createResult()}
      />,
    );

    for (const action of [
      screen.getByRole("button", { name: "Open job filters" }),
      screen.getAllByRole("button", { name: "Search" })[0],
      screen.getAllByRole("link", { name: "Clear all" })[0],
      screen.getAllByRole("link", { name: "View details" })[0],
    ]) {
      expect(action.className).toMatch(/focus-visible:/);
    }
  });
});
