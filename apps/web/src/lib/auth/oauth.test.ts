import { describe, expect, it, vi } from "vitest";

import {
  completeOAuthCallback,
  startGoogleOAuth,
  type OAuthClient,
} from "./oauth";

function oauthClient(options: {
  authorizationUrl?: string | null;
  signInError?: unknown;
  exchangeError?: unknown;
}): OAuthClient {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: options.authorizationUrl ?? null },
        error: options.signInError ?? null,
      }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: options.exchangeError ?? null,
      }),
    },
  };
}

describe("Google OAuth initiation", () => {
  it("uses Google PKCE with the configured site origin", async () => {
    const client = oauthClient({
      authorizationUrl: "https://project.supabase.co/auth/v1/authorize",
    });

    await expect(
      startGoogleOAuth(client, "https://jobwarden.example"),
    ).resolves.toEqual({
      kind: "redirect",
      destination: "https://project.supabase.co/auth/v1/authorize",
    });
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://jobwarden.example/auth/callback?next=%2Fmatches",
      },
    });
  });

  it("returns a generic error when the provider cannot start", async () => {
    const client = oauthClient({
      authorizationUrl: "https://provider.example/private-detail",
      signInError: new Error("provider payload with user@example.com"),
    });

    await expect(
      startGoogleOAuth(client, "https://jobwarden.example"),
    ).resolves.toEqual({ kind: "error" });
  });
});

describe("OAuth callback completion", () => {
  it("exchanges the one-time PKCE code and returns a safe destination", async () => {
    const client = oauthClient({});

    await expect(
      completeOAuthCallback(
        client,
        "one-time-code",
        "/admin/access",
        "https://jobwarden.example",
      ),
    ).resolves.toEqual({
      kind: "redirect",
      destination: "/admin/access",
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "one-time-code",
    );
  });

  it("falls back from a protocol-relative redirect after code exchange", async () => {
    await expect(
      completeOAuthCallback(
        oauthClient({}),
        "one-time-code",
        "//attacker.example",
        "https://jobwarden.example",
      ),
    ).resolves.toEqual({ kind: "redirect", destination: "/matches" });
  });

  it("returns the same generic error for missing and failed codes", async () => {
    await expect(
      completeOAuthCallback(
        oauthClient({}),
        null,
        "/jobs",
        "https://jobwarden.example",
      ),
    ).resolves.toEqual({ kind: "error" });
    await expect(
      completeOAuthCallback(
        oauthClient({ exchangeError: new Error("sensitive provider detail") }),
        "expired-code",
        "/jobs",
        "https://jobwarden.example",
      ),
    ).resolves.toEqual({ kind: "error" });
  });
});
