import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { PublicEnv } from "@/lib/env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export type ServerClientFactory = (
  url: string,
  key: string,
  options: {
    cookies: {
      getAll(): { name: string; value: string }[];
      setAll(cookies: CookieToSet[]): void;
    };
  },
) => { auth: { getClaims(): Promise<unknown> } };

export async function refreshSession(
  request: NextRequest,
  env: PublicEnv,
  factory: ServerClientFactory = createServerClient as unknown as ServerClientFactory,
) {
  let response = NextResponse.next({ request });
  const client = factory(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            const sameSite =
              options.sameSite === true
                ? "strict"
                : options.sameSite === false
                  ? undefined
                  : options.sameSite;

            response.cookies.set(name, value, {
              domain: options.domain,
              expires: options.expires,
              httpOnly: options.httpOnly,
              maxAge: options.maxAge,
              partitioned: options.partitioned,
              path: options.path,
              sameSite,
              secure: options.secure,
            });
          });
        },
      },
    },
  );

  // Refresh cookies only. Layouts, actions, and RLS enforce access.
  await client.auth.getClaims();

  return response;
}
