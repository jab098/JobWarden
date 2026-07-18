import { z } from "zod";

import {
  careerExtractionLimits,
  type CareerRuntimeEnvironment,
} from "./contracts.ts";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(20).max(2_048).optional(),
);

const environmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CAREER_PROFILE_AI_DAILY_ALLOWANCE: z
    .string()
    .regex(/^\d+$/u)
    .transform(Number)
    .refine((value) => value <= careerExtractionLimits.maximumAiDailyAllowance)
    .default(0),
  CAREER_PROFILE_AI_MODEL: z.string().min(3).max(200).default("disabled"),
  CLOUDFLARE_ACCOUNT_ID: optionalSecret,
  CLOUDFLARE_API_TOKEN: optionalSecret,
});

export function readCareerRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): CareerRuntimeEnvironment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error("Invalid career extraction runtime configuration.");
  }
  const parsedUrl = new URL(result.data.SUPABASE_URL);
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error("Invalid career extraction runtime configuration.");
  }
  const hasCloudflare =
    result.data.CLOUDFLARE_ACCOUNT_ID !== undefined &&
    result.data.CLOUDFLARE_API_TOKEN !== undefined;
  return {
    supabaseUrl: parsedUrl.origin,
    anonKey: result.data.SUPABASE_ANON_KEY,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    aiDailyAllowance: hasCloudflare
      ? result.data.CAREER_PROFILE_AI_DAILY_ALLOWANCE
      : 0,
    aiModel: hasCloudflare ? result.data.CAREER_PROFILE_AI_MODEL : "disabled",
    ...(hasCloudflare
      ? {
          cloudflareAccountId: result.data.CLOUDFLARE_ACCOUNT_ID,
          cloudflareApiToken: result.data.CLOUDFLARE_API_TOKEN,
        }
      : {}),
  };
}
