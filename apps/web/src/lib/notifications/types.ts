export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "suppressed_no_matches"
  | "suppressed_daily_cap"
  | "suppressed_monthly_cap";

export type NotificationDelivery = {
  id: string;
  /** Hour-resolution Europe/London slot, for example `2026-07-20T09`. */
  slotKey: string;
  status: NotificationDeliveryStatus;
  matchCount: number;
  createdAt: string;
};

export type NotificationChannelState = {
  channelEnabled: boolean;
  /**
   * Which of the shared update slots this owner wants a digest for, and on
   * which ISO weekdays (1 Monday to 5 Friday). Hours are a subset of
   * `notificationSlotHours` and never more than three, matching the database
   * constraint; a schedule outside that vocabulary would name a time at which
   * nothing new has been indexed.
   */
  digestHours: readonly number[];
  digestWeekdays: readonly number[];
  recentDeliveries: readonly NotificationDelivery[];
  dataMode: "supabase" | "fixtures";
};

export const MAX_DIGEST_HOURS_PER_DAY = 3;

/**
 * What the settings section renders. The notifying profile names come from the
 * career snapshot the page has already loaded, so reading them costs no second
 * round trip.
 */
export type NotificationSettingsView = NotificationChannelState & {
  notifyingProfileNames: readonly string[];
};

export type NotificationsActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
