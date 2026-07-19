import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuditLogTable } from "@/components/admin/audit-log-table";
import { OperationalHealthPanel } from "@/components/admin/operational-health";
import { getDevelopmentAdminSnapshot } from "@/lib/admin/development-admin";
import type { AuditLogEntry, OperationalHealth } from "@/lib/admin/types";

const { auditLog: entries, health } = getDevelopmentAdminSnapshot();

function withHealth(overrides: Partial<OperationalHealth["deliveries"]> = {}) {
  return { ...health, deliveries: { ...health.deliveries, ...overrides } };
}

describe("AuditLogTable", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<AuditLogTable entries={entries} />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("lists audited actions with their resource", () => {
    render(<AuditLogTable entries={entries} />);

    expect(screen.getByText("access.approved")).toBeInTheDocument();
    expect(screen.getByText(/access_request/)).toBeInTheDocument();
  });

  it("adds no control that could alter the record", () => {
    // The audit trail is evidence; a surface that could edit it would not be.
    const { container } = render(<AuditLogTable entries={entries} />);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("designs the empty state", () => {
    render(<AuditLogTable entries={[]} />);

    expect(screen.getByText(/No audited actions yet/)).toBeInTheDocument();
  });

  it("renders an entry with no metadata without inventing any", () => {
    const bare: AuditLogEntry = {
      ...entries[0]!,
      metadata: {},
      resourceId: null,
    };
    render(<AuditLogTable entries={[bare]} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("scrolls inside its own container rather than the page", () => {
    const { container } = render(<AuditLogTable entries={entries} />);

    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});

describe("OperationalHealthPanel", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<OperationalHealthPanel health={health} />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("shows remaining headroom, not just consumption", () => {
    render(<OperationalHealthPanel health={health} />);

    expect(screen.getByText(/left today of 80/)).toBeInTheDocument();
    expect(screen.getByText(/left this month of 2500/)).toBeInTheDocument();
  });

  it("says the headroom is what the send path will apply", () => {
    render(<OperationalHealthPanel health={health} />);

    expect(screen.getByText(/including\s+in-flight rows/)).toBeInTheDocument();
  });

  it("warns when the daily allowance is exhausted, without implying a charge", () => {
    render(
      <OperationalHealthPanel health={withHealth({ dailyHeadroom: 0 })} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /nothing is sent and nothing is charged/,
    );
  });

  it("does not warn while headroom remains", () => {
    render(<OperationalHealthPanel health={health} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains that a zero AI allowance is the default, not a fault", () => {
    render(<OperationalHealthPanel health={health} />);

    expect(screen.getByText(/which is the default/)).toBeInTheDocument();
  });

  it("adds no mutation control", () => {
    const { container } = render(<OperationalHealthPanel health={health} />);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
  });
});
