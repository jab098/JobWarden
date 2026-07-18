// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getProfileRepository: vi.fn(),
  getProfileMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/profile/get-repository", () => ({
  getProfileRepository: mocks.getProfileRepository,
}));
vi.mock("./action-context", () => ({
  getProfileMutationContext: mocks.getProfileMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { decideSuggestionAction, saveProfileDraftAction } from "./actions";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const draft = {
  cvDocumentId: null,
  currentSeniority: "senior",
  targetSeniority: "lead",
  evidence: [],
  targetRoleFamilies: [
    {
      normalizedConcept: "analytics implementation consulting",
      label: "Analytics implementation consulting",
    },
  ],
  industries: [],
  domains: [],
  keywords: [],
};

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("career profile server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfileMutationContext.mockResolvedValue(trustedContext);
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getProfileMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      saveProfileDraftAction(
        { kind: "idle" },
        form({ draft: JSON.stringify(draft) }),
      ),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getProfileRepository).not.toHaveBeenCalled();
  });

  it("passes a strict draft without accepting any actor identifier", async () => {
    const saveDraft = vi.fn(async () => undefined);
    mocks.getProfileRepository.mockResolvedValue({ saveDraft });
    const malicious = {
      ...draft,
      userId: "10000000-0000-4000-8000-000000000001",
    };

    await expect(
      saveProfileDraftAction(
        { kind: "idle" },
        form({ draft: JSON.stringify(malicious) }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveDraft).not.toHaveBeenCalled();

    await expect(
      saveProfileDraftAction(
        { kind: "idle" },
        form({ draft: JSON.stringify(draft) }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    expect(saveDraft).toHaveBeenCalledWith(draft);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("allows only bounded suggestion decisions", async () => {
    const acceptSuggestion = vi.fn(async () => undefined);
    const rejectSuggestion = vi.fn(async () => undefined);
    mocks.getProfileRepository.mockResolvedValue({
      acceptSuggestion,
      rejectSuggestion,
    });
    const suggestionId = "10000000-0000-4000-8000-000000000001";

    await decideSuggestionAction(
      { kind: "idle" },
      form({ suggestionId, decision: "accepted" }),
    );
    expect(acceptSuggestion).toHaveBeenCalledWith(suggestionId);
    expect(rejectSuggestion).not.toHaveBeenCalled();
  });
});
