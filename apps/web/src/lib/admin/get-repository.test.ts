// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { getAdminRepository } from "./get-repository";

describe("production administrator repository factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("always uses the caller-bound Supabase client even when job fixtures are enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "true");

    await expect(getAdminRepository()).resolves.toBeDefined();
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith();
  });
});
