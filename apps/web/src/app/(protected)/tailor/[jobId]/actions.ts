"use server";

import {
  buildTailoringReview,
  type TailoringOperation,
} from "@jobwarden/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isTrustedMutationOrigin } from "@/lib/admin/origin";
import { getTailoringRepository } from "@/lib/tailoring/get-repository";
import { PreviewTailoringUnavailableError } from "@/lib/tailoring/development-tailoring";
import type { TailoringActionState } from "@/lib/tailoring/types";

import { getTailoringMutationContext } from "./action-context";

const operationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("replace"),
      paragraphIndex: z.number().int().min(0).max(10_000),
      text: z.string().min(1).max(4_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("omit"),
      paragraphIndex: z.number().int().min(0).max(10_000),
    })
    .strict(),
]);

const saveSchema = z
  .object({
    jobId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    operations: z.array(operationSchema).max(500),
  })
  .strict();

const variantSchema = z.object({ variantId: z.string().uuid() }).strict();

function value(formData: FormData, key: string): string {
  const result = formData.get(key);
  return typeof result === "string" ? result : "";
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const forbidden: TailoringActionState = {
  kind: "forbidden",
  message: "This tailoring request could not be verified.",
};
const invalid: TailoringActionState = {
  kind: "invalid",
  message: "Check the proposed changes and try again.",
};

function mapError(error: unknown): TailoringActionState {
  if (error instanceof PreviewTailoringUnavailableError) {
    return {
      kind: "unavailable",
      message: "Tailoring changes are unavailable in this preview.",
    };
  }
  return {
    kind: "unavailable",
    message: "This tailoring change could not be saved. Try again.",
  };
}

export async function saveVariantAction(
  _previousState: TailoringActionState,
  formData: FormData,
): Promise<TailoringActionState> {
  if (!isTrustedMutationOrigin(await getTailoringMutationContext())) {
    return forbidden;
  }

  const parsed = saveSchema.safeParse({
    jobId: value(formData, "jobId"),
    name: value(formData, "name"),
    operations: parseJson(value(formData, "operations")),
  });
  if (!parsed.success) return invalid;

  try {
    const repository = await getTailoringRepository();

    // The server re-runs the evidence check over the workspace it loads itself.
    // A client that skipped or faked the review cannot store an unsupported
    // claim, because acceptance is decided here, not in the browser.
    const workspace = await repository.getWorkspace(parsed.data.jobId);
    const review = buildTailoringReview({
      paragraphs: workspace.paragraphs,
      operations: parsed.data.operations as TailoringOperation[],
      cvText: workspace.cvText,
      jobText: workspace.jobText,
    });
    if (review.rejectedCount > 0) {
      return {
        kind: "invalid",
        message:
          "Some changes are not supported by your CV or this advert. Revise them and try again.",
      };
    }

    const resourceId = await repository.saveVariant({
      jobId: parsed.data.jobId,
      name: parsed.data.name,
      operations: parsed.data.operations as TailoringOperation[],
    });
    revalidatePath(`/tailor/${parsed.data.jobId}`);
    return { kind: "success", message: "Draft saved.", resourceId };
  } catch (error) {
    return mapError(error);
  }
}

export async function promoteVariantAction(
  _previousState: TailoringActionState,
  formData: FormData,
): Promise<TailoringActionState> {
  if (!isTrustedMutationOrigin(await getTailoringMutationContext())) {
    return forbidden;
  }

  const parsed = variantSchema.safeParse({
    variantId: value(formData, "variantId"),
  });
  if (!parsed.success) return invalid;

  try {
    await (
      await getTailoringRepository()
    ).promoteVariant(parsed.data.variantId);
    revalidatePath("/tailor/[jobId]", "page");
    return {
      kind: "success",
      message: "Variant saved. It no longer expires.",
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteVariantAction(
  _previousState: TailoringActionState,
  formData: FormData,
): Promise<TailoringActionState> {
  if (!isTrustedMutationOrigin(await getTailoringMutationContext())) {
    return forbidden;
  }

  const parsed = variantSchema.safeParse({
    variantId: value(formData, "variantId"),
  });
  if (!parsed.success) return invalid;

  try {
    await (await getTailoringRepository()).deleteVariant(parsed.data.variantId);
    revalidatePath("/tailor/[jobId]", "page");
    return { kind: "success", message: "Variant deleted." };
  } catch (error) {
    return mapError(error);
  }
}
