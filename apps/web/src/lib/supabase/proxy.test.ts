// @vitest-environment node

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { refreshSession, type ServerClientFactory } from "./proxy";

describe("Supabase session refresh proxy", () => {
  it("propagates refresh headers and complete supported cookie options without authorising routes", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null });
    const factory: ServerClientFactory = (_url, _key, options) => {
      options.cookies.setAll(
        [
          {
            name: "sb-session",
            value: "refreshed",
            options: {
              domain: "jobwarden.example",
              httpOnly: true,
              maxAge: 3600,
              partitioned: true,
              path: "/",
              priority: "high",
              sameSite: "none",
              secure: true,
            },
          },
          {
            name: "sb-expiring",
            value: "short-lived",
            options: {
              expires: new Date("2030-01-01T00:00:00.000Z"),
            },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        },
      );

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
    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-session")?.priority).toBe("high");
    expect(response.cookies.get("sb-session")?.partitioned).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(
      "Domain=jobwarden.example",
    );
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Tue, 01 Jan 2030 00:00:00 GMT",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=3600");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=none");
    expect(response.headers.get("set-cookie")).toContain("Partitioned");
    expect(response.headers.get("set-cookie")).toContain("Priority=high");
  });
});
