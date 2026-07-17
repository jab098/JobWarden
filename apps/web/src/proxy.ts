import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { getPublicEnv } from "@/lib/env";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return NextResponse.next();

  return refreshSession(request, getPublicEnv());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
