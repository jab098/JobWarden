// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveDevelopmentAccessMode } from "./access-mode";

describe("development access mode", () => {
  it.each([undefined, "", "false"])(
    "stays disabled in development when the bypass flag is %s",
    (bypassFlag) => {
      expect(
        resolveDevelopmentAccessMode({
          nodeEnv: "development",
          bypassFlag,
        }),
      ).toEqual({ enabled: false });
    },
  );

  it("enables fixture data only for the exact true flag in development", () => {
    expect(
      resolveDevelopmentAccessMode({
        nodeEnv: "development",
        bypassFlag: "true",
      }),
    ).toEqual({ enabled: true, dataMode: "fixtures" });
  });

  it.each(["production", "test", undefined])(
    "fails closed when the exact bypass flag is set in %s",
    (nodeEnv) => {
      expect(() =>
        resolveDevelopmentAccessMode({
          nodeEnv,
          bypassFlag: "true",
        }),
      ).toThrow(
        "Development access bypass is forbidden outside local development",
      );
    },
  );

  it.each(["TRUE", " true", "true "])(
    "does not normalise the bypass flag %j",
    (bypassFlag) => {
      expect(
        resolveDevelopmentAccessMode({
          nodeEnv: "development",
          bypassFlag,
        }),
      ).toEqual({ enabled: false });
    },
  );
});
