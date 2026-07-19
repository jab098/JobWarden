import "server-only";

import type { NotificationSettingsResult } from "./types";

export interface NotificationsRepository {
  getSettings(): Promise<NotificationSettingsResult>;
  setChannelEnabled(enabled: boolean): Promise<void>;
}

/**
 * Unsubscribe is deliberately separate from the owner repository: it runs on a
 * public route with no session, using only the token from the email link.
 */
export interface UnsubscribeRepository {
  unsubscribe(token: string): Promise<void>;
}
