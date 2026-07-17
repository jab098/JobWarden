import "server-only";

import { headers } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { MutationContext } from "@/lib/admin/repository";

export async function getAdminMutationContext(): Promise<MutationContext> {
  const requestHeaders = await headers();

  return {
    requestOrigin: requestHeaders.get("origin"),
    requestHost: requestHeaders.get("host"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    siteOrigin: getPublicEnv().NEXT_PUBLIC_SITE_URL,
  };
}
