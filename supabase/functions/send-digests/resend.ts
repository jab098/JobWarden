import { z } from "zod";

import type { DigestSender, SendOutcome } from "./contracts.ts";

/**
 * The only module in this repository permitted to reference Resend, enforced by
 * `scripts/check-project-guardrails.mjs`. It lives inside a Supabase Edge
 * Function, so it is server-only by construction and can never reach a client
 * bundle.
 *
 * Delivery uses the documented HTTP API rather than the npm SDK: one request
 * replaces a dependency, which keeps the free-tier-first and minimal-dependency
 * constraints intact. This module owns its own credential parsing so no
 * neighbouring file needs the provider's name.
 *
 * There is no retry. One attempt per slot is deliberate — a retry loop against
 * an email provider is how a free allowance is spent twice on the same digest.
 * A failure is recorded and the next slot tries again.
 */
const ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

const apiKeySchema = z
  .string()
  .min(20)
  .max(200)
  .regex(/^[\x21-\x7e]+$/);

const responseSchema = z.object({ id: z.string().min(1).max(200) });

export function readResendApiKey(
  source: Readonly<Record<string, string | undefined>>,
): string | null {
  const result = apiKeySchema.safeParse(source.RESEND_API_KEY);
  return result.success ? result.data : null;
}

function failureCode(status: number): string {
  if (status === 401 || status === 403) return "provider_unauthorised";
  if (status === 422) return "provider_rejected_payload";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

export function createResendSender(apiKey: string): DigestSender {
  return {
    async send({ to, from, message, signal }): Promise<SendOutcome> {
      const timeout = AbortSignal.timeout(SEND_TIMEOUT_MS);
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.any([signal, timeout]),
        });

        if (!response.ok) {
          // The provider body may quote the recipient address back at us, so it
          // is never read into a log, an error, or a database column.
          return { status: "failed", errorCode: failureCode(response.status) };
        }

        const parsed = responseSchema.safeParse(await response.json());
        return {
          status: "sent",
          providerMessageId: parsed.success ? parsed.data.id : null,
        };
      } catch (error) {
        const aborted =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        return {
          status: "failed",
          errorCode: aborted ? "provider_timed_out" : "provider_unreachable",
        };
      }
    },
  };
}
