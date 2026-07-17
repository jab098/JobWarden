// @vitest-environment node

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { refreshSession, type ServerClientFactory } from "./proxy";

describe("Supabase session refresh proxy", () => {
  it("refreshes claims and copies cookies without authorising routes", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null });
    const factory: ServerClientFactory = (_url, _key, options) => {
      options.cookies.setAll([
        {
          name: "sb-session",
          value: "refreshed",
          options: { httpOnly: true, sameSite: "lax" },
        },
      ]);

      return { auth: { getClaims } };
    };
    const request = new NextRequest("https://jobwarden.example/jobs");

    const response = await refreshSession(
      request,
      {
        NEXT_PUBLIC_SITE_URL: "https://jobwarden.example",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"a".repeat(32)}`,
      },
      factory,
    );

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });
});
