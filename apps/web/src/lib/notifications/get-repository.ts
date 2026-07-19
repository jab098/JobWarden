import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

import {
  createDevelopmentNotificationsRepository,
  createDevelopmentUnsubscribeRepository,
} from "./development-notifications";
import type {
  NotificationsRepository,
  UnsubscribeRepository,
} from "./repository";
import {
  createSupabaseNotificationsRepository,
  createSupabaseUnsubscribeRepository,
} from "./supabase-notifications";

function developmentAccessEnabled(): boolean {
  return resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  }).enabled;
}

export async function getNotificationsRepository(): Promise<NotificationsRepository> {
  if (developmentAccessEnabled()) {
    return createDevelopmentNotificationsRepository();
  }

  return createSupabaseNotificationsRepository(await createClient());
}

export async function getUnsubscribeRepository(): Promise<UnsubscribeRepository> {
  if (developmentAccessEnabled()) {
    return createDevelopmentUnsubscribeRepository();
  }

  return createSupabaseUnsubscribeRepository(await createClient());
}
