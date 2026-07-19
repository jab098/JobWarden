"use server";

import { onboardingPaths, onboardingSteps } from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import {
  createJobFiltersQueryString,
  parseJobFilters,
} from "@/lib/jobs/filters";
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

  let filters;
  try {
    // Writes the search profile, digest preference, and Explore choice, then
    // asks the database to complete. The database refuses unless every step of
    // the chosen path is recorded, so finishing cannot be forced from here.
    ({ filters } = await (await getOnboardingRepository()).finish());
  } catch (error) {
    return mapError(error);
  }

  revalidatePath("/", "layout");
  // Land on the search with the chosen preferences applied and visible in the
  // address bar, so any one of them is a click from being lifted. The scored
  // feed the profile now drives is one link away in the header.
  //
  // This used to point at the combined page, where an enabled search profile —
  // which finishing had just created — made it render the scored view instead.
  // The parameters sat in the address bar applying nothing at all.
  redirect(
    `/jobs?${createJobFiltersQueryString(
      parseJobFilters({
        location: filters.location,
        employment: filters.employment,
        workingTime: filters.workingTime,
        workplace: filters.workplace,
        ir35: filters.ir35,
        compensation: filters.compensation,
      }),
    )}`,
  );
}
