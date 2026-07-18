import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AccessDecisionForm } from "./access-decision-form";
import { AccessRequestList } from "./access-request-list";
import { AdminShell } from "./admin-shell";
import { IngestionRequestList } from "./ingestion-request-list";
import { IngestionRunList } from "./ingestion-run-list";
import { SourceList } from "./source-list";
import { getDevelopmentAdminSnapshot } from "@/lib/admin/development-admin";
import type { AdminActionState } from "@/lib/admin/types";

const snapshot = getDevelopmentAdminSnapshot();
const successAction = vi.fn(async (): Promise<AdminActionState> => ({
  kind: "success",
  message: "Access decision recorded.",
}));

describe("administrator workspace", () => {
  it("uses a compact semantic shell with an explicit preview boundary", () => {
    render(
      <AdminShell preview>
        <h1>Administrator overview</h1>
      </AdminShell>,
    );

    expect(
      screen.getByText(
        "Read-only fictional administrator preview — no administrator access granted",
      ),
    ).toBeInTheDocument();
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Administrator primary",
    });
    expect(primaryNavigation).toBeInTheDocument();
    expect(
      within(primaryNavigation).getByRole("link", { name: "Access" }),
    ).toHaveAttribute("href", "#access");
    expect(
      within(primaryNavigation).getByRole("link", { name: "Sources" }),
    ).toHaveAttribute("href", "#sources");
    expect(
      within(primaryNavigation).getByRole("link", { name: "Ingestion" }),
    ).toHaveAttribute("href", "#ingestion");
  });

  it("renders access states and disables every decision in preview mode", () => {
    render(
      <AccessRequestList
        requests={snapshot.accessRequests}
        requestsEnabled={snapshot.accessRequestsEnabled}
        readOnly
      />,
    );

    expect(screen.getByText("Fictional Rowan")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(document.querySelector("form")).toBeNull();
  });

  it("requires an explicit reason inside a named confirmation dialog", async () => {
    const user = userEvent.setup();
    render(
      <AccessDecisionForm
        request={snapshot.accessRequests[0]}
        action={successAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      screen.getByRole("alertdialog", {
        name: "Approve access for Fictional Rowan?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Decision reason")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Confirm approval" }),
    ).toHaveAttribute("type", "submit");
  });

  it("shows source compliance and ingestion facts in a stable order", () => {
    const { rerender } = render(
      <SourceList sources={snapshot.sources} readOnly />,
    );

    const source = screen
      .getByText("Fictional Northstar UK Ltd")
      .closest("article");
    expect(source).not.toBeNull();
    const sourceCopy = source?.textContent ?? "";
    [
      "Fictional Northstar UK Ltd",
      "Enabled",
      "Every 60 minutes",
      "Last successful sync",
      "boards.greenhouse.io",
    ].reduce((previous, text) => {
      const index = sourceCopy.indexOf(text);
      expect(index).toBeGreaterThan(previous);
      return index;
    }, -1);
    expect(screen.getAllByText("Review overdue")).toHaveLength(2);

    rerender(<IngestionRunList runs={snapshot.runs} />);
    const successfulRun = screen
      .getAllByText("Fictional Northstar UK Ltd")[0]
      .closest("article");
    const runCopy = successfulRun?.textContent ?? "";
    [
      "Received",
      "42",
      "Eligible",
      "28",
      "Upserted",
      "5",
      "Unchanged",
      "23",
      "Closed",
      "1",
    ].reduce((previous, text) => {
      const index = runCopy.indexOf(text, previous + 1);
      expect(index).toBeGreaterThan(previous);
      return index;
    }, -1);
    expect(screen.getByText("upstream_timeout")).toBeInTheDocument();

    rerender(<IngestionRequestList requests={snapshot.ingestionRequests} />);
    expect(screen.getByText("Pending request")).toBeInTheDocument();
    expect(screen.getByText(/54100000/)).toBeInTheDocument();
  });

  it("has no automated accessibility violations across the three admin lists", async () => {
    const { container } = render(
      <AdminShell preview>
        <main>
          <h1>Administrator preview</h1>
          <AccessRequestList
            requests={snapshot.accessRequests}
            requestsEnabled
            readOnly
          />
          <SourceList sources={snapshot.sources} readOnly />
          <IngestionRequestList requests={snapshot.ingestionRequests} />
          <IngestionRunList runs={snapshot.runs} />
        </main>
      </AdminShell>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
