import { getSafeRedirectPath } from "./redirects";

export type OAuthClient = {
  auth: {
    signInWithOAuth(input: {
      provider: "google";
      options: { redirectTo: string };
    }): Promise<{
      data: { url: string | null };
      error: unknown;
    }>;
    exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
  };
};

export async function startGoogleOAuth(
  client: OAuthClient,
  siteOrigin: string,
): Promise<{ kind: "redirect"; destination: string } | { kind: "error" }> {
  const callbackUrl = new URL("/auth/callback", siteOrigin);
  callbackUrl.searchParams.set("next", "/jobs");

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data.url) {
    return { kind: "error" };
  }

  return { kind: "redirect", destination: data.url };
}

export async function completeOAuthCallback(
  client: OAuthClient,
  code: string | null,
  next: string | null,
): Promise<{ kind: "redirect"; destination: string } | { kind: "error" }> {
  if (!code) {
    return { kind: "error" };
  }

  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    return { kind: "error" };
  }

  return { kind: "redirect", destination: getSafeRedirectPath(next) };
}
