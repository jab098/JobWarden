"use server";

import { redirect } from "next/navigation";

import { getPublicEnv } from "@/lib/env";
import { startGoogleOAuth } from "@/lib/auth/oauth";
import { createClient } from "@/lib/supabase/server";

export async function signInWithGoogle() {
  const client = await createClient();
  const env = getPublicEnv();
  const result = await startGoogleOAuth(client, env.NEXT_PUBLIC_SITE_URL);

  redirect(
    result.kind === "redirect"
      ? result.destination
      : "/auth/sign-in?error=auth_unavailable",
  );
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();
  redirect("/");
}
