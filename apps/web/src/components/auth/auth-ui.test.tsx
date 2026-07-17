import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccessStateView } from "./access-state-view";
import { PublicHome } from "./public-home";
import { SignInView } from "./sign-in-view";
import { ProtectedErrorView } from "./protected-error-view";
import { ProtectedLoadingView } from "./protected-loading-view";
import { WorkspaceHoldingView } from "./workspace-holding-view";

describe("public private-beta entry", () => {
  it("explains the UK job-search purpose without commercial promises", () => {
    render(<PublicHome />);

    expect(
      screen.getByRole("heading", { name: /one place to watch uk work/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /request access/i }),
    ).toHaveAttribute("href", "/auth/sign-in");
    expect(
      screen.getByText(/applications stay in your hands/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every request is reviewed by the owner."),
    ).toHaveClass("text-[#596173]");
    expect(document.body).not.toHaveTextContent(
      /premium|upgrade|subscription/i,
    );
  });

  it("opens the jobs workspace directly for local fixture development", () => {
    render(<PublicHome dataMode="fixtures" />);

    expect(
      screen.getByRole("link", { name: /open jobs workspace/i }),
    ).toHaveAttribute("href", "/jobs");
    expect(screen.getByText(/development data/i)).toBeInTheDocument();
    expect(
      screen.getByText("Explicitly fictional fixtures are enabled locally."),
    ).toHaveClass("text-[#596173]");
    expect(
      screen.queryByRole("link", { name: /request access/i }),
    ).not.toBeInTheDocument();
  });
});

describe("sign-in state", () => {
  it("offers only Google and shows a generic callback error", () => {
    render(<SignInView action={vi.fn()} error="callback_failed" />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not complete sign-in/i,
    );
    expect(document.body).not.toHaveTextContent(/token|provider payload|@/i);
  });
});

describe("private-beta access states", () => {
  it("explains manual review for pending access", () => {
    render(<AccessStateView status="pending" signOutAction={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /request under review/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/reviewed manually/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /queue position|automatically approved/i,
    );
  });

  it("shows a rejected decision reason without exposing internal data", () => {
    render(
      <AccessStateView
        status="rejected"
        reason="The beta is focused on a smaller research group."
        signOutAction={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /request not approved/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/smaller research group/i)).toBeInTheDocument();
  });

  it("makes a suspended account state explicit", () => {
    render(<AccessStateView status="suspended" signOutAction={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /access is paused/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot open the jobs workspace/i),
    ).toBeInTheDocument();
  });

  it("explains when new access requests are closed", () => {
    render(<AccessStateView status="closed" signOutAction={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: /private beta is currently closed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no access request was created/i),
    ).toBeInTheDocument();
  });
});

describe("protected workspace states", () => {
  it("announces a restrained loading state", () => {
    render(<ProtectedLoadingView />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /checking your access/i,
    );
  });

  it("offers a recovery action without leaking an internal error", () => {
    render(<ProtectedErrorView reset={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not open the workspace/i,
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("provides a real protected jobs destination without fake data", () => {
    render(<WorkspaceHoldingView signOutAction={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /jobs workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your access is active/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /match score|jobs found|upgrade/i,
    );
  });
});
