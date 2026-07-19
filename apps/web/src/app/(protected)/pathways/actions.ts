"use server";

import { normalizedConceptSchema } from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { PreviewExploreUnavailableError } from "@/lib/explore/development-explore";
import { getExploreRepository } from "@/lib/explore/get-repository";
import { PathwayNotSuggestedError } from "@/lib/explore/supabase-explore";
import type { ExploreActionState } from "@/lib/explore/types";

import { getExploreMutationContext } from "./action-context";

const enabledSchema = z.object({ enabled: z.enum(["true", "false"]) }).strict();
const decisionSchema = z
  .object({
    pathwayConcept: normalizedConceptSchema,
    decision: z.enum(["dismissed", "clear"]),
  })
  .strict();
const promoteSchema = z
  .object({ pathwayConcept: normalizedConceptSchema })
  .strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

const forbidden: ExploreActionState = {
  kind: "forbidden",
  message: "This explore change could not be verified.",
};
const invalid: ExploreActionState = {
  kind: "invalid",
  message: "Check the explore request and try again.",
};
const notSuggested: ExploreActionState = {
  kind: "invalid",
  message: "This pathway is no longer suggested, so it cannot be promoted.",
};
const unavailablePreview: ExploreActionState = {
  kind: "unavailable",
  message: "Explore changes are unavailable in this preview.",
};
const unavailableGeneric: ExploreActionState = {
  kind: "unavailable",
  message: "This explore change could not be saved. Try again.",
};

function mapError(error: unknown): ExploreActionState {
  if (error instanceof z.ZodError) return invalid;
  if (error instanceof PathwayNotSuggestedError) return notSuggested;
  if (error instanceof PreviewExploreUnavailableError)
    return unavailablePreview;
  return unavailableGeneric;
}

export async function setExploreEnabledAction(
  _previousState: ExploreActionState,
  formData: FormData,
): Promise<ExploreActionState> {
  if (!isTrustedMutationOrigin(await getExploreMutationContext())) {
    return forbidden;
  }

  const parsed = enabledSchema.safeParse({
    enabled: value(formData, "enabled"),
  });
  if (!parsed.success) return invalid;
  const enabled = parsed.data.enabled === "true";

  try {
    await (await getExploreRepository()).setEnabled(enabled);
    revalidatePath("/pathways");
    return {
      kind: "success",
      message: enabled ? "Explore is on." : "Explore is off.",
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function decidePathwayAction(
  _previousState: ExploreActionState,
  formData: FormData,
): Promise<ExploreActionState> {
  if (!isTrustedMutationOrigin(await getExploreMutationContext())) {
    return forbidden;
  }

  const parsed = decisionSchema.safeParse({
    pathwayConcept: value(formData, "pathwayConcept"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return invalid;

  try {
    await (
      await getExploreRepository()
    ).decide(parsed.data.pathwayConcept, parsed.data.decision);
    revalidatePath("/pathways");
    return {
      kind: "success",
      message:
        parsed.data.decision === "dismissed"
          ? "Pathway dismissed."
          : "Pathway restored.",
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function promotePathwayAction(
  _previousState: ExploreActionState,
  formData: FormData,
): Promise<ExploreActionState> {
  if (!isTrustedMutationOrigin(await getExploreMutationContext())) {
    return forbidden;
  }

  const parsed = promoteSchema.safeParse({
    pathwayConcept: value(formData, "pathwayConcept"),
  });
  if (!parsed.success) return invalid;

  try {
    await (await getExploreRepository()).promote(parsed.data.pathwayConcept);
    revalidatePath("/pathways");
    revalidatePath("/matches");
    revalidatePath("/profile");
    return {
      kind: "success",
      message:
        "Promoted to an enabled search profile. Review it in your career profile.",
    };
  } catch (error) {
    return mapError(error);
  }
}
