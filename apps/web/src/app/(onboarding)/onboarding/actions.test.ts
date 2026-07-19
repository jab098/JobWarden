// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getOnboardingRepository: vi.fn(),
  getOnboardingMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => {
    // Next's redirect throws to unwind the request; mirroring that keeps the
    // action's control flow honest rather than letting it fall through.
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  }),
}));
vi.mock("@/lib/onboarding/get-repository", () => ({
  getOnboardingRepository: mocks.getOnboardingRepository,
}));
vi.mock("./action-context", () => ({
  getOnboardingMutationContext: mocks.getOnboardingMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { advanceOnboardingAction, completeOnboardingAction } from "./actions";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};

function form(values: Record<string, string> = {}): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("onboarding completion server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOnboardingMutationContext.mockResolvedValue(trustedContext);
    mocks.getOnboardingRepository.mockResolvedValue({
      finish: vi.fn().mockResolvedValue(undefined),
      advance: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("lands the finished user on the hub", async () => {
    // Every other "signed in and set up" path lands here. Sending onboarding
    // somewhere else is what made three paths disagree.
    await expect(
      completeOnboardingAction({ kind: "idle" }, form()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/home");
  });

  it("carries no filter parameters, which the hub could not apply", async () => {
    await expect(
      completeOnboardingAction({ kind: "idle" }, form()),
    ).rejects.toThrow("NEXT_REDIRECT");

    const [destination] = mocks.redirect.mock.calls[0]!;
    expect(destination).not.toContain("?");
  });

  it("does not redirect when finishing fails", async () => {
    // A failed completion must leave the user inside onboarding, not at a hub
    // that believes it is configured.
    mocks.getOnboardingRepository.mockResolvedValue({
      finish: vi.fn().mockRejectedValue(new Error("refused")),
      advance: vi.fn(),
    });

    await expect(
      completeOnboardingAction({ kind: "idle" }, form()),
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses an untrusted origin before touching the repository", async () => {
    mocks.getOnboardingMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.example",
    });

    await expect(
      completeOnboardingAction({ kind: "idle" }, form()),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getOnboardingRepository).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("saves the step's answers alongside the step itself", async () => {
    const advance = vi.fn().mockResolvedValue(undefined);
    mocks.getOnboardingRepository.mockResolvedValue({
      advance,
      finish: vi.fn(),
    });

    await expect(
      advanceOnboardingAction(
        { kind: "idle" },
        form({
          path: "aspiration",
          step: "aspirations",
          roleFamilies: "Data analyst",
        }),
      ),
    ).resolves.toMatchObject({ kind: "success" });

    expect(advance).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "aspirations",
        answers: expect.objectContaining({ roleFamilies: ["Data analyst"] }),
      }),
    );
  });
});
