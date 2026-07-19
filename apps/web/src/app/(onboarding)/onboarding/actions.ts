"use server";

import { onboardingPaths, onboardingSteps } from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { readStepAnswers } from "@/lib/onboarding/answers-form";
import { getOnboardingRepository } from "@/lib/onboarding/get-repository";
import { PreviewOnboardingUnavailableError } from "@/lib/onboarding/repository";
import type { OnboardingActionState } from "@/lib/onboarding/types";

import { getOnboardingMutationContext } from "./action-context";

const advanceSchema = z
  .object({
    path: z.enum(onboardingPaths),
    step: z.enum(onboardingSteps),
    cvOutcome: z
      .union([
        z.enum(["rich", "rich_pdf_only", "thin", "failed", "none"]),
        z.literal(""),
      ])
      .optional(),
  })
  .strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

const forbidden: OnboardingActionState = {
  kind: "forbidden",
  message: "This onboarding step could not be verified.",
};

function mapError(error: unknown): OnboardingActionState {
  if (error instanceof PreviewOnboardingUnavailableError) {
    return {
      kind: "unavailable",
      message: "Onboarding changes are unavailable in this preview.",
    };
  }
  return {
    kind: "unavailable",
    message: "This step could not be saved. Try again.",
  };
}

export async function advanceOnboardingAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (!isTrustedMutationOrigin(await getOnboardingMutationContext())) {
    return forbidden;
  }

  const parsed = advanceSchema.safeParse({
    path: value(formData, "path"),
    step: value(formData, "step"),
    cvOutcome: value(formData, "cvOutcome"),
  });
  if (!parsed.success) {
    return { kind: "invalid", message: "Check this step and try again." };
  }

  // Answers are read against the step that submitted them, so a crafted field
  // cannot record an answer to a question this step never asked.
  const answers = readStepAnswers(parsed.data.path, parsed.data.step, {
    get: (name) => value(formData, name),
    getAll: (name) =>
      formData.getAll(name).filter((entry) => typeof entry === "string"),
  });
  if (answers === null) {
    return { kind: "invalid", message: "Check this step and try again." };
  }

  try {
    await (
      await getOnboardingRepository()
    ).advance({
      path: parsed.data.path,
      step: parsed.data.step,
      cvOutcome: parsed.data.cvOutcome ? parsed.data.cvOutcome : null,
      answers,
    });
    revalidatePath("/onboarding");
    return { kind: "success", message: "Saved." };
  } catch (error) {
    return mapError(error);
  }
}

export async function completeOnboardingAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  void formData;
  if (!isTrustedMutationOrigin(await getOnboardingMutationContext())) {
    return forbidden;
  }

  try {
    // Writes the search profile, digest preference, and Explore choice, then
    // asks the database to complete. The database refuses unless every step of
    // the chosen path is recorded, so finishing cannot be forced from here.
    await (await getOnboardingRepository()).finish();
  } catch (error) {
    return mapError(error);
  }

  revalidatePath("/", "layout");
  // The hub, which is where every other "signed in and set up" path lands.
  // The chosen preferences are already applied — they were written into the
  // search profile that drives matching — and are edited from /profile.
  //
  // They used to be carried here as URL filters instead. That only ever worked
  // on a page that reads them, and the destination an enabled profile produced
  // was not one, so the parameters sat in the address bar applying nothing.
  redirect("/home");
}
