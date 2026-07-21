"use server";

import { revalidatePath } from "next/cache";

import { getAdminMutationContext } from "../action-context";
import { markEarlyAccessInvited } from "@/lib/admin/repository";
import { getAdminRepository } from "@/lib/admin/get-repository";
import type { AdminActionState } from "@/lib/admin/types";

export async function markEarlyAccessInvitedAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await markEarlyAccessInvited(
    await getAdminRepository(),
    await getAdminMutationContext(),
    formData,
  );
  if (result.kind === "success") revalidatePath("/admin/early-access");
  return result;
}
