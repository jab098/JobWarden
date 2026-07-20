import "server-only";

import { z } from "zod";

import type {
  NotificationsRepository,
  UnsubscribeRepository,
} from "./repository";
import {
  MAX_DIGEST_HOURS_PER_DAY,
  type NotificationChannelState,
  type NotificationDelivery,
} from "./types";

const RECENT_DELIVERY_LIMIT = 10;

/** Mirrors the database vocabulary, so a drifting row cannot reach the UI. */
const digestHoursSchema = z
  .array(z.union([z.literal(9), z.literal(12), z.literal(15), z.literal(18)]))
  .min(1)
  .max(MAX_DIGEST_HOURS_PER_DAY);
const digestWeekdaysSchema = z
  .array(z.number().int().min(1).max(5))
  .min(1)
  .max(5);

const settingsRowSchema = z.object({
  channel_enabled: z.boolean(),
  digest_hours: digestHoursSchema,
  digest_weekdays: digestWeekdaysSchema,
});

/** What a never-opted-in owner sees, matching the column defaults. */
const DEFAULT_HOURS: readonly number[] = [9, 15];
const DEFAULT_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

const deliveryRowSchema = z.object({
  id: z.string().uuid(),
  slot_key: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
  status: z.enum([
    "pending",
    "sent",
    "failed",
    "suppressed_no_matches",
    "suppressed_daily_cap",
    "suppressed_monthly_cap",
  ]),
  match_count: z.number().int().nonnegative(),
  created_at: z.string().min(1),
});

type QueryResponse = { data: unknown; error: unknown };

type SettingsQuery = {
  select(columns: string): { maybeSingle(): Promise<QueryResponse> };
};

type DeliveryQuery = {
  select(columns: string): {
    order(
      column: string,
      options: { ascending: boolean },
    ): { limit(count: number): Promise<QueryResponse> };
  };
};

type NotificationsClient = {
  from(table: "career_notification_settings"): SettingsQuery;
  from(table: "career_notification_deliveries"): DeliveryQuery;
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
};

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new Error("query failed");
  }
  return response.data;
}

function toDelivery(
  row: z.infer<typeof deliveryRowSchema>,
): NotificationDelivery {
  return {
    id: row.id,
    slotKey: row.slot_key,
    status: row.status,
    matchCount: row.match_count,
    createdAt: row.created_at,
  };
}

export function createSupabaseNotificationsRepository(
  client: object,
): NotificationsRepository {
  const supabaseClient = client as NotificationsClient;

  return {
    async getSettings(): Promise<NotificationChannelState> {
      try {
        const [settingsResponse, deliveriesResponse] = await Promise.all([
          supabaseClient
            .from("career_notification_settings")
            .select("channel_enabled,digest_hours,digest_weekdays")
            .maybeSingle(),
          supabaseClient
            .from("career_notification_deliveries")
            .select("id,slot_key,status,match_count,created_at")
            .order("created_at", { ascending: false })
            .limit(RECENT_DELIVERY_LIMIT),
        ]);

        const settings = settingsRowSchema
          .nullable()
          .parse(data(settingsResponse) ?? null);
        const deliveries = z
          .array(deliveryRowSchema)
          .max(RECENT_DELIVERY_LIMIT)
          .parse(data(deliveriesResponse) ?? []);

        return {
          // No row yet means the owner has never opted in.
          channelEnabled: settings?.channel_enabled ?? false,
          digestHours: settings?.digest_hours ?? DEFAULT_HOURS,
          digestWeekdays: settings?.digest_weekdays ?? DEFAULT_WEEKDAYS,
          recentDeliveries: deliveries.map(toDelivery),
          dataMode: "supabase",
        };
      } catch {
        throw new Error("Unable to load notification settings");
      }
    },

    async setChannelEnabled(enabled: boolean): Promise<void> {
      const targetEnabled = z.boolean().parse(enabled);
      try {
        data(
          await supabaseClient.rpc("set_career_notification_settings", {
            target_enabled: targetEnabled,
          }),
        );
      } catch {
        throw new Error("Unable to update notification settings");
      }
    },

    async setSchedule(
      hours: readonly number[],
      weekdays: readonly number[],
    ): Promise<void> {
      // Validated here as well as in the action and the database: this
      // repository is the last place the values are still structured data.
      const targetHours = digestHoursSchema.parse([...hours]);
      const targetWeekdays = digestWeekdaysSchema.parse([...weekdays]);
      try {
        data(
          await supabaseClient.rpc("set_career_digest_schedule", {
            target_hours: targetHours,
            target_weekdays: targetWeekdays,
          }),
        );
      } catch {
        throw new Error("Unable to update the digest schedule");
      }
    },
  };
}

export function createSupabaseUnsubscribeRepository(
  client: object,
): UnsubscribeRepository {
  const supabaseClient = client as NotificationsClient;

  return {
    async unsubscribe(token: string): Promise<void> {
      const targetToken = z.string().uuid().parse(token);
      try {
        data(
          await supabaseClient.rpc("unsubscribe_career_notifications", {
            target_token: targetToken,
          }),
        );
      } catch {
        throw new Error("Unable to complete the unsubscribe request");
      }
    },
  };
}
