"use server";

import {
  careerProfileDraftSchema,
  namedSearchProfileDraftSchema,
} from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
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
    await (await getProfileRepository()).saveDraft(draft);
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

export async function saveSearchProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!(await trusted())) return forbidden;
  try {
    const search = namedSearchProfileDraftSchema.parse(
      parseJson(value(formData, "search")),
    );
    await (await getProfileRepository()).saveSearch(search);
    revalidatePath("/profile");
    return { kind: "success", message: "Named search saved." };
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
