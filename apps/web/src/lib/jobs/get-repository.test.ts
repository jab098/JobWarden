// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { getJobsRepository } from "./get-repository";

describe("server jobs repository selector", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not construct a Supabase client in development fixture mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "true");

    const repository = await getJobsRepository();

    expect(createClient).not.toHaveBeenCalled();
    await expect(
      repository.list({
        q: "",
        employment: "all",
        workingTime: "all",
        workplace: "all",
        ir35: "all",
        compensation: "all",
        page: 1,
      }),
    ).resolves.toMatchObject({ dataMode: "fixtures" });
  });

  it("uses only the cookie-bound server client in normal mode", async () => {
    const cookieClient = { from: vi.fn() };
    createClient.mockResolvedValue(cookieClient);

    await expect(getJobsRepository()).resolves.toBeDefined();

    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith();
  });
});
