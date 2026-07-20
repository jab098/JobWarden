"use client";

import { useActionState, useState } from "react";

import { notificationSlotHours } from "@jobwarden/domain";

import {
  setDigestScheduleAction,
  setNotificationChannelAction,
} from "@/app/(protected)/profile/actions";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import {
  MAX_DIGEST_HOURS_PER_DAY,
  type NotificationDeliveryStatus,
  type NotificationSettingsView,
  type NotificationsActionState,
} from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

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
      className="mt-4 card-surface p-5"
    >
      <h2
        id="notifications-heading"
        className="text-base font-semibold tracking-[-0.01em] text-foreground"
      >
        Digest emails
      </h2>
      <p className="mt-1 max-w-prose text-sm text-ink-secondary">
        AI reads each new UK listing against your evidence and preferences, and
        emails you only the ones that genuinely fit.
      </p>
      <p className="mt-3 max-w-prose text-sm text-ink-secondary">
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

      <DigestSchedule
        hours={result.digestHours}
        weekdays={result.digestWeekdays}
        readOnly={readOnly}
      />

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
    </section>
  );
}

const weekdayLabels: ReadonlyArray<readonly [number, string]> = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
];

/** A pill-shaped checkbox: the input carries the state, the label is the pill. */
function TogglePill({
  name,
  value,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  value: number;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-sm transition-[background-color,box-shadow,color] duration-150 ease-(--ease-smooth-out) select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-offset-1",
        checked
          ? "bg-primary font-medium text-primary-foreground"
          : "bg-surface-sunken text-ink-secondary shadow-[inset_0_0_0_1px_var(--card-ring)] hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45 hover:text-ink-secondary",
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="absolute size-0 opacity-0"
      />
      {label}
    </label>
  );
}

/**
 * The cadence controls. Hours are limited to the shared update slots because a
 * digest at any other time would report on nothing newly indexed, and to three
 * a day; the fourth unticked time disables rather than silently dropping an
 * earlier choice, so the ceiling is visible before it is hit.
 *
 * The read-only preview disables saving, not ticking. Ticking changes nothing
 * outside this component, and a reviewer who cannot work the control cannot
 * judge it; a dead grey block is not an honest preview of a live one.
 */
function DigestSchedule({
  hours,
  weekdays,
  readOnly,
}: {
  hours: readonly number[];
  weekdays: readonly number[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    setDigestScheduleAction,
    initialState,
  );
  const [chosenHours, setChosenHours] = useState<readonly number[]>(hours);
  const [chosenDays, setChosenDays] = useState<readonly number[]>(weekdays);

  const hourLimitReached = chosenHours.length >= MAX_DIGEST_HOURS_PER_DAY;
  const incomplete = chosenHours.length === 0 || chosenDays.length === 0;

  function toggle(
    set: readonly number[],
    value: number,
    checked: boolean,
  ): readonly number[] {
    return checked
      ? [...set, value].toSorted((a, b) => a - b)
      : set.filter((entry) => entry !== value);
  }

  return (
    <form action={action} className="mt-6 border-t border-border pt-5">
      <h3 className="text-sm font-medium text-foreground">
        When digests arrive
      </h3>
      <p className="mt-1.5 max-w-prose text-sm text-ink-secondary">
        Pick the days you want to hear from JobWarden and up to{" "}
        {MAX_DIGEST_HOURS_PER_DAY} of the update times above. Fewer times means
        fewer, fuller emails.
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-foreground">Days</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {weekdayLabels.map(([day, label]) => (
            <TogglePill
              key={day}
              name="weekday"
              value={day}
              label={label}
              checked={chosenDays.includes(day)}
              disabled={pending}
              onChange={(checked) =>
                setChosenDays((current) => toggle(current, day, checked))
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-foreground">
          Times, up to {MAX_DIGEST_HOURS_PER_DAY} a day
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {notificationSlotHours.map((hour) => {
            const checked = chosenHours.includes(hour);
            return (
              <TogglePill
                key={hour}
                name="hour"
                value={hour}
                label={`${String(hour).padStart(2, "0")}:00`}
                checked={checked}
                disabled={pending || (!checked && hourLimitReached)}
                onChange={(next) =>
                  setChosenHours((current) => toggle(current, hour, next))
                }
              />
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={readOnly || pending || incomplete}
        >
          Save schedule
        </Button>
        <p className="text-sm text-ink-secondary">
          {scheduleSummary(chosenDays, chosenHours)}
        </p>
        <ActionFeedback state={state} />
      </div>
      {readOnly ? (
        <p className="mt-2 text-xs text-ink-faint">
          Try the controls freely: this preview writes nothing, so saving is
          disabled.
        </p>
      ) : null}
    </form>
  );
}

/** States the chosen cadence back in plain words, including when it is empty. */
function scheduleSummary(
  days: readonly number[],
  hours: readonly number[],
): string {
  if (days.length === 0) return "Choose at least one day.";
  if (hours.length === 0) return "Choose at least one time.";
  const dayCopy =
    days.length === 5
      ? "every weekday"
      : days
          .map((day) => weekdayLabels.find(([value]) => value === day)?.[1])
          .filter(Boolean)
          .join(", ");
  const perDay = hours.length === 1 ? "once" : `${hours.length} times`;
  return `${perDay} a day, ${dayCopy}.`;
}
