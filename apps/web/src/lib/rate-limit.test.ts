// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withinRateLimit } from "./rate-limit";

describe("withinRateLimit", () => {
  it("allows and forwards the bucket and window when under the limit", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    expect(await withinRateLimit(client, "profile_export", 10, 60)).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      bucket_name: "profile_export",
      max_per_window: 10,
      window_seconds: 60,
    });
  });

  it("blocks when the RPC reports the limit is exceeded", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    expect(await withinRateLimit(client, "b", 10, 60)).toBe(false);
  });

  it("fails open when the RPC returns an error", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }),
    };
    expect(await withinRateLimit(client, "b", 10, 60)).toBe(true);
  });

  it("fails open when the RPC throws", async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("database down")),
    };
    expect(await withinRateLimit(client, "b", 10, 60)).toBe(true);
  });
});
