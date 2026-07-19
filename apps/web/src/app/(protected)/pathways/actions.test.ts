// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getExploreRepository: vi.fn(),
  getExploreMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/explore/get-repository", () => ({
  getExploreRepository: mocks.getExploreRepository,
}));
vi.mock("./action-context", () => ({
  getExploreMutationContext: mocks.getExploreMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  decidePathwayAction,
  promotePathwayAction,
  setExploreEnabledAction,
} from "./actions";
import { PreviewExploreUnavailableError } from "@/lib/explore/development-explore";
import { PathwayNotSuggestedError } from "@/lib/explore/supabase-explore";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const concept = "product analytics implementation";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("explore server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExploreMutationContext.mockResolvedValue(trustedContext);
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getExploreMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      setExploreEnabledAction({ kind: "idle" }, form({ enabled: "true" })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: concept, decision: "dismissed" }),
      ),
    ).resolves.toMatchObject({ kind: "forbidden" });
    await expect(
      promotePathwayAction({ kind: "idle" }, form({ pathwayConcept: concept })),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getExploreRepository).not.toHaveBeenCalled();
  });

  it("rejects invalid values without calling the repository", async () => {
    await expect(
      setExploreEnabledAction({ kind: "idle" }, form({ enabled: "maybe" })),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: "NOT Valid!", decision: "dismissed" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: concept, decision: "promoted" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(mocks.getExploreRepository).not.toHaveBeenCalled();
  });

  it("toggles explore and revalidates the page", async () => {
    const setEnabled = vi.fn().mockResolvedValue(undefined);
    mocks.getExploreRepository.mockResolvedValue({ setEnabled });

    await expect(
      setExploreEnabledAction({ kind: "idle" }, form({ enabled: "false" })),
    ).resolves.toMatchObject({ kind: "success" });
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pathways");
  });

  it("records a dismissal and a restore", async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    mocks.getExploreRepository.mockResolvedValue({ decide });

    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: concept, decision: "dismissed" }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: concept, decision: "clear" }),
      ),
    ).resolves.toMatchObject({ kind: "success" });
    expect(decide).toHaveBeenNthCalledWith(1, concept, "dismissed");
    expect(decide).toHaveBeenNthCalledWith(2, concept, "clear");
  });

  it("promotes a pathway and revalidates explore, jobs, and profile", async () => {
    const promote = vi.fn().mockResolvedValue(undefined);
    mocks.getExploreRepository.mockResolvedValue({ promote });

    await expect(
      promotePathwayAction({ kind: "idle" }, form({ pathwayConcept: concept })),
    ).resolves.toMatchObject({ kind: "success" });
    expect(promote).toHaveBeenCalledWith(concept);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pathways");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/matches");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("maps preview and staleness failures to honest states", async () => {
    mocks.getExploreRepository.mockResolvedValue({
      promote: vi.fn().mockRejectedValue(new PathwayNotSuggestedError()),
      decide: vi.fn().mockRejectedValue(new PreviewExploreUnavailableError()),
    });

    await expect(
      promotePathwayAction({ kind: "idle" }, form({ pathwayConcept: concept })),
    ).resolves.toMatchObject({ kind: "invalid" });
    await expect(
      decidePathwayAction(
        { kind: "idle" },
        form({ pathwayConcept: concept, decision: "dismissed" }),
      ),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });
});
