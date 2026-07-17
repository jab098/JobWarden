import type { NextRequest } from "next/server";

import { completeOAuthCallback } from "@/lib/auth/oauth";
import { createNoStoreAuthRedirect } from "@/lib/auth/response";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const env = getPublicEnv();
  const client = await createClient();
  const result = await completeOAuthCallback(
    client,
    request.nextUrl.searchParams.get("code"),
    request.nextUrl.searchParams.get("next"),
    env.NEXT_PUBLIC_SITE_URL,
  );
  const destination =
    result.kind === "redirect"
      ? result.destination
      : "/auth/sign-in?error=callback_failed";

  return createNoStoreAuthRedirect(destination, env.NEXT_PUBLIC_SITE_URL);
}
