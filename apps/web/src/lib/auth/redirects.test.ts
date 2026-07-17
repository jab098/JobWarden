import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "./redirects";

describe("OAuth callback redirects", () => {
  it.each(["/jobs", "/jobs?employment=contract", "/admin/access"])(
    "allows the internal path %s",
    (path) => {
      expect(getSafeRedirectPath(path)).toBe(path);
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
  ])("falls back for the unsafe target %s", (path) => {
    expect(getSafeRedirectPath(path)).toBe("/jobs");
  });
});
