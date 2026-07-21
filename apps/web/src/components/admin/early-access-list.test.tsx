import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EarlyAccessList } from "./early-access-list";
import type { AdminActionState, EarlyAccessSignup } from "@/lib/admin/types";

const inviteAction = vi.fn(async (): Promise<AdminActionState> => ({
  kind: "success",
  message: "Marked as invited.",
}));

/**
 * Entirely fictional. These addresses are on `example.test`, which is reserved
 * and cannot resolve.
 */
const signups: EarlyAccessSignup[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "older@example.test",
    name: "Older Person",
    // The acceptance criterion this file exists for: the free-text field is a
    // stranger's input and must never reach the page as markup.
    hopingFor: "<img src=x onerror=\"alert('xss')\"> a role in Leeds",
    heardFrom: "friend",
    createdAt: "2026-07-12T09:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "newer@example.test",
    name: null,
    hopingFor: null,
    heardFrom: null,
    createdAt: "2026-07-19T09:00:00.000Z",
  },
];

describe("early access list", () => {
  it("renders the free-text field as text and never as markup", () => {
    const { container } = render(
      <EarlyAccessList
        signups={signups}
        pending={2}
        inviteAction={inviteAction}
      />,
    );

    // The exact characters the stranger typed are on the page…
    expect(
      screen.getByText(/a role in Leeds/, { exact: false }).textContent,
    ).toContain("<img src=x");
    // …and no element was created from them.
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows how many are waiting, oldest first", () => {
    render(
      <EarlyAccessList
        signups={signups}
        pending={2}
        inviteAction={inviteAction}
      />,
    );

    expect(screen.getByText("2 waiting, oldest first.")).toBeTruthy();
    const entries = screen.getAllByRole("article");
    expect(within(entries[0]!).getByText("older@example.test")).toBeTruthy();
  });

  it("says when the page shows only part of the queue", () => {
    render(
      <EarlyAccessList
        signups={signups}
        pending={214}
        inviteAction={inviteAction}
      />,
    );
    expect(screen.getByText(/Showing the first 2\./)).toBeTruthy();
  });

  it("explains an empty queue rather than rendering nothing", () => {
    render(<EarlyAccessList signups={[]} pending={0} />);
    expect(screen.getByText("Nobody is waiting.")).toBeTruthy();
    expect(screen.getByText(/Nobody has joined/)).toBeTruthy();
  });

  // The fictional preview must never reach a production mutation, so the
  // read-only variant offers the control without an action behind it.
  it("disables the invite control when read-only", () => {
    render(<EarlyAccessList signups={signups} pending={2} readOnly />);
    for (const button of screen.getAllByRole("button", {
      name: "Mark invited",
    })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  it("carries the signup id rather than the email in the invite form", () => {
    const { container } = render(
      <EarlyAccessList
        signups={signups}
        pending={2}
        inviteAction={inviteAction}
      />,
    );

    const field = container.querySelector<HTMLInputElement>(
      'input[name="signupId"]',
    );
    expect(field?.value).toBe("11111111-1111-4111-8111-111111111111");
    // Nothing in the submitted form names an address.
    expect(container.innerHTML).not.toContain('name="email"');
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <EarlyAccessList
        signups={signups}
        pending={2}
        inviteAction={inviteAction}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
