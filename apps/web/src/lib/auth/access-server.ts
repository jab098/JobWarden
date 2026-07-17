import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  resolveAdminAccess,
  resolveProtectedAccess,
  type AccessRepository,
} from "./access";
import { createSupabaseAccessRepository } from "./supabase-access-repository";
import { createClient } from "@/lib/supabase/server";

async function getRepository(): Promise<AccessRepository> {
  return createSupabaseAccessRepository(await createClient());
}

export async function requireProtectedAccess(repository?: AccessRepository) {
  const result = await resolveProtectedAccess(
    repository ?? (await getRepository()),
  );

  if (result.kind === "redirect") redirect(result.destination);
  if (result.kind === "not-found") notFound();

  return result;
}

export async function requireAdmin(repository?: AccessRepository) {
  const result = await resolveAdminAccess(
    repository ?? (await getRepository()),
  );

  if (result.kind === "redirect") redirect(result.destination);
  if (result.kind === "not-found") notFound();

  return result;
}
