import "server-only";

import type {
  NotificationsRepository,
  UnsubscribeRepository,
} from "./repository";
import type { NotificationChannelState } from "./types";

export class PreviewNotificationsUnavailableError extends Error {
  constructor() {
    super("Notification changes are unavailable in this preview.");
    this.name = "PreviewNotificationsUnavailableError";
  }
}

/**
 * Frozen fictional settings covering a sent digest, a quiet slot, a capped slot,
 * and a failed send, so every delivery state is designed and reviewable without
 * a live provider.
 */
const fictionalSettings: NotificationChannelState = Object.freeze({
  channelEnabled: true,
  digestHours: Object.freeze([9, 15]),
  digestWeekdays: Object.freeze([1, 2, 3, 4, 5]),
  recentDeliveries: Object.freeze([
    Object.freeze({
      id: "a0000000-0000-4000-8000-000000000001",
      slotKey: "2026-07-17T15",
      status: "sent" as const,
      matchCount: 3,
      createdAt: "2026-07-17T14:10:00.000Z",
    }),
    Object.freeze({
      id: "a0000000-0000-4000-8000-000000000002",
      slotKey: "2026-07-17T12",
      status: "suppressed_no_matches" as const,
      matchCount: 0,
      createdAt: "2026-07-17T11:10:00.000Z",
    }),
    Object.freeze({
      id: "a0000000-0000-4000-8000-000000000003",
      slotKey: "2026-07-17T09",
      status: "failed" as const,
      matchCount: 2,
      createdAt: "2026-07-17T08:10:00.000Z",
    }),
    Object.freeze({
      id: "a0000000-0000-4000-8000-000000000004",
      slotKey: "2026-07-16T18",
      status: "suppressed_daily_cap" as const,
      matchCount: 5,
      createdAt: "2026-07-16T17:10:00.000Z",
    }),
  ]) as readonly NotificationChannelState["recentDeliveries"][number][],
  dataMode: "fixtures" as const,
});

export function createDevelopmentNotificationsRepository(): NotificationsRepository {
  return {
    async getSettings() {
      return fictionalSettings;
    },
    async setChannelEnabled() {
      throw new PreviewNotificationsUnavailableError();
    },
    async setSchedule() {
      throw new PreviewNotificationsUnavailableError();
    },
  };
}

export function createDevelopmentUnsubscribeRepository(): UnsubscribeRepository {
  return {
    async unsubscribe() {
      throw new PreviewNotificationsUnavailableError();
    },
  };
}
