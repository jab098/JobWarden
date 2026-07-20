"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/early-access/turnstile";
import {
  heardFromOptions,
  type EarlyAccessState,
} from "@/lib/early-access/types";

const heardFromValues = heardFromOptions.map(([value]) => value);

const joinSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().max(120).optional(),
    hopingFor: z.string().trim().max(1000).optional(),
    heardFrom: z.enum(heardFromValues as [string, ...string[]]).optional(),
    token: z.string().max(4096),
  })
  .strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

function optional(formData: FormData, key: string): string | undefined {
  const result = value(formData, key).trim();
  return result.length > 0 ? result : undefined;
}

/**
 * Joins the early-access list. Deliberately reachable without a session: the
 * point is that the visitor has no account yet.
 *
 * Every outcome that is not a validation error reports the same success
 * message, including an address already on the list. An unauthenticated
 * endpoint that distinguishes "added" from "already there" tells an attacker
 * which addresses are registered.
 */
export async function joinEarlyAccessAction(
  _previousState: EarlyAccessState,
  formData: FormData,
): Promise<EarlyAccessState> {
  const parsed = joinSchema.safeParse({
    email: value(formData, "email"),
    name: optional(formData, "name"),
    hopingFor: optional(formData, "hopingFor"),
    heardFrom: optional(formData, "heardFrom"),
    token: value(formData, "cf-turnstile-response"),
  });
  if (!parsed.success) {
    return {
      kind: "invalid",
      message: "Check the email address and try again.",
    };
  }

  const outcome = await verifyTurnstile(parsed.data.token);
  if (outcome === "unconfigured") {
    // Fails closed: a public writer with no bot check is the thing the check
    // exists to prevent, so the list stays shut until the keys are set.
    return {
      kind: "unavailable",
      message: "The early access list is not open yet. Please try again later.",
    };
  }
  if (outcome === "failed") {
    return {
      kind: "invalid",
      message: "That check did not pass. Please try it again.",
    };
  }

  try {
    const client = await createClient();
    const { error } = await client.rpc("join_early_access", {
      target_email: parsed.data.email,
      target_name: parsed.data.name ?? null,
      target_hoping_for: parsed.data.hopingFor ?? null,
      target_heard_from: parsed.data.heardFrom ?? null,
    });
    if (error) throw new Error("rpc failed");
  } catch {
    return {
      kind: "unavailable",
      message: "That could not be saved just now. Please try again later.",
    };
  }

  return {
    kind: "success",
    message: "You are on the list. We will email you when an invite is ready.",
  };
}
