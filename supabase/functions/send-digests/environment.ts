import { z } from "zod";

import type { NotificationEnvironment } from "./contracts.ts";

/**
 * Conservative defaults sit below the documented provider free allowance, so a
 * misconfigured deployment errs towards sending too little rather than towards
 * a bill. Recheck `docs/architecture/free-tier-services.md` before raising
 * either ceiling.
 */
const DEFAULT_DAILY_LIMIT = 80;
const DEFAULT_MONTHLY_LIMIT = 2_500;

const limitSchema = (fallback: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? fallback : value),
    z.coerce.number().int().min(0).max(100_000),
  );

const environmentSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  INGESTION_CRON_SECRET: z.string().min(32),
  NOTIFICATION_SITE_URL: z.string().min(1),
  NOTIFICATION_SENDER_ADDRESS: z.string().min(3).max(200),
  NOTIFICATION_DAILY_LIMIT: limitSchema(DEFAULT_DAILY_LIMIT),
  NOTIFICATION_MONTHLY_LIMIT: limitSchema(DEFAULT_MONTHLY_LIMIT),
});

function exactHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Accepts either a bare address or a `Display Name <address>` sender. The
 * address itself must be a single-part mailbox with no control characters, so a
 * misconfigured value cannot inject an extra header.
 */
const senderAddressPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]{2,}$/;

function exactSenderAddress(value: string): string | null {
  if (/[\r\n\t]/.test(value)) return null;
  const trimmed = value.trim();

  const angled = /^([^<>]{1,80}?)\s*<([^\s<>]+)>$/.exec(trimmed);
  if (angled) {
    const [, displayName, address] = angled;
    return senderAddressPattern.test(address)
      ? `${displayName} <${address}>`
      : null;
  }

  return senderAddressPattern.test(trimmed) ? trimmed : null;
}

export function readNotificationEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): NotificationEnvironment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error("Invalid notification runtime configuration.");
  }

  const supabaseUrl = exactHttpOrigin(result.data.SUPABASE_URL);
  const siteUrl = exactHttpOrigin(result.data.NOTIFICATION_SITE_URL);
  const senderAddress = exactSenderAddress(
    result.data.NOTIFICATION_SENDER_ADDRESS,
  );
  if (supabaseUrl === null || siteUrl === null || senderAddress === null) {
    throw new Error("Invalid notification runtime configuration.");
  }

  return {
    supabaseUrl,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    cronSecret: result.data.INGESTION_CRON_SECRET,
    siteUrl,
    senderAddress,
    dailyLimit: result.data.NOTIFICATION_DAILY_LIMIT,
    monthlyLimit: result.data.NOTIFICATION_MONTHLY_LIMIT,
  };
}
