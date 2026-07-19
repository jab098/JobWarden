// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { getTargetFeedRepository } from "./get-repository";

describe("target-feed repository factory wiring", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("uses fictional fixtures only in the exact development bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "true");

    const result = await (
      await getTargetFeedRepository()
    ).getFeed({ includeDismissed: false });

    expect(result.dataMode).toBe("fixtures");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("uses the caller-bound Supabase client outside the bypass", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "false");
    createClient.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });

    await getTargetFeedRepository();

    expect(createClient).toHaveBeenCalledWith();
  });

  it("fails closed when the bypass is requested outside development", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "true");

    await expect(getTargetFeedRepository()).rejects.toThrow(
      "Development access bypass is forbidden",
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});
