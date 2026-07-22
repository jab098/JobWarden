import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const actionMocks = vi.hoisted(() => ({
  decideJobAction: vi.fn(),
}));
vi.mock("@/app/(protected)/matches/actions", () => ({
  decideJobAction: actionMocks.decideJobAction,
}));

import { SignInView } from "@/components/auth/sign-in-view";
import { ProfileSuggestionList } from "@/components/profile/profile-suggestion-list";
import { SourceList } from "@/components/admin/source-list";
import { IngestionRunList } from "@/components/admin/ingestion-run-list";
import { TargetFeedView } from "@/components/target-feed/target-feed-view";
import { matchesHref, parseIncludeDismissed } from "@/lib/target-feed/view";
import type { TargetFeedItem, TargetFeedResult } from "@/lib/target-feed/types";
import type { JobListItem } from "@/lib/jobs/types";

const job: JobListItem = {
  id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
  title: "Senior Data Engineer",
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

function makeItem(overrides: Partial<TargetFeedItem> = {}): TargetFeedItem {
  return {
    job,
    decision: null,
    explanation: {
      profileName: "Data platform lead",
      score: 82,
      components: [],
      matchedEvidence: ["Apache Spark pipelines", "Team leadership"],
      importantGaps: ["Kubernetes"],
      synonymCredits: [
        { term: "ETL", evidenceLabel: "Built ELT ingestion at FictionalCorp" },
      ],
      compensationTreatment: { kind: "advertised", withinPreference: true },
    },
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<TargetFeedResult> = {},
): TargetFeedResult {
  return {
    items: [makeItem()],
    enabledProfileNames: ["Data platform lead"],
    candidateCap: 200,
    dataMode: "fixtures",
    ...overrides,
  };
}

beforeEach(() => {
  actionMocks.decideJobAction.mockReset().mockResolvedValue({
    kind: "success",
    message: "Job decision saved.",
  });
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-07-17T12:00:00.000Z").getTime(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("matches view state", () => {
  it("parses the include-dismissed flag and builds hrefs", () => {
    expect(parseIncludeDismissed("1")).toBe(true);
    expect(parseIncludeDismissed(undefined)).toBe(false);
    expect(parseIncludeDismissed("0")).toBe(false);
    expect(matchesHref({ includeDismissed: true })).toBe(
      "/matches?includeDismissed=1",
    );
    expect(matchesHref({})).toBe("/matches");
  });
});

describe("target feed view", () => {
  it("shows the fit score with an accessible label and all four disclosure elements", async () => {
    const user = userEvent.setup();
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate="2026-07-17T08:30:00.000Z"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Your matches" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Fit 82 of 100")).toBeInTheDocument();
    expect(screen.getByText("Data platform lead")).toBeInTheDocument();

    await user.click(screen.getByText("Why this match"));

    expect(screen.getByText("Matching evidence")).toBeInTheDocument();
    expect(screen.queryByText(/Evidence that contributed/i)).toBeNull();
    expect(screen.getByText("Apache Spark pipelines")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
    expect(screen.getByText(/ETL/)).toBeInTheDocument();
    expect(screen.getAllByText(/Advertised salary/i).length).toBeGreaterThan(0);
  });

  it("surfaces a closing-soon deadline on a match", () => {
    // formatClosingSoon reads `new Date()`, which the beforeEach Date.now spy
    // does not touch, so anchor the deadline to the real clock and keep it
    // relative so it never drifts.
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    render(
      <TargetFeedView
        result={makeResult({
          items: [makeItem({ job: { ...job, closesAt: soon.toISOString() } })],
        })}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );
    expect(
      screen.getByText(/Closes (in \d+ days?|tomorrow|today)/),
    ).toBeInTheDocument();
  });

  it("has no sparkle or AI-match copy", () => {
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );
    const page = document.body.textContent ?? "";
    for (const phrase of ["AI match", "AI score", "sparkle", "AI-powered"]) {
      expect(page).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("calls the decision action and optimistically collapses a dismissed job", async () => {
    const user = userEvent.setup();
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );

    const row = screen.getByRole("heading", { name: job.title }).closest("li");
    expect(row).not.toBeNull();
    expect(row?.getAttribute("data-decision")).toBe("none");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(actionMocks.decideJobAction).toHaveBeenCalledTimes(1);
    });
    const formData = actionMocks.decideJobAction.mock.calls[0][1] as FormData;
    expect(formData.get("jobId")).toBe(job.id);
    expect(formData.get("decision")).toBe("dismissed");
    expect(row?.getAttribute("data-decision")).toBe("dismissed");
    expect(row?.getAttribute("aria-hidden")).toBe("true");
    expect(row?.hasAttribute("inert")).toBe(true);
  });

  it("marks a collapsed row inert so its controls stay out of the tab order", () => {
    render(
      <TargetFeedView
        result={makeResult({ items: [makeItem({ decision: "dismissed" })] })}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );

    const row = document.querySelector("li[data-decision='dismissed']");
    expect(row).not.toBeNull();
    expect(row?.hasAttribute("inert")).toBe(true);
    expect(row?.querySelector("button")).not.toBeNull();
  });

  it("rolls back a failed dismiss so the row stays visible with the error announced", async () => {
    actionMocks.decideJobAction.mockResolvedValue({
      kind: "unavailable",
      message: "This job decision could not be saved. Try again.",
    });
    const user = userEvent.setup();
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );

    const row = screen.getByRole("heading", { name: job.title }).closest("li");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This job decision could not be saved. Try again.",
      );
      expect(row?.getAttribute("data-decision")).toBe("none");
    });
    expect(row?.getAttribute("aria-hidden")).not.toBe("true");
    expect(screen.getByRole("heading", { name: job.title })).toBeVisible();
  });

  it("reverts a failed save so the button loses its selected state", async () => {
    actionMocks.decideJobAction.mockResolvedValue({
      kind: "forbidden",
      message: "This job decision could not be verified.",
    });
    const user = userEvent.setup();
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );

    const row = screen.getByRole("heading", { name: job.title }).closest("li");
    const save = screen.getByRole("button", { name: "Save" });
    await user.click(save);

    await waitFor(() => {
      expect(row?.getAttribute("data-decision")).toBe("none");
    });
    expect(save.className).not.toMatch(/bg-primary/);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This job decision could not be verified.",
    );
  });

  it("keeps dismissed jobs visible when include-dismissed is on and links the toggle", () => {
    render(
      <TargetFeedView
        result={makeResult({ items: [makeItem({ decision: "dismissed" })] })}
        includeDismissed={true}
        latestListingUpdate={null}
      />,
    );

    const row = screen.getByRole("heading", { name: job.title }).closest("li");
    expect(row?.getAttribute("aria-hidden")).not.toBe("true");
    expect(row?.hasAttribute("inert")).toBe(false);
    expect(
      screen.getByRole("link", { name: /hide dismissed/i }),
    ).toHaveAttribute("href", "/matches");
  });

  it("links to include dismissed when it is off", () => {
    render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );
    expect(
      screen.getByRole("link", { name: /include dismissed/i }),
    ).toHaveAttribute("href", "/matches?includeDismissed=1");
  });

  it("designs the no-enabled-profiles state pointing at the profile", () => {
    render(
      <TargetFeedView
        result={makeResult({ items: [], enabledProfileNames: [] })}
        includeDismissed={false}
        latestListingUpdate={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /no enabled search profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /career profile|set up/i }),
    ).toHaveAttribute("href", "/profile");
  });

  it("states the empty match gate honestly when profiles are enabled", () => {
    render(
      <TargetFeedView
        result={makeResult({ items: [] })}
        includeDismissed={false}
        latestListingUpdate="2026-07-17T08:30:00.000Z"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /no jobs match your profile/i }),
    ).toBeInTheDocument();
  });

  it("has no detectable axe violations", async () => {
    const { container } = render(
      <TargetFeedView
        result={makeResult()}
        includeDismissed={false}
        latestListingUpdate="2026-07-17T08:30:00.000Z"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("banned coloured left-border callout regression guard", () => {
  it("renders none of the refreshed surfaces with a border-l-2 accent strip", () => {
    const { container } = render(
      <div>
        <TargetFeedView
          result={makeResult()}
          includeDismissed={false}
          latestListingUpdate="2026-07-17T08:30:00.000Z"
        />
        <SignInView action={() => {}} error="failed" />
        <ProfileSuggestionList
          suggestions={[
            {
              id: "11111111-1111-4111-8111-111111111111",
              kind: "role_family",
              normalizedConcept: "senior data roles",
              label: "Move toward senior data roles",
              confidence: 0.6,
              state: "proposed",
              evidenceItemIds: ["33333333-3333-4333-8333-333333333333"],
              proposedAt: "2026-07-17T08:30:00.000Z",
            },
          ]}
          readOnly={false}
        />
        <SourceList sources={[]} />
        <IngestionRunList
          runs={[
            {
              id: "22222222-2222-4222-8222-222222222222",
              runId: "run_22222222",
              sourceId: "44444444-4444-4444-8444-444444444444",
              employerName: "Fictional Northstar Tools UK Ltd",
              provider: "greenhouse",
              status: "failed",
              triggerType: "manual",
              responseComplete: false,
              startedAt: "2026-07-17T08:30:00.000Z",
              completedAt: null,
              durationMs: 1200,
              retryCount: 1,
              receivedCount: 0,
              eligibleCount: 0,
              upsertedCount: 0,
              unchangedCount: 0,
              closedCount: 0,
              excludedNonUkCount: 0,
              quarantinedAmbiguousCount: 0,
              quarantinedInvalidUrlCount: 0,
              unrecognisedLocations: [],
              errorCode: "provider_unavailable",
            },
          ]}
        />
      </div>,
    );

    expect(container.querySelector(".border-l-2")).toBeNull();
  });
});
