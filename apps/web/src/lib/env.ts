import { z } from "zod";

const exactHttpOrigin = z.string().transform((value, context) => {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isOriginOnly =
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;

    if (!isHttp || !isOriginOnly) {
      context.addIssue({
        code: "custom",
        message: "Expected an exact HTTP(S) origin",
      });
      return z.NEVER;
    }

    return url.origin;
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected an exact HTTP(S) origin",
    });
    return z.NEVER;
  }
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: exactHttpOrigin,
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(
      /^sb_publishable_[A-Za-z0-9_-]{20,}$/,
      "Expected a Supabase publishable key",
    ),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(
  input: Record<string, string | undefined>,
): PublicEnv {
  return publicEnvSchema.parse(input);
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
