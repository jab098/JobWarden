// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDevelopmentApplicationsRepository,
  PreviewApplicationsUnavailableError,
} from "./development-applications";

describe("development applications repository", () => {
  it("serves fictional applications ordered by latest audited activity", async () => {
    const result =
      await createDevelopmentApplicationsRepository().getApplications();

    expect(result.dataMode).toBe("fixtures");
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.stage)).toEqual([
      "interviewing",
      "rejected",
      "applied",
    ]);
    expect(result.insights.totalTracked).toBe(3);
    expect(result.insights.outcomes.observed).toBe(1);
    // The stale fictional "applied" application is quiet, never rejected.
    expect(result.insights.outcomes.quietFourteenPlusDays).toBe(1);
    expect(result.insights.followUps.overdue).toBe(1);
  });

  it("rejects every mutation in the fictional preview", async () => {
    const repository = createDevelopmentApplicationsRepository();

    await expect(
      repository.track("0d74a055-d0e6-4f50-a77a-9c8fd8543af3"),
    ).rejects.toBeInstanceOf(PreviewApplicationsUnavailableError);
    await expect(
      repository.transition("91000000-0000-4000-8000-000000000001", "offer"),
    ).rejects.toBeInstanceOf(PreviewApplicationsUnavailableError);
    await expect(
      repository.updatePlan("91000000-0000-4000-8000-000000000001", {
        nextAction: null,
        nextActionDueOn: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(PreviewApplicationsUnavailableError);
    await expect(
      repository.remove("91000000-0000-4000-8000-000000000001"),
    ).rejects.toBeInstanceOf(PreviewApplicationsUnavailableError);
  });
});
