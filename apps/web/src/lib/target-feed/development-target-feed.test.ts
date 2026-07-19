// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDevelopmentTargetFeedRepository } from "./development-target-feed";

describe("fictional development target-feed repository", () => {
  it("routes fictional fixtures through the real domain scorer deterministically", async () => {
    const repository = createDevelopmentTargetFeedRepository();

    const first = await repository.getFeed({ includeDismissed: false });
    const second = await repository.getFeed({ includeDismissed: false });

    expect(first).toEqual(second);
    expect(first.dataMode).toBe("fixtures");
    expect(first.candidateCap).toBe(200);
    expect(first.enabledProfileNames).toEqual(["Implementation leadership"]);
    for (const item of first.items) {
      expect(item.explanation.score).toBeGreaterThanOrEqual(0);
      expect(item.explanation.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(item.explanation.score)).toBe(true);
    }
  });

  it("rejects decisions as read-only in the fictional preview", async () => {
    const repository = createDevelopmentTargetFeedRepository();

    await expect(
      repository.decide("00000000-0000-4000-8000-000000000001", "saved"),
    ).rejects.toThrow();
  });
});
