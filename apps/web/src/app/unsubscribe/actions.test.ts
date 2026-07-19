// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getUnsubscribeRepository: vi.fn(),
  getUnsubscribeMutationContext: vi.fn(),
}));
vi.mock("@/lib/notifications/get-repository", () => ({
  getUnsubscribeRepository: mocks.getUnsubscribeRepository,
}));
vi.mock("./action-context", () => ({
  getUnsubscribeMutationContext: mocks.getUnsubscribeMutationContext,
}));

import { unsubscribeAction } from "./actions";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const token = "40000000-0000-4000-8000-000000000001";
const settledMessage =
  "If that link was still active, digest emails are now off for that account.";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("unsubscribe server action", () => {
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUnsubscribeMutationContext.mockResolvedValue(trustedContext);
    unsubscribe.mockResolvedValue(undefined);
    mocks.getUnsubscribeRepository.mockResolvedValue({ unsubscribe });
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getUnsubscribeMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      unsubscribeAction({ kind: "idle" }, form({ token })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getUnsubscribeRepository).not.toHaveBeenCalled();
  });

  it("passes a valid token to the repository", async () => {
    await expect(
      unsubscribeAction({ kind: "idle" }, form({ token })),
    ).resolves.toEqual({ kind: "success", message: settledMessage });
    expect(unsubscribe).toHaveBeenCalledWith(token);
  });

  it.each([
    ["a malformed token", "not-a-token"],
    ["an empty token", ""],
  ])("reports the same outcome for %s", async (_label, value) => {
    await expect(
      unsubscribeAction({ kind: "idle" }, form({ token: value })),
    ).resolves.toEqual({ kind: "success", message: settledMessage });
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("reports the same outcome for a token that matched nothing", async () => {
    // The database reports no match by returning false, not by raising, so a
    // valid-looking unknown token is indistinguishable from a real one.
    await expect(
      unsubscribeAction(
        { kind: "idle" },
        form({ token: "40000000-0000-4000-8000-0000000000ff" }),
      ),
    ).resolves.toEqual({ kind: "success", message: settledMessage });
  });

  it("reports an unavailable database without claiming success", async () => {
    unsubscribe.mockRejectedValue(new Error("database unavailable"));

    await expect(
      unsubscribeAction({ kind: "idle" }, form({ token })),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("does not leak the underlying failure", async () => {
    unsubscribe.mockRejectedValue(new Error("connection to 10.0.0.5 refused"));

    const result = await unsubscribeAction({ kind: "idle" }, form({ token }));

    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
  });
});
