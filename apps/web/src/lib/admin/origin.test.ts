import { describe, expect, it } from "vitest";

import { isTrustedMutationOrigin } from "./origin";

const trusted = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};

describe("administrator mutation origin", () => {
  it("accepts an exact configured origin and host", () => {
    expect(isTrustedMutationOrigin(trusted)).toBe(true);
  });

  it("normalises standard ports", () => {
    expect(
      isTrustedMutationOrigin({
        ...trusted,
        requestOrigin: "https://jobwarden.example:443",
        requestHost: "jobwarden.example:443",
        siteOrigin: "https://jobwarden.example",
      }),
    ).toBe(true);
  });

  it.each([
    ["missing origin", { requestOrigin: null }],
    ["opaque origin", { requestOrigin: "null" }],
    ["scheme mismatch", { requestOrigin: "http://jobwarden.example" }],
    ["suffix host", { requestHost: "jobwarden.example.attacker.test" }],
    [
      "origin suffix",
      { requestOrigin: "https://jobwarden.example.attacker.test" },
    ],
    ["user info", { requestOrigin: "https://user@jobwarden.example" }],
    ["comma host", { forwardedHost: "jobwarden.example, attacker.test" }],
    ["multiple protocols", { forwardedProto: "https,http" }],
    ["wrong forwarded host", { forwardedHost: "attacker.test" }],
    ["wrong forwarded protocol", { forwardedProto: "http" }],
    ["control character", { requestHost: "jobwarden.example\nattacker.test" }],
    ["host disagreement", { requestHost: "internal.example" }],
  ])("rejects %s", (_label, override) => {
    expect(isTrustedMutationOrigin({ ...trusted, ...override })).toBe(false);
  });
});
