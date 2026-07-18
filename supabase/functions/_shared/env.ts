import { z } from "zod";

import type { RuntimeEnvironment } from "../ingest-jobs/contracts.ts";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  INGESTION_CRON_SECRET: z.string().min(32),
  REED_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .min(1)
      .max(512)
      .regex(/^[\x20-\x7e]+$/)
      .optional(),
  ),
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

export function readRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): RuntimeEnvironment {
  const result = environmentSchema.safeParse(source);
  const supabaseUrl = result.success
    ? exactHttpOrigin(result.data.SUPABASE_URL)
    : null;

  if (!result.success || supabaseUrl === null) {
    throw new Error("Invalid ingestion runtime configuration.");
  }

  return {
    supabaseUrl,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    cronSecret: result.data.INGESTION_CRON_SECRET,
    ...(result.data.REED_API_KEY === undefined
      ? {}
      : { reedApiKey: result.data.REED_API_KEY }),
  };
}
