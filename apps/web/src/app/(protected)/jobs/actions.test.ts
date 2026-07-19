// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getTargetFeedRepository: vi.fn(),
  getJobsMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/target-feed/get-repository", () => ({
  getTargetFeedRepository: mocks.getTargetFeedRepository,
}));
vi.mock("./action-context", () => ({
  getJobsMutationContext: mocks.getJobsMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { decideJobAction } from "./actions";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const jobId = "10000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("job decision server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getJobsMutationContext.mockResolvedValue(trustedContext);
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getJobsMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      decideJobAction({ kind: "idle" }, form({ jobId, decision: "saved" })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getTargetFeedRepository).not.toHaveBeenCalled();
  });

  it("rejects an unknown decision value without calling the repository", async () => {
    await expect(
      decideJobAction({ kind: "idle" }, form({ jobId, decision: "archived" })),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(mocks.getTargetFeedRepository).not.toHaveBeenCalled();
  });

  it("rejects a malformed job id without calling the repository", async () => {
    await expect(
      decideJobAction(
        { kind: "idle" },
        form({ jobId: "not-a-uuid", decision: "saved" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(mocks.getTargetFeedRepository).not.toHaveBeenCalled();
  });

  it("calls the repository with the validated job id and decision", async () => {
    const decide = vi.fn(async () => undefined);
    mocks.getTargetFeedRepository.mockResolvedValue({ decide });

    await expect(
      decideJobAction(
        { kind: "idle" },
        form({ jobId, decision: "considering" }),
      ),
    ).resolves.toMatchObject({ kind: "success" });

    expect(decide).toHaveBeenCalledWith(jobId, "considering");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs");
  });

  it("allows the clear decision through the same boundary", async () => {
    const decide = vi.fn(async () => undefined);
    mocks.getTargetFeedRepository.mockResolvedValue({ decide });

    await decideJobAction({ kind: "idle" }, form({ jobId, decision: "clear" }));

    expect(decide).toHaveBeenCalledWith(jobId, "clear");
  });

  it("maps repository failures to an unavailable state", async () => {
    mocks.getTargetFeedRepository.mockResolvedValue({
      decide: vi.fn(async () => {
        throw new Error("Unable to update job decision");
      }),
    });

    await expect(
      decideJobAction({ kind: "idle" }, form({ jobId, decision: "saved" })),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });
});
