// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDevelopmentExploreRepository,
  PreviewExploreUnavailableError,
} from "./development-explore";

describe("development explore repository", () => {
  it("serves fictional suggestions with explore enabled", async () => {
    const result = await createDevelopmentExploreRepository().getExplore();

    expect(result.dataMode).toBe("fixtures");
    expect(result.enabled).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    const first = result.items[0];
    expect(first?.suggestion.pathway.label).toBe(
      "Product analytics implementation",
    );
    expect(first?.suggestion.overlapPercent).toBeGreaterThanOrEqual(70);
    expect(first?.decision).toBeNull();
    expect(result.dismissed).toEqual([]);
  });

  it("never suggests the user's active target role families", async () => {
    const result = await createDevelopmentExploreRepository().getExplore();

    for (const item of result.items) {
      expect(item.suggestion.pathway.normalizedConcept).not.toBe(
        "analytics implementation consulting",
      );
    }
  });

  it("rejects every mutation in the fictional preview", async () => {
    const repository = createDevelopmentExploreRepository();

    await expect(repository.setEnabled(false)).rejects.toBeInstanceOf(
      PreviewExploreUnavailableError,
    );
    await expect(
      repository.decide("product analytics implementation", "dismissed"),
    ).rejects.toBeInstanceOf(PreviewExploreUnavailableError);
    await expect(
      repository.promote("product analytics implementation"),
    ).rejects.toBeInstanceOf(PreviewExploreUnavailableError);
  });
});
