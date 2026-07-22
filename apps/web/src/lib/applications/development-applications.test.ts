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

  it("computes identical insights whatever the wall clock says", async () => {
    // The fixtures are anchored to a frozen fictional "now". If the repository
    // ever reads the real clock again, these two runs diverge and this fails —
    // which is the daily drift that turned the assertion above red on
    // 2026-07-22 and took `pnpm verify` with it.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-21T09:00:00.000Z"));
      const sameDay =
        await createDevelopmentApplicationsRepository().getApplications();
      vi.setSystemTime(new Date("2027-03-15T00:00:00.000Z"));
      const muchLater =
        await createDevelopmentApplicationsRepository().getApplications();

      expect(muchLater.insights.followUps.overdue).toBe(
        sameDay.insights.followUps.overdue,
      );
      expect(muchLater.insights.outcomes.quietFourteenPlusDays).toBe(
        sameDay.insights.outcomes.quietFourteenPlusDays,
      );
      expect(muchLater.insights.followUps.overdue).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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
