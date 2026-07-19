import "server-only";

import { z } from "zod";

import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";

import type {
  NotificationsRepository,
  UnsubscribeRepository,
} from "./repository";
import type { NotificationDelivery, NotificationSettingsResult } from "./types";

const RECENT_DELIVERY_LIMIT = 10;

const settingsRowSchema = z.object({ channel_enabled: z.boolean() });

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
  const profileRepository = createSupabaseProfileRepository(client);

  return {
    async getSettings(): Promise<NotificationSettingsResult> {
      try {
        const [settingsResponse, deliveriesResponse, snapshot] =
          await Promise.all([
            supabaseClient
              .from("career_notification_settings")
              .select("channel_enabled")
              .maybeSingle(),
            supabaseClient
              .from("career_notification_deliveries")
              .select("id,slot_key,status,match_count,created_at")
              .order("created_at", { ascending: false })
              .limit(RECENT_DELIVERY_LIMIT),
            profileRepository.getSnapshot(),
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
          notifyingProfileNames: snapshot.searches
            .filter((search) => search.enabled && search.notificationsEnabled)
            .map((search) => search.name),
          recentDeliveries: deliveries.map(toDelivery),
          dataMode: snapshot.dataMode,
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
