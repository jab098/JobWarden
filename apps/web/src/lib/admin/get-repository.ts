import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AdminRepository } from "./repository";
import { createSupabaseAdminRepository } from "./supabase-admin-repository";

export async function getAdminRepository(): Promise<AdminRepository> {
  return createSupabaseAdminRepository(await createClient());
}
