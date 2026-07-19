// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getApplicationsRepository: vi.fn(),
  getApplicationsMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/applications/get-repository", () => ({
  getApplicationsRepository: mocks.getApplicationsRepository,
}));
vi.mock("./action-context", () => ({
  getApplicationsMutationContext: mocks.getApplicationsMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  deleteApplicationAction,
  trackApplicationAction,
  transitionApplicationAction,
  updateApplicationPlanAction,
} from "./actions";
import { PreviewApplicationsUnavailableError } from "@/lib/applications/development-applications";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const jobId = "0d74a055-d0e6-4f50-a77a-9c8fd8543af3";
const applicationId = "91000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("application server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApplicationsMutationContext.mockResolvedValue(trustedContext);
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getApplicationsMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      trackApplicationAction({ kind: "idle" }, form({ jobId })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    await expect(
      transitionApplicationAction(
        { kind: "idle" },
        form({ applicationId, stage: "screening" }),
      ),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getApplicationsRepository).not.toHaveBeenCalled();
  });

  it("rejects invalid values without calling the repository", async () => {
    await expect(
      trackApplicationAction({ kind: "idle" }, form({ jobId: "not-a-uuid" })),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      transitionApplicationAction(
        { kind: "idle" },
        form({ applicationId, stage: "ghosted" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      updateApplicationPlanAction(
        { kind: "idle" },
        form({
          applicationId,
          nextAction: "x".repeat(201),
          nextActionDueOn: "",
          notes: "",
        }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(mocks.getApplicationsRepository).not.toHaveBeenCalled();
  });

  it("tracks, transitions, plans, and deletes through the repository", async () => {
    const repository = {
      track: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn().mockResolvedValue(undefined),
      updatePlan: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getApplicationsRepository.mockResolvedValue(repository);

    await expect(
      trackApplicationAction({ kind: "idle" }, form({ jobId })),
    ).resolves.toMatchObject({ kind: "success" });
    await expect(
      transitionApplicationAction(
        { kind: "idle" },
        form({ applicationId, stage: "screening" }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    await expect(
      updateApplicationPlanAction(
        { kind: "idle" },
        form({
          applicationId,
          nextAction: "  Chase fictional referral  ",
          nextActionDueOn: "2026-07-25",
          notes: "",
        }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    await expect(
      deleteApplicationAction({ kind: "idle" }, form({ applicationId })),
    ).resolves.toMatchObject({ kind: "success" });

    expect(repository.track).toHaveBeenCalledWith(jobId);
    expect(repository.transition).toHaveBeenCalledWith(
      applicationId,
      "screening",
    );
    expect(repository.updatePlan).toHaveBeenCalledWith(applicationId, {
      nextAction: "Chase fictional referral",
      nextActionDueOn: "2026-07-25",
      notes: null,
    });
    expect(repository.remove).toHaveBeenCalledWith(applicationId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/applications");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs/[jobId]", "page");
  });

  it("maps preview refusals to an honest unavailable state", async () => {
    mocks.getApplicationsRepository.mockResolvedValue({
      track: vi
        .fn()
        .mockRejectedValue(new PreviewApplicationsUnavailableError()),
    });

    await expect(
      trackApplicationAction({ kind: "idle" }, form({ jobId })),
    ).resolves.toMatchObject({
      kind: "unavailable",
      message: "Application changes are unavailable in this preview.",
    });
  });
});
