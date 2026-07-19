"use server";

import {
  careerProfileDraftSchema,
  namedSearchProfileDraftSchema,
} from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { PreviewNotificationsUnavailableError } from "@/lib/notifications/development-notifications";
import { getNotificationsRepository } from "@/lib/notifications/get-repository";
import type { NotificationsActionState } from "@/lib/notifications/types";
import { getProfileRepository } from "@/lib/profile/get-repository";
import { ProfileRepositoryError } from "@/lib/profile/repository";
import type { ProfileActionState } from "@/lib/profile/types";

import { getProfileMutationContext } from "./action-context";

const suggestionDecisionSchema = z
  .object({
    suggestionId: z.string().uuid(),
    decision: z.enum(["accepted", "rejected"]),
  })
  .strict();
const evidenceDecisionSchema = z
  .object({
    evidenceId: z.string().uuid(),
    decision: z.enum(["confirmed", "rejected"]),
  })
  .strict();
const generationSchema = z.coerce.number().int().nonnegative().safe();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function trusted(): Promise<boolean> {
  return isTrustedMutationOrigin(await getProfileMutationContext());
}

const forbidden: ProfileActionState = {
  kind: "forbidden",
  message: "This profile request could not be verified.",
};
const invalid: ProfileActionState = {
  kind: "invalid",
  message: "Check the profile details and try again.",
};
const unavailable: ProfileActionState = {
  kind: "unavailable",
  message: "Profile changes are unavailable in this preview.",
};

function mapError(error: unknown): ProfileActionState {
  if (error instanceof z.ZodError) return invalid;
  if (error instanceof ProfileRepositoryError && error.code === "invalid") {
    return invalid;
  }
  return unavailable;
}

export async function saveProfileDraftAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  try {
    const draft = careerProfileDraftSchema.parse(
      parseJson(value(formData, "draft")),
    );
    const generation = generationSchema.parse(
      value(formData, "profileGeneration"),
    );
    await (await getProfileRepository()).saveDraft(generation, draft);
    revalidatePath("/profile");
    return { kind: "success", message: "Career direction saved." };
  } catch (error) {
    return mapError(error);
  }
}

export async function decideSuggestionAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  const parsed = suggestionDecisionSchema.safeParse({
    suggestionId: value(formData, "suggestionId"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return invalid;
  try {
    const repository = await getProfileRepository();
    if (parsed.data.decision === "accepted") {
      await repository.acceptSuggestion(parsed.data.suggestionId);
    } else {
      await repository.rejectSuggestion(parsed.data.suggestionId);
    }
    revalidatePath("/profile");
    return { kind: "success", message: "Suggestion reviewed." };
  } catch (error) {
    return mapError(error);
  }
}

export async function decideEvidenceAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  const parsed = evidenceDecisionSchema.safeParse({
    evidenceId: value(formData, "evidenceId"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return invalid;
  try {
    const repository = await getProfileRepository();
    if (parsed.data.decision === "confirmed") {
      await repository.acceptEvidence(parsed.data.evidenceId);
    } else {
      await repository.rejectEvidence(parsed.data.evidenceId);
    }
    revalidatePath("/profile");
    return { kind: "success", message: "Evidence reviewed." };
  } catch (error) {
    return mapError(error);
  }
}

export async function saveSearchProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  try {
    const searchIdValue = value(formData, "searchId");
    const searchId = searchIdValue
      ? z.string().uuid().parse(searchIdValue)
      : null;
    const search = namedSearchProfileDraftSchema.parse(
      parseJson(value(formData, "search")),
    );
    const generation = generationSchema.parse(
      value(formData, "profileGeneration"),
    );
    const resourceId = await (
      await getProfileRepository()
    ).saveSearch(generation, searchId, search);
    revalidatePath("/profile");
    return { kind: "success", message: "Named search saved.", resourceId };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteCvAction(): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  try {
    await (await getProfileRepository()).deleteCv();
    revalidatePath("/profile");
    return { kind: "success", message: "CV and extracted evidence deleted." };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteProfileDataAction(): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  try {
    await (await getProfileRepository()).deleteProfileData();
    revalidatePath("/profile");
    return { kind: "success", message: "Career profile data deleted." };
  } catch (error) {
    return mapError(error);
  }
}

const channelSchema = z.object({ enabled: z.enum(["on", "off"]) }).strict();

export async function setNotificationChannelAction(
  _previousState: NotificationsActionState,
  formData: FormData,
): Promise<NotificationsActionState> {
  if (!(await trusted())) {
    return {
      kind: "forbidden",
      message: "This notification change could not be verified.",
    };
  }

  const parsed = channelSchema.safeParse({
    enabled: value(formData, "enabled"),
  });
  if (!parsed.success) {
    return {
      kind: "invalid",
      message: "Check the notification setting and try again.",
    };
  }

  try {
    await (
      await getNotificationsRepository()
    ).setChannelEnabled(parsed.data.enabled === "on");
    revalidatePath("/profile");
    return {
      kind: "success",
      message:
        parsed.data.enabled === "on"
          ? "Digest emails are on."
          : "Digest emails are off.",
    };
  } catch (error) {
    if (error instanceof PreviewNotificationsUnavailableError) {
      return {
        kind: "unavailable",
        message: "Notification changes are unavailable in this preview.",
      };
    }
    return {
      kind: "unavailable",
      message: "This notification change could not be saved. Try again.",
    };
  }
}
