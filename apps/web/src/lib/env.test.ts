import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./env";

const validPublicEnv = {
  NEXT_PUBLIC_SITE_URL: "https://jobwarden.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"a".repeat(32)}`,
};

describe("public environment", () => {
  it("accepts only the configured public Supabase and site values", () => {
    expect(
      parsePublicEnv({
        ...validPublicEnv,
        SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"b".repeat(32)}`,
      }),
    ).toEqual(validPublicEnv);
  });

  it("rejects a secret key in the browser publishable-key slot", () => {
    expect(() =>
      parsePublicEnv({
        ...validPublicEnv,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${"b".repeat(32)}`,
      }),
    ).toThrow(/publishable/i);
  });

  it("requires an absolute configured site origin", () => {
    expect(() =>
      parsePublicEnv({
        ...validPublicEnv,
        NEXT_PUBLIC_SITE_URL: "/relative",
      }),
    ).toThrow();
  });

  it.each([
    "ftp://jobwarden.example",
    "https://user:password@jobwarden.example",
    "https://jobwarden.example/private",
    "https://jobwarden.example?preview=true",
    "https://jobwarden.example#fragment",
  ])(
    "rejects a site URL that is not an exact HTTP(S) origin: %s",
    (siteUrl) => {
      expect(() =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_SITE_URL: siteUrl,
        }),
      ).toThrow(/origin/i);
    },
  );

  it("normalises an origin-only URL", () => {
    expect(
      parsePublicEnv({
        ...validPublicEnv,
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000/",
      }).NEXT_PUBLIC_SITE_URL,
    ).toBe("http://localhost:3000");
  });
});
