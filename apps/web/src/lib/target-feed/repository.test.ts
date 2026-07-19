// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTargetFeedRepository } from "./repository";
import type { TargetFeedRepository } from "./repository";

const fixtureRepository: TargetFeedRepository = {
  getFeed: vi.fn(async () => ({
    items: [],
    enabledProfileNames: [],
    candidateCap: 200 as const,
    dataMode: "fixtures" as const,
  })),
  decide: vi.fn(async () => undefined),
};

describe("target-feed repository factory gating", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses fictional fixtures only in the exact development bypass", () => {
    const createSupabaseRepository = vi.fn();

    const repository = createTargetFeedRepository(
      { nodeEnv: "development", bypassFlag: "true" },
      createSupabaseRepository,
    );

    expect(createSupabaseRepository).not.toHaveBeenCalled();
    expect(repository).not.toBe(fixtureRepository);
  });

  it("delegates to the injected Supabase repository outside the bypass", () => {
    const createSupabaseRepository = vi.fn(() => fixtureRepository);

    const repository = createTargetFeedRepository(
      { nodeEnv: "production", bypassFlag: "false" },
      createSupabaseRepository,
    );

    expect(createSupabaseRepository).toHaveBeenCalledOnce();
    expect(repository).toBe(fixtureRepository);
  });

  it("fails closed when the bypass is requested outside development", () => {
    const createSupabaseRepository = vi.fn();

    expect(() =>
      createTargetFeedRepository(
        { nodeEnv: "test", bypassFlag: "true" },
        createSupabaseRepository,
      ),
    ).toThrow("Development access bypass is forbidden");
    expect(createSupabaseRepository).not.toHaveBeenCalled();
  });
});
