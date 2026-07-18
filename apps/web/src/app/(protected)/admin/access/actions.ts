"use server";

import { revalidatePath } from "next/cache";

import { getAdminMutationContext } from "../action-context";
import {
  decideAccessRequest,
  changeAccessRequestSetting,
} from "@/lib/admin/repository";
import { getAdminRepository } from "@/lib/admin/get-repository";
import type { AdminActionState } from "@/lib/admin/types";

export async function decideAccessAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await decideAccessRequest(
    await getAdminRepository(),
    await getAdminMutationContext(),
    formData,
  );
  if (result.kind === "success") revalidatePath("/admin/access");
  return result;
}

export async function setAccessRequestsEnabledAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await changeAccessRequestSetting(
    await getAdminRepository(),
    await getAdminMutationContext(),
    formData,
  );
  if (result.kind === "success") revalidatePath("/admin/access");
  return result;
}
