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
  recentDeliveries: readonly NotificationDelivery[];
  dataMode: "supabase" | "fixtures";
};

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
