import "server-only";

import { headers } from "next/headers";

import type { MutationOriginInput } from "@/lib/admin/origin";
import { getPublicEnv } from "@/lib/env";

export async function getOnboardingMutationContext(): Promise<MutationOriginInput> {
  const requestHeaders = await headers();
  return {
    requestOrigin: requestHeaders.get("origin"),
    requestHost: requestHeaders.get("host"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    siteOrigin: getPublicEnv().NEXT_PUBLIC_SITE_URL,
  };
}
