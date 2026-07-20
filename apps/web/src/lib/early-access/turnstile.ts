import "server-only";

import { z } from "zod";

/**
 * Cloudflare Turnstile, the bot check on the early-access form.
 *
 * Chosen because it is free at any volume we will ever reach, needs no account
 * linkage, and unlike a reCAPTCHA score it does not profile the visitor. The
 * secret is server-only; the site key is public by design.
 *
 * It fails **closed**. With no secret configured `verifyTurnstile` returns
 * `unconfigured` and the action refuses the submission rather than accepting
 * it, because an unverified public writer is exactly what the check exists to
 * prevent. That does mean the form cannot accept anyone until the owner sets
 * the keys, which is the correct trade for a publicly reachable insert.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

const verifyResponseSchema = z.object({ success: z.boolean() });

export type TurnstileOutcome = "passed" | "failed" | "unconfigured";

export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return key !== undefined && key.length > 0 ? key : null;
}

export async function verifyTurnstile(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileOutcome> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret === undefined || secret.length === 0) return "unconfigured";
  if (token.length === 0 || token.length > 4096) return "failed";

  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return "failed";
    return verifyResponseSchema.parse(await response.json()).success
      ? "passed"
      : "failed";
  } catch {
    // A timeout or a malformed body is not a pass. Cloudflare being
    // unreachable must not become an open door.
    return "failed";
  }
}
