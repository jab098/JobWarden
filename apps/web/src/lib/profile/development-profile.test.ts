// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDevelopmentProfileRepository } from "./development-profile";

describe("fictional career profile repository", () => {
  it("returns deeply immutable, explicitly fictional profile evidence", async () => {
    const snapshot = await createDevelopmentProfileRepository().getSnapshot();
    const serialised = JSON.stringify(snapshot);

    expect(snapshot.dataMode).toBe("fixtures");
    expect(snapshot.uploadCapability.enabled).toBe(false);
    expect(snapshot.draft?.targetRoleFamilies[0]?.normalizedConcept).toBe(
      "analytics implementation consulting",
    );
    expect(snapshot.suggestions.some((item) => item.state === "proposed")).toBe(
      true,
    );
    expect(snapshot.suggestions.map((item) => item.state)).toEqual([
      "proposed",
      "accepted",
      "rejected",
    ]);
    expect(snapshot.searches).toHaveLength(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.draft?.evidence)).toBe(true);
    expect(serialised).toMatch(/fictional|analytics implementation/i);
    expect(serialised).not.toMatch(
      /@|phone|mobile|street address|curriculum vitae/i,
    );
  });

  it.each([
    ["saveDraft", [{}]],
    ["acceptSuggestion", ["10000000-0000-4000-8000-000000000001"]],
    ["rejectSuggestion", ["10000000-0000-4000-8000-000000000001"]],
    ["acceptEvidence", ["10000000-0000-4000-8000-000000000001"]],
    ["rejectEvidence", ["10000000-0000-4000-8000-000000000001"]],
    ["saveSearch", [null, {}]],
    ["deleteCv", []],
    ["deleteProfileData", []],
  ] as const)(
    "rejects %s without performing a local mutation",
    async (method, args) => {
      const repository = createDevelopmentProfileRepository();
      await expect(
        (repository[method] as (...values: unknown[]) => Promise<unknown>)(
          ...args,
        ),
      ).rejects.toMatchObject({ code: "read_only" });
    },
  );
});
