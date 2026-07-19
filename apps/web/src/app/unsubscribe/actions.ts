"use server";

import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { getUnsubscribeRepository } from "@/lib/notifications/get-repository";
import type { NotificationsActionState } from "@/lib/notifications/types";

import { getUnsubscribeMutationContext } from "./action-context";

const tokenSchema = z.string().uuid();

/**
 * Every outcome below the origin check reports the same message. An unknown,
 * malformed, or already-used token must be indistinguishable from a valid one,
 * or this page becomes a way to test whether a token exists.
 */
const settled: NotificationsActionState = {
  kind: "success",
  message:
    "If that link was still active, digest emails are now off for that account.",
};

export async function unsubscribeAction(
  _previousState: NotificationsActionState,
  formData: FormData,
): Promise<NotificationsActionState> {
  if (!isTrustedMutationOrigin(await getUnsubscribeMutationContext())) {
    return {
      kind: "forbidden",
      message: "This unsubscribe request could not be verified.",
    };
  }

  const raw = formData.get("token");
  const parsed = tokenSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return settled;

  try {
    await (await getUnsubscribeRepository()).unsubscribe(parsed.data);
  } catch {
    return {
      kind: "unavailable",
      message: "This request could not be completed. Try the link again.",
    };
  }

  return settled;
}
