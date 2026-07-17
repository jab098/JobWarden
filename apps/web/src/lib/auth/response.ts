import { NextResponse } from "next/server";

export const AUTH_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function createNoStoreAuthRedirect(
  destination: string,
  siteOrigin: string,
) {
  const response = NextResponse.redirect(new URL(destination, siteOrigin));

  Object.entries(AUTH_NO_STORE_HEADERS).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
}
