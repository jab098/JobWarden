import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccessStateView } from "./access-state-view";
import { PublicHome } from "./public-home";
import { SignInView } from "./sign-in-view";
import { ProtectedErrorView } from "./protected-error-view";
import { ProtectedLoadingView } from "./protected-loading-view";

describe("public private-beta entry", () => {
  it("explains the UK job-search purpose without commercial promises", () => {
    render(<PublicHome />);

    expect(
      screen.getByRole("heading", { name: "JobWarden" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /request access/i }),
    ).toHaveAttribute("href", "/auth/sign-in");
    expect(
      screen.getByText(/applications stay in your hands/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every request is reviewed by the owner."),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /premium|upgrade|subscription/i,
    );
  });

  it("offers the new-user walkthrough and a skip, for local fixture development", () => {
    render(<PublicHome dataMode="fixtures" />);

    // The call to action walks onboarding into a first-run Home, which is the
    // sequence worth reviewing; the populated workspace stays one click away.
    expect(
      screen.getByRole("link", { name: /walk the new-user journey/i }),
    ).toHaveAttribute("href", "/development/journey");
    expect(
      screen.getByRole("link", { name: /skip to the populated workspace/i }),
    ).toHaveAttribute("href", "/home");
    expect(screen.getByText(/development data/i)).toBeInTheDocument();
    expect(
      screen.getByText("Explicitly fictional fixtures are enabled locally."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /request access/i }),
    ).not.toBeInTheDocument();
  });
});
describe("public legal footer", () => {
  it.each([
    ["landing", () => render(<PublicHome />)],
    ["sign-in", () => render(<SignInView action={() => {}} />)],
    // The terminal screen for a rejected or suspended user: their identity and
    // access request are already stored and there is no route onward, so this
    // is the page most likely to want the policy.
    [
      "access status",
      () =>
        render(<AccessStateView status="rejected" signOutAction={() => {}} />),
    ],
  ])(
    "reaches the privacy policy and terms from the %s page",
    (_page, mount) => {
      // A beta that reads CVs must not make its privacy policy a direct-URL
      // secret, even while the surface stays deliberately quiet.
      mount();

      const legal = screen.getByRole("contentinfo");
      expect(
        within(legal).getByRole("link", { name: "Privacy" }),
      ).toHaveAttribute("href", "/privacy");
      expect(
        within(legal).getByRole("link", { name: "Terms" }),
      ).toHaveAttribute("href", "/terms");
    },
  );

  it.each([
    ["landing", () => render(<PublicHome />)],
    ["sign-in", () => render(<SignInView action={() => {}} />)],
    [
      "access status",
      () =>
        render(<AccessStateView status="rejected" signOutAction={() => {}} />),
    ],
  ])(
    "keeps the %s footer outside main, so it stays a landmark",
    (_page, mount) => {
      // <footer> maps to contentinfo only when it is not nested inside a
      // sectioning element. Testing Library reports the role either way, so
      // the structure is the only thing that catches a regression here.
      const { container } = mount();

      expect(container.querySelector("footer")).not.toBeNull();
      expect(container.querySelector("main footer")).toBeNull();
    },
  );
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
});
