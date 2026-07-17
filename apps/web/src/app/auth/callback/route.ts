import { NextResponse, type NextRequest } from "next/server";

import { completeOAuthCallback } from "@/lib/auth/oauth";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const env = getPublicEnv();
  const client = await createClient();
  const result = await completeOAuthCallback(
    client,
    request.nextUrl.searchParams.get("code"),
    request.nextUrl.searchParams.get("next"),
  );
  const destination =
    result.kind === "redirect"
      ? result.destination
      : "/auth/sign-in?error=callback_failed";

  return NextResponse.redirect(new URL(destination, env.NEXT_PUBLIC_SITE_URL));
}
