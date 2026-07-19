import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const actionMocks = vi.hoisted(() => ({
  setNotificationChannelAction: vi.fn(),
  unsubscribeAction: vi.fn(),
}));
vi.mock("@/app/(protected)/profile/actions", () => ({
  setNotificationChannelAction: actionMocks.setNotificationChannelAction,
}));
vi.mock("@/app/unsubscribe/actions", () => ({
  unsubscribeAction: actionMocks.unsubscribeAction,
}));

import { UnsubscribeForm } from "@/app/unsubscribe/unsubscribe-form";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { createDevelopmentNotificationsRepository } from "@/lib/notifications/development-notifications";
import type { NotificationSettingsView } from "@/lib/notifications/types";

const fictional =
  await createDevelopmentNotificationsRepository().getSettings();

function settings(
  overrides: Partial<NotificationSettingsView> = {},
): NotificationSettingsView {
  return {
    ...fictional,
    dataMode: "supabase",
    notifyingProfileNames: ["Analytics implementation"],
    ...overrides,
  };
}

beforeEach(() => {
  actionMocks.setNotificationChannelAction.mockReset().mockResolvedValue({
    kind: "success",
    message: "Digest emails are off.",
  });
  actionMocks.unsubscribeAction.mockReset().mockResolvedValue({
    kind: "success",
    message:
      "If that link was still active, digest emails are now off for that account.",
  });
});

describe("NotificationSettings", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<NotificationSettings result={settings()} />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("states the approved weekday cadence", () => {
    render(<NotificationSettings result={settings()} />);

    expect(
      screen.getByText(/09:00, 12:00, 15:00, and 18:00 UK time/),
    ).toBeInTheDocument();
  });

  it("promises no CV content in a digest", () => {
    render(<NotificationSettings result={settings()} />);

    expect(
      screen.getByText(/never contains anything from your CV/),
    ).toBeInTheDocument();
  });

  it("offers to turn the channel off when it is on", () => {
    render(
      <NotificationSettings result={settings({ channelEnabled: true })} />,
    );

    expect(
      screen.getByRole("button", { name: "Turn digest emails off" }),
    ).toBeEnabled();
  });

  it("offers to turn the channel on when it is off", () => {
    render(
      <NotificationSettings result={settings({ channelEnabled: false })} />,
    );

    expect(
      screen.getByRole("button", { name: "Turn digest emails on" }),
    ).toBeEnabled();
  });

  it("submits the opposite of the current state", async () => {
    const user = userEvent.setup();
    render(
      <NotificationSettings result={settings({ channelEnabled: true })} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Turn digest emails off" }),
    );

    await waitFor(() =>
      expect(actionMocks.setNotificationChannelAction).toHaveBeenCalled(),
    );
    const [, formData] = actionMocks.setNotificationChannelAction.mock.calls[0];
    expect(formData.get("enabled")).toBe("off");
  });

  it("describes a quiet slot honestly rather than as a failure", () => {
    render(<NotificationSettings result={settings()} />);

    expect(screen.getByText("No new matches, so no email")).toBeInTheDocument();
  });

  it("says why a capped slot was held back", () => {
    render(<NotificationSettings result={settings()} />);

    expect(
      screen.getByText("Held back by the daily sending limit"),
    ).toBeInTheDocument();
  });

  it("says a failed send is retried rather than lost", () => {
    render(<NotificationSettings result={settings()} />);

    expect(
      screen.getByText("Delivery failed — retried at the next slot"),
    ).toBeInTheDocument();
  });

  it("lists the search profiles that opt in", () => {
    render(<NotificationSettings result={settings()} />);

    expect(screen.getByText("Analytics implementation")).toBeInTheDocument();
  });

  it("explains when no search profile notifies", () => {
    render(
      <NotificationSettings result={settings({ notifyingProfileNames: [] })} />,
    );

    expect(
      screen.getByText(/No search profile is set to notify yet/),
    ).toBeInTheDocument();
  });

  it("designs the empty delivery history", () => {
    render(
      <NotificationSettings result={settings({ recentDeliveries: [] })} />,
    );

    expect(
      screen.getByText(/Delivery outcomes for each slot appear here/),
    ).toBeInTheDocument();
  });

  it("refuses mutation in the fictional preview", () => {
    render(
      <NotificationSettings result={settings({ dataMode: "fixtures" })} />,
    );

    expect(
      screen.getByRole("button", { name: /Turn digest emails/ }),
    ).toBeDisabled();
    expect(
      screen.getByText(/cannot change notification settings/),
    ).toBeInTheDocument();
  });

  it("renders a London slot key in the London calendar", () => {
    render(
      <NotificationSettings
        result={settings({
          recentDeliveries: [
            {
              id: "a0000000-0000-4000-8000-000000000009",
              slotKey: "2026-07-20T09",
              status: "sent",
              matchCount: 1,
              createdAt: "2026-07-20T08:10:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Mon 20 Jul, 09:00")).toBeInTheDocument();
    expect(screen.getByText("1 new match")).toBeInTheDocument();
  });
});

describe("UnsubscribeForm", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<UnsubscribeForm token="token-value" />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("changes nothing until the confirmation is submitted", () => {
    render(<UnsubscribeForm token="token-value" />);

    expect(actionMocks.unsubscribeAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Turn off digest emails" }),
    ).toBeEnabled();
  });

  it("submits the token from the link", async () => {
    const user = userEvent.setup();
    render(<UnsubscribeForm token="token-value" />);

    await user.click(
      screen.getByRole("button", { name: "Turn off digest emails" }),
    );

    await waitFor(() =>
      expect(actionMocks.unsubscribeAction).toHaveBeenCalled(),
    );
    const [, formData] = actionMocks.unsubscribeAction.mock.calls[0];
    expect(formData.get("token")).toBe("token-value");
  });

  it("confirms the outcome without revealing whether the token existed", async () => {
    const user = userEvent.setup();
    render(<UnsubscribeForm token="token-value" />);

    await user.click(
      screen.getByRole("button", { name: "Turn off digest emails" }),
    );

    expect(
      await screen.findByText(/If that link was still active/),
    ).toBeInTheDocument();
  });

  it("reports a failed request without claiming success", async () => {
    actionMocks.unsubscribeAction.mockResolvedValue({
      kind: "unavailable",
      message: "This request could not be completed. Try the link again.",
    });
    const user = userEvent.setup();
    render(<UnsubscribeForm token="token-value" />);

    await user.click(
      screen.getByRole("button", { name: "Turn off digest emails" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This request could not be completed.",
    );
  });
});
