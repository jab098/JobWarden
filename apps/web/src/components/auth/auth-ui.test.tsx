import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The dialog imports a server action, which reaches server-only modules. The
// component tests only care about its own behaviour, not that module graph.
vi.mock("server-only", () => ({}));
vi.mock("@/app/auth/early-access/actions", () => ({
  joinEarlyAccessAction: vi.fn(async () => ({ kind: "idle" as const })),
}));

import { AccessStateView } from "./access-state-view";
import { PublicHome } from "./public-home";
import { SignInView } from "./sign-in-view";
import { ProtectedErrorView } from "./protected-error-view";
import { ProtectedLoadingView } from "./protected-loading-view";

describe("public private-beta entry", () => {
  it("explains the UK job-search purpose without commercial promises", () => {
    render(
      <PublicHome signInAction={async () => {}} turnstileSiteKey="test-key" />,
    );

    expect(
      screen.getByRole("heading", { name: "JobWarden" }),
    ).toBeInTheDocument();
    // The call to action opens the access dialog rather than navigating, so
    // joining the list and signing in are one decision in one place.
    expect(
      screen.getByRole("button", { name: /request access/i }),
    ).toBeEnabled();
    // What sets JobWarden apart from the mass-apply tools, said first.
    expect(screen.getByText(/we don't mass-apply/i)).toBeInTheDocument();
    expect(
      screen.getByText(/you apply yourself, on the employer's own site/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every request is reviewed by the owner."),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /premium|upgrade|subscription/i,
    );
  });

  it("offers the new-user walkthrough and a skip, for local fixture development", () => {
    render(
      <PublicHome
        signInAction={async () => {}}
        turnstileSiteKey="test-key"
        dataMode="fixtures"
      />,
    );

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
      screen.queryByRole("button", { name: /request access/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the access dialog on the call to action", async () => {
    const user = userEvent.setup();
    render(
      <PublicHome signInAction={async () => {}} turnstileSiteKey="test-key" />,
    );

    await user.click(screen.getByRole("button", { name: /request access/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /get access to jobwarden/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: /request access/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: /invited\? sign in/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toBeRequired();
  });

  it("offers Google sign-in on the invited tab, never a password", async () => {
    const user = userEvent.setup();
    render(
      <PublicHome signInAction={async () => {}} turnstileSiteKey="test-key" />,
    );

    await user.click(screen.getByRole("button", { name: /request access/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("tab", { name: /invited\? sign in/i }),
    );

    expect(
      within(dialog).getByRole("button", { name: /continue with google/i }),
    ).toBeEnabled();
    expect(dialog).not.toHaveTextContent(/password/i);
  });

  it("refuses to offer the list when the bot check is not configured", async () => {
    // Fails closed. A public writer with no bot check is the thing the check
    // exists to prevent, so the form is withheld rather than shown and refused.
    const user = userEvent.setup();
    render(
      <PublicHome signInAction={async () => {}} turnstileSiteKey={null} />,
    );

    await user.click(screen.getByRole("button", { name: /request access/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByLabelText("Email")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/not accepting entries yet/i),
    ).toBeInTheDocument();
  });
});
describe("public legal footer", () => {
  it.each([
    [
      "landing",
      () =>
        render(
          <PublicHome
            signInAction={async () => {}}
            turnstileSiteKey="test-key"
          />,
        ),
    ],
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
    [
      "landing",
      () =>
        render(
          <PublicHome
            signInAction={async () => {}}
            turnstileSiteKey="test-key"
          />,
        ),
    ],
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
