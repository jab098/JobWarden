import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "./redirects";

const siteOrigin = "https://jobwarden.example";

describe("OAuth callback redirects", () => {
  it.each(["/jobs", "/jobs?employment=contract", "/admin/access"])(
    "allows the internal path %s",
    (path) => {
      expect(getSafeRedirectPath(path, siteOrigin)).toBe(path);
    },
  );

  it.each([
    null,
    "",
    "jobs",
    "//attacker.example/path",
    "https://attacker.example/path",
    "/\\attacker.example/path",
    "/jobs\nSet-Cookie: stolen",
    "/jobs\u0000hidden",
    "/jobs\u0085hidden",
    "/%2Fattacker.example",
    "/%252Fattacker.example",
    "/%25252Fattacker.example",
    "/%5Cattacker.example",
    "/%255Cattacker.example",
    "/jobs%00hidden",
    "/jobs%C2%85hidden",
    "/jobs%E0%A4%A",
  ])("falls back for the unsafe target %s", (path) => {
    expect(getSafeRedirectPath(path, siteOrigin)).toBe("/jobs");
  });

  it("resolves against the configured origin and enforces the same origin", () => {
    expect(
      getSafeRedirectPath("https://attacker.example/jobs", siteOrigin),
    ).toBe("/jobs");
    expect(getSafeRedirectPath("/admin?tab=access#pending", siteOrigin)).toBe(
      "/admin?tab=access#pending",
    );
  });
});
