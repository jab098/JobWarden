"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { getTargetFeedRepository } from "@/lib/target-feed/get-repository";
import type { TargetFeedActionState } from "@/lib/target-feed/types";

import { getJobsMutationContext } from "./action-context";

const decisionSchema = z
  .object({
    jobId: z.string().uuid(),
    decision: z.enum(["saved", "dismissed", "considering", "clear"]),
  })
  .strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

const forbidden: TargetFeedActionState = {
  kind: "forbidden",
  message: "This job decision could not be verified.",
};
const invalid: TargetFeedActionState = {
  kind: "invalid",
  message: "Check the job decision and try again.",
};
const unavailable: TargetFeedActionState = {
  kind: "unavailable",
  message: "Job decisions are unavailable in this preview.",
};

function mapError(error: unknown): TargetFeedActionState {
  if (error instanceof z.ZodError) return invalid;
  return unavailable;
}

export async function decideJobAction(
  _previousState: TargetFeedActionState,
  formData: FormData,
): Promise<TargetFeedActionState> {
  if (!isTrustedMutationOrigin(await getJobsMutationContext())) {
    return forbidden;
  }

  const parsed = decisionSchema.safeParse({
    jobId: value(formData, "jobId"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return invalid;

  try {
    await (
      await getTargetFeedRepository()
    ).decide(parsed.data.jobId, parsed.data.decision);
    revalidatePath("/jobs");
    return { kind: "success", message: "Job decision saved." };
  } catch (error) {
    return mapError(error);
  }
}
