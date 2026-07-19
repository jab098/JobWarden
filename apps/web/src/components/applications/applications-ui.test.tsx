import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApplicationInsights } from "@jobwarden/domain";

import type {
  ApplicationItem as Item,
  ApplicationsResult,
} from "@/lib/applications/types";

import {
  ApplicationsViewPage,
  resolveApplicationsView,
} from "./applications-view";

vi.mock("@/app/(protected)/applications/actions", () => ({
  trackApplicationAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
  transitionApplicationAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
  updateApplicationPlanAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
  deleteApplicationAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
}));

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "91000000-0000-4000-8000-000000000001",
    job: {
      id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
      title: "Platform Engineer",
      employer: "Fictional Northstar Tools UK Ltd",
      location: "Manchester, England",
      employmentType: "permanent",
      workingTime: "full_time",
      workplaceType: "hybrid",
      ir35Status: "not_applicable",
      compensationMinimum: null,
      compensationMaximum: null,
      compensationCurrency: null,
      compensationPeriod: "unknown",
      compensationProvenance: "unknown",
      postedAt: "2026-07-15T09:00:00.000Z",
    },
    stage: "screening",
    nextAction: "Prepare fictional call notes",
    nextActionDueOn: "2026-07-10",
    nextActionState: "overdue",
    notes: null,
    lastTransitionAt: "2026-07-18T09:00:00.000Z",
    ...overrides,
  };
}

function result(
  overrides: Partial<ApplicationsResult> = {},
): ApplicationsResult {
  const items = overrides.items ?? [item()];
  return {
    items,
    insights: buildApplicationInsights(
      items.map((entry) => ({
        id: entry.id,
        stage: entry.stage,
        nextAction: entry.nextAction,
        nextActionDueOn: entry.nextActionDueOn,
        lastTransitionAt: entry.lastTransitionAt,
        reachedStages: [entry.stage],
      })),
      new Date("2026-07-19T12:00:00.000Z"),
    ),
    dataMode: "fixtures",
    ...overrides,
  };
}

afterEach(cleanup);

describe("resolveApplicationsView", () => {
  it("defaults to the list view", () => {
    expect(resolveApplicationsView(undefined)).toBe("list");
    expect(resolveApplicationsView("board")).toBe("board");
    expect(resolveApplicationsView("nonsense")).toBe("list");
  });
});

describe("applications experience", () => {
  it("renders the list with stage, follow-up state, and legal moves only", async () => {
    const { container } = render(
      <ApplicationsViewPage result={result()} view="list" />,
    );

    expect(
      screen.getByRole("heading", { name: "Applications" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Platform Engineer")).toBeInTheDocument();
    expect(screen.getAllByText("Screening").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);

    const moveSelect = screen.getByLabelText("Move to");
    const options = [...moveSelect.querySelectorAll("option")].map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "Interviewing",
      "Offer",
      "Rejected",
      "Withdrawn",
      "Archived",
    ]);
    expect(options).not.toContain("Accepted");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps a closed listing's application visible and honest", () => {
    render(
      <ApplicationsViewPage
        result={result({ items: [item({ job: null })] })}
        view="list"
      />,
    );

    expect(screen.getByText("Listing no longer available")).toBeInTheDocument();
    expect(
      screen.getByText(
        /your tracked application and its history are unaffected/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View job" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Move to")).toBeInTheDocument();
  });

  it("offers the audited re-open as the only move out of archived", () => {
    render(
      <ApplicationsViewPage
        result={result({
          items: [
            item({
              stage: "archived",
              nextAction: null,
              nextActionDueOn: null,
              nextActionState: "none",
            }),
          ],
        })}
        view="list"
      />,
    );

    const moveSelect = screen.getByLabelText("Move to");
    const options = [...moveSelect.querySelectorAll("option")].map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["Applied"]);
  });

  it("shows an honest empty state that never implies auto-apply", () => {
    render(<ApplicationsViewPage result={result({ items: [] })} view="list" />);

    expect(
      screen.getByText(/never submits applications or contacts recruiters/i),
    ).toBeInTheDocument();
  });

  it("renders the board with stage columns inside a scrollable region", async () => {
    const { container } = render(
      <ApplicationsViewPage
        result={result({
          items: [
            item(),
            item({
              id: "91000000-0000-4000-8000-000000000002",
              stage: "rejected",
              nextAction: null,
              nextActionDueOn: null,
              nextActionState: "none",
            }),
          ],
        })}
        view="board"
      />,
    );

    expect(
      screen.getByRole("region", { name: "Applications board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Screening column" }),
    ).toBeInTheDocument();
    const closed = screen.getByRole("region", { name: "Closed column" });
    expect(closed).toBeInTheDocument();
    expect(closed.textContent).toContain("Platform Engineer");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows honest outcome insights including the quiet bucket", () => {
    render(<ApplicationsViewPage result={result()} view="list" />);

    expect(
      screen.getByText("No stage change for 14+ days"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /an application with no stage change is never shown as rejected/i,
      ),
    ).toBeInTheDocument();
  });

  it("submits a stage move through the transition action", async () => {
    const { transitionApplicationAction } =
      await import("@/app/(protected)/applications/actions");
    const user = userEvent.setup();
    render(<ApplicationsViewPage result={result()} view="list" />);

    await user.selectOptions(screen.getByLabelText("Move to"), "interviewing");
    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(transitionApplicationAction).toHaveBeenCalled();
    const formData = vi.mocked(transitionApplicationAction).mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("applicationId")).toBe(
      "91000000-0000-4000-8000-000000000001",
    );
    expect(formData.get("stage")).toBe("interviewing");
  });

  it("requires an explicit confirmation before deleting", async () => {
    const user = userEvent.setup();
    render(<ApplicationsViewPage result={result()} view="list" />);

    expect(
      screen.queryByRole("button", { name: "Confirm delete" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("button", { name: "Confirm delete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep application" }),
    ).toBeInTheDocument();
  });
});
