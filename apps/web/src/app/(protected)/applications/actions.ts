"use server";

import { applicationStages } from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { PreviewApplicationsUnavailableError } from "@/lib/applications/development-applications";
import { getApplicationsRepository } from "@/lib/applications/get-repository";
import type { ApplicationsActionState } from "@/lib/applications/types";

import { getApplicationsMutationContext } from "./action-context";

const trackSchema = z.object({ jobId: z.string().uuid() }).strict();
const transitionSchema = z
  .object({
    applicationId: z.string().uuid(),
    stage: z.enum(applicationStages),
  })
  .strict();
const planSchema = z
  .object({
    applicationId: z.string().uuid(),
    nextAction: z.string().trim().max(200),
    nextActionDueOn: z.union([z.iso.date(), z.literal("")]),
    notes: z.string().trim().max(2_000),
  })
  .strict();
const deleteSchema = z.object({ applicationId: z.string().uuid() }).strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

const forbidden: ApplicationsActionState = {
  kind: "forbidden",
  message: "This application change could not be verified.",
};
const invalid: ApplicationsActionState = {
  kind: "invalid",
  message: "Check the application change and try again.",
};
const unavailablePreview: ApplicationsActionState = {
  kind: "unavailable",
  message: "Application changes are unavailable in this preview.",
};
const unavailableGeneric: ApplicationsActionState = {
  kind: "unavailable",
  message: "This application change could not be saved. Try again.",
};

function mapError(error: unknown): ApplicationsActionState {
  if (error instanceof z.ZodError) return invalid;
  if (error instanceof PreviewApplicationsUnavailableError) {
    return unavailablePreview;
  }
  return unavailableGeneric;
}

function revalidateApplicationSurfaces(): void {
  revalidatePath("/applications");
  // Job detail pages show whether the job is already tracked.
  revalidatePath("/jobs/[jobId]", "page");
}

export async function trackApplicationAction(
  _previousState: ApplicationsActionState,
  formData: FormData,
): Promise<ApplicationsActionState> {
  if (!isTrustedMutationOrigin(await getApplicationsMutationContext())) {
    return forbidden;
  }

  const parsed = trackSchema.safeParse({ jobId: value(formData, "jobId") });
  if (!parsed.success) return invalid;

  try {
    await (await getApplicationsRepository()).track(parsed.data.jobId);
    revalidateApplicationSurfaces();
    return {
      kind: "success",
      message: "Application tracked. Manage it under Applications.",
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function transitionApplicationAction(
  _previousState: ApplicationsActionState,
  formData: FormData,
): Promise<ApplicationsActionState> {
  if (!isTrustedMutationOrigin(await getApplicationsMutationContext())) {
    return forbidden;
  }

  const parsed = transitionSchema.safeParse({
    applicationId: value(formData, "applicationId"),
    stage: value(formData, "stage"),
  });
  if (!parsed.success) return invalid;

  try {
    await (
      await getApplicationsRepository()
    ).transition(parsed.data.applicationId, parsed.data.stage);
    revalidateApplicationSurfaces();
    return { kind: "success", message: "Stage updated." };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateApplicationPlanAction(
  _previousState: ApplicationsActionState,
  formData: FormData,
): Promise<ApplicationsActionState> {
  if (!isTrustedMutationOrigin(await getApplicationsMutationContext())) {
    return forbidden;
  }

  const parsed = planSchema.safeParse({
    applicationId: value(formData, "applicationId"),
    nextAction: value(formData, "nextAction"),
    nextActionDueOn: value(formData, "nextActionDueOn"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) return invalid;

  try {
    await (
      await getApplicationsRepository()
    ).updatePlan(parsed.data.applicationId, {
      nextAction: parsed.data.nextAction || null,
      nextActionDueOn: parsed.data.nextActionDueOn || null,
      notes: parsed.data.notes || null,
    });
    revalidateApplicationSurfaces();
    return { kind: "success", message: "Next action saved." };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteApplicationAction(
  _previousState: ApplicationsActionState,
  formData: FormData,
): Promise<ApplicationsActionState> {
  if (!isTrustedMutationOrigin(await getApplicationsMutationContext())) {
    return forbidden;
  }

  const parsed = deleteSchema.safeParse({
    applicationId: value(formData, "applicationId"),
  });
  if (!parsed.success) return invalid;

  try {
    await (await getApplicationsRepository()).remove(parsed.data.applicationId);
    revalidateApplicationSurfaces();
    return { kind: "success", message: "Application deleted." };
  } catch (error) {
    return mapError(error);
  }
}
