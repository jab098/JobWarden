// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getProfileRepository: vi.fn(),
  getNotificationsRepository: vi.fn(),
  getProfileMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/profile/get-repository", () => ({
  getProfileRepository: mocks.getProfileRepository,
}));
vi.mock("@/lib/notifications/get-repository", () => ({
  getNotificationsRepository: mocks.getNotificationsRepository,
}));
vi.mock("./action-context", () => ({
  getProfileMutationContext: mocks.getProfileMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  decideEvidenceAction,
  decideSuggestionAction,
  saveProfileDraftAction,
  saveSearchProfileAction,
  setNotificationChannelAction,
} from "./actions";
import { PreviewNotificationsUnavailableError } from "@/lib/notifications/development-notifications";

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
const searchDraft = {
  name: "Implementation roles",
  enabled: true,
  roleFamilies: draft.targetRoleFamilies,
  includeTerms: [],
  excludeTerms: [],
  industries: [],
  domains: [],
  skillConcepts: ["sql"],
  responsibilityConcepts: [],
  currentSeniority: "senior",
  targetSeniority: "lead",
  employmentTypes: ["permanent"],
  workingTimes: ["full_time"],
  workplaceTypes: ["hybrid"],
  ukLocations: ["London"],
  ir35Statuses: ["not_applicable"],
  compensation: {
    minimum: null,
    maximum: null,
    period: "unknown",
    allowUnknown: true,
  },
  recencyDays: 14,
  notificationsEnabled: false,
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
        form({ profileGeneration: "7", draft: JSON.stringify(draft) }),
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
        form({ profileGeneration: "7", draft: JSON.stringify(malicious) }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveDraft).not.toHaveBeenCalled();

    await expect(
      saveProfileDraftAction(
        { kind: "idle" },
        form({ profileGeneration: "7", draft: JSON.stringify(draft) }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    expect(saveDraft).toHaveBeenCalledWith(7, draft);
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

  it("routes evidence confirmation through the repository boundary", async () => {
    const acceptEvidence = vi.fn(async () => undefined);
    const rejectEvidence = vi.fn(async () => undefined);
    mocks.getProfileRepository.mockResolvedValue({
      acceptEvidence,
      rejectEvidence,
    });
    const evidenceId = "10000000-0000-4000-8000-000000000001";

    await decideEvidenceAction(
      { kind: "idle" },
      form({ evidenceId, decision: "confirmed" }),
    );
    expect(acceptEvidence).toHaveBeenCalledWith(evidenceId);
    expect(rejectEvidence).not.toHaveBeenCalled();
  });

  it("validates and passes an explicit selected search ID without treating it as owner authority", async () => {
    const saveSearch = vi.fn(
      async () => "20000000-0000-4000-8000-000000000001",
    );
    mocks.getProfileRepository.mockResolvedValue({ saveSearch });
    const searchId = "20000000-0000-4000-8000-000000000002";

    await expect(
      saveSearchProfileAction(
        { kind: "idle" },
        form({
          profileGeneration: "7",
          searchId,
          search: JSON.stringify(searchDraft),
        }),
      ),
    ).resolves.toMatchObject({
      kind: "success",
      resourceId: "20000000-0000-4000-8000-000000000001",
    });
    expect(saveSearch).toHaveBeenCalledWith(7, searchId, searchDraft);

    await expect(
      saveSearchProfileAction(
        { kind: "idle" },
        form({
          profileGeneration: "7",
          searchId: "not-a-uuid",
          search: JSON.stringify(searchDraft),
        }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveSearch).toHaveBeenCalledTimes(1);
  });
});

describe("notification channel server action", () => {
  const setChannelEnabled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfileMutationContext.mockResolvedValue(trustedContext);
    setChannelEnabled.mockResolvedValue(undefined);
    mocks.getNotificationsRepository.mockResolvedValue({ setChannelEnabled });
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getProfileMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      setNotificationChannelAction({ kind: "idle" }, form({ enabled: "on" })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getNotificationsRepository).not.toHaveBeenCalled();
  });

  it.each([
    ["on", true],
    ["off", false],
  ])(
    "maps %s onto the owner-fenced repository call",
    async (input, expected) => {
      await expect(
        setNotificationChannelAction(
          { kind: "idle" },
          form({ enabled: input }),
        ),
      ).resolves.toMatchObject({ kind: "success" });
      expect(setChannelEnabled).toHaveBeenCalledWith(expected);
    },
  );

  it("rejects a value outside the two legal states", async () => {
    await expect(
      setNotificationChannelAction(
        { kind: "idle" },
        form({ enabled: "maybe" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(setChannelEnabled).not.toHaveBeenCalled();
  });

  it("reports the preview refusal honestly", async () => {
    setChannelEnabled.mockRejectedValue(
      new PreviewNotificationsUnavailableError(),
    );

    await expect(
      setNotificationChannelAction({ kind: "idle" }, form({ enabled: "on" })),
    ).resolves.toMatchObject({
      kind: "unavailable",
      message: "Notification changes are unavailable in this preview.",
    });
  });

  it("does not leak an underlying database failure", async () => {
    setChannelEnabled.mockRejectedValue(
      new Error("connection to 10.0.0.5 refused"),
    );

    const result = await setNotificationChannelAction(
      { kind: "idle" },
      form({ enabled: "on" }),
    );

    expect(result.kind).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
  });
});
