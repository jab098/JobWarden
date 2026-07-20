"use client";

import { useActionState } from "react";

import { setNotificationChannelAction } from "@/app/(protected)/profile/actions";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import type {
  NotificationDeliveryStatus,
  NotificationSettingsView,
  NotificationsActionState,
} from "@/lib/notifications/types";

const initialState: NotificationsActionState = { kind: "idle" };

/**
 * Honest per-status wording. A quiet slot is never described as a failure, and
 * a suppressed slot always says why.
 */
const deliveryLabels: Record<
  NotificationDeliveryStatus,
  { label: string; dot: string }
> = {
  sent: { label: "Sent", dot: "bg-[#2f6f4f]" },
  pending: { label: "Sending", dot: "bg-[#8a6d2f]" },
  failed: {
    label: "Delivery failed, retried at the next slot",
    dot: "bg-danger",
  },
  suppressed_no_matches: {
    label: "No new matches, so no email",
    dot: "bg-[#9aa1ae]",
  },
  suppressed_daily_cap: {
    label: "Held back by the daily sending limit",
    dot: "bg-[#8a6d2f]",
  },
  suppressed_monthly_cap: {
    label: "Held back by the monthly sending limit",
    dot: "bg-[#8a6d2f]",
  },
};

const slotFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Slot keys are `YYYY-MM-DDTHH` in London; render them in the same calendar. */
function formatSlot(slotKey: string): string {
  const [date, hour] = slotKey.split("T");
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || hour === undefined) return slotKey;
  return `${slotFormatter.format(parsed)}, ${hour}:00`;
}

export function NotificationSettings({
  result,
}: {
  result: NotificationSettingsView;
}) {
  const [state, action, pending] = useActionState(
    setNotificationChannelAction,
    initialState,
  );
  const readOnly = result.dataMode === "fixtures";

  return (
    <section
      aria-labelledby="notifications-heading"
      className="mt-4 rounded-lg border border-border bg-card p-5"
    >
      <h2
        id="notifications-heading"
        className="text-base font-semibold tracking-[-0.01em] text-foreground"
      >
        Digest emails
      </h2>
      <p className="mt-2 max-w-prose text-sm text-ink-secondary">
        JobWarden checks for new matches after each shared weekday update at
        09:00, 12:00, 15:00, and 18:00 UK time. You get at most one email per
        slot, and only when a search profile has matched something it has not
        already told you about. A digest lists roles and links to your target
        feed; it never contains anything from your CV.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action={action}>
          <input
            type="hidden"
            name="enabled"
            value={result.channelEnabled ? "off" : "on"}
          />
          <Button type="submit" disabled={readOnly || pending}>
            {result.channelEnabled
              ? "Turn digest emails off"
              : "Turn digest emails on"}
          </Button>
        </form>
        <p className="text-sm text-ink-secondary">
          <span
            aria-hidden="true"
            className={`mr-2 inline-block size-2 rounded-full align-middle ${
              result.channelEnabled ? "bg-[#2f6f4f]" : "bg-[#9aa1ae]"
            }`}
          />
          {result.channelEnabled
            ? "Digest emails are on."
            : "Digest emails are off."}
        </p>
        <ActionFeedback state={state} />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-foreground">
          Search profiles sending digests
        </h3>
        {result.notifyingProfileNames.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-ink-secondary">
            No search profile is set to notify yet. Turn on notifications for a
            named search above to receive its new matches.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary">
            {result.notifyingProfileNames.map((name) => (
              <li key={name} className="[overflow-wrap:anywhere]">
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-foreground">Recent slots</h3>
        {result.recentDeliveries.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-ink-secondary">
            Nothing yet. Delivery outcomes for each slot appear here once
            digests are on.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#ece9e2] border-y border-border">
            {result.recentDeliveries.map((delivery) => {
              const { label, dot } = deliveryLabels[delivery.status];
              return (
                <li
                  key={delivery.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="font-mono text-xs text-ink-faint">
                    {formatSlot(delivery.slotKey)}
                  </span>
                  <span className="text-sm text-ink-secondary">
                    <span
                      aria-hidden="true"
                      className={`mr-2 inline-block size-2 rounded-full align-middle ${dot}`}
                    />
                    {label}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {delivery.matchCount === 1
                      ? "1 new match"
                      : `${delivery.matchCount} new matches`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {readOnly ? (
        <p className="mt-5 text-sm text-ink-secondary">
          This preview shows fictional delivery history and cannot change
          notification settings.
        </p>
      ) : null}

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-medium text-foreground">Your data</h3>
        <p className="mt-2 max-w-prose text-sm text-ink-secondary">
          Download everything JobWarden holds about you as a JSON file. Your CV
          file itself stays where it is; the export lists it rather than copying
          it.
        </p>
        <p className="mt-3">
          <a
            href="/profile/export"
            className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Export my data
          </a>
        </p>
      </div>
    </section>
  );
}
