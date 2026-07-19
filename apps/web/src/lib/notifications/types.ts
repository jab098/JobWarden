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

export type NotificationSettingsResult = {
  channelEnabled: boolean;
  /** Names of the enabled search profiles that currently opt in to digests. */
  notifyingProfileNames: readonly string[];
  recentDeliveries: readonly NotificationDelivery[];
  dataMode: "supabase" | "fixtures";
};

export type NotificationsActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
