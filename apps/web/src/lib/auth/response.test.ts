// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createNoStoreAuthRedirect } from "./response";

describe("authentication redirect responses", () => {
  it("prevents the OAuth callback response from being cached", () => {
    const response = createNoStoreAuthRedirect(
      "/jobs",
      "https://jobwarden.example",
    );

    expect(response.headers.get("location")).toBe(
      "https://jobwarden.example/jobs",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
