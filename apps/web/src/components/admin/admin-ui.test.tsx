import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AccessDecisionForm } from "./access-decision-form";
import { AccessRequestList } from "./access-request-list";
import { AdminShell } from "./admin-shell";
import { IngestionRequestList } from "./ingestion-request-list";
import { IngestionRunList } from "./ingestion-run-list";
import { SourceHealthList } from "./source-health-list";
import { SourceList } from "./source-list";
import { SourceForm } from "./source-form";
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
      "boards.fictional.example.test",
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
    expect(screen.getByText("fictional_upstream_timeout")).toBeInTheDocument();

    rerender(<IngestionRequestList requests={snapshot.ingestionRequests} />);
    expect(screen.getByText("Pending request")).toBeInTheDocument();
    expect(screen.getByText(/54100000/)).toBeInTheDocument();
  });

  it("shows compact source freshness, salary provenance, and work-pattern counts", () => {
    render(<SourceHealthList sources={snapshot.sourceHealth} />);

    const source = screen
      .getByText("Fictional Northstar UK Ltd")
      .closest("article");
    expect(source).toHaveTextContent("greenhouse · complete snapshot source");
    expect(source).toHaveTextContent("Fresh · Last successful sync");
    expect(source).toHaveTextContent("Latest run: succeeded");
    expect(source).toHaveTextContent("42 active occurrences");
    expect(source).toHaveTextContent("Advertised salary31");
    expect(source).toHaveTextContent("Salary not stated11");
    expect(source).toHaveTextContent("Contract13");
    expect(source).toHaveTextContent("Temporary5");
    expect(source).toHaveTextContent("Full time37");
    expect(source).toHaveTextContent("Part time5");
  });

  it("requires explicit confirmation before a source can change state", async () => {
    const user = userEvent.setup();
    const sourceAction = vi.fn(async (): Promise<AdminActionState> => ({
      kind: "success",
      message: "Source configuration saved.",
    }));
    render(<SourceForm source={snapshot.sources[0]} action={sourceAction} />);

    await user.click(screen.getByRole("button", { name: "Save source" }));

    expect(
      screen.getByRole("alertdialog", {
        name: "Confirm source configuration for Fictional Northstar UK Ltd?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enable or disable collection from this source/i),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "Confirm source changes",
    });
    expect(confirm).toHaveAttribute("type", "submit");
    await user.click(confirm);
    await waitFor(() => expect(sourceAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Source configuration saved.",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not open source confirmation over invalid fields", async () => {
    const user = userEvent.setup();
    render(<SourceForm action={successAction} />);

    await user.click(screen.getByRole("button", { name: "Add source" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Employer")).toHaveFocus();
  });

  it("closes source confirmation and exposes server errors beside the fields", async () => {
    const user = userEvent.setup();
    const invalidAction = vi.fn(async (): Promise<AdminActionState> => ({
      kind: "invalid",
      message: "Check the highlighted fields and try again.",
    }));
    render(<SourceForm source={snapshot.sources[0]} action={invalidAction} />);

    await user.click(screen.getByRole("button", { name: "Save source" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm source changes" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the highlighted fields and try again.",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("announces a completed access decision", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AccessDecisionForm
        request={snapshot.accessRequests[0]}
        action={successAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.type(
      screen.getByLabelText("Decision reason"),
      "Approved for controlled private-beta access.",
    );
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Access decision recorded.",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    rerender(
      <AccessDecisionForm
        request={{ ...snapshot.accessRequests[0], status: "approved" }}
        action={successAction}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Access decision recorded.",
    );
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
