"use server";

import { revalidatePath } from "next/cache";

import { getAdminMutationContext } from "../action-context";
import { getAdminRepository } from "@/lib/admin/get-repository";
import {
  queueAllSourceIngestion,
  queueSourceIngestion,
} from "@/lib/admin/repository";
import type { AdminActionState } from "@/lib/admin/types";

export async function requestIngestionAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await queueSourceIngestion(
    await getAdminRepository(),
    await getAdminMutationContext(),
    formData,
  );
  if (result.kind === "success") revalidatePath("/admin/ingestion");
  return result;
}

export async function requestAllIngestionAction(
  _previousState: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  const result = await queueAllSourceIngestion(
    await getAdminRepository(),
    await getAdminMutationContext(),
  );
  if (result.kind === "success") revalidatePath("/admin/ingestion");
  return result;
}
