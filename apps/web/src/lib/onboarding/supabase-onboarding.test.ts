// @vitest-environment node

import { readFileSync } from "node:fs";

import { stepsForPath } from "@jobwarden/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ getSnapshot: vi.fn() }));
vi.mock("@/lib/profile/supabase-profile", () => ({
  createSupabaseProfileRepository: () => ({ getSnapshot: mocks.getSnapshot }),
}));

import {
  createSupabaseOnboardingRepository,
  sqlOnboardingSteps,
} from "./supabase-onboarding";

function client(options: { state?: unknown; rpc?: ReturnType<typeof vi.fn> }) {
  return {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({
          data: "state" in options ? options.state : null,
          error: null,
        }),
      }),
    }),
    rpc: options.rpc ?? vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    generation: 0,
    evidence: Array.from({ length: 14 }, () => ({
      confirmationState: "proposed",
    })),
    currentCv: { kind: "docx", lifecycleStatus: "ready" },
    dataMode: "supabase",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSnapshot.mockResolvedValue(snapshot());
});

describe("onboarding step vocabulary", () => {
  it("keeps the SQL path lists in lockstep with the domain", () => {
    // The database re-checks completion on its own, so a drift here would let
    // one side accept a flow the other considers unfinished.
    for (const path of ["cv", "aspiration"] as const) {
      expect([...sqlOnboardingSteps[path]]).toEqual([...stepsForPath(path)]);
    }
  });

  it("matches the step lists the migration actually declares", () => {
    const migration = readFileSync(
      new URL(
        "../../../../../supabase/migrations/202607190007_onboarding_state.sql",
        import.meta.url,
      ),
      "utf8",
    );

    for (const path of ["cv", "aspiration"] as const) {
      const expected = stepsForPath(path)
        .map((step) => `'${step}'`)
        .join(", ");
      expect(migration).toContain(`when '${path}' then array[${expected}]`);
    }
  });
});

describe("getView", () => {
  it("reports a rich CV outcome and the confirm path", async () => {
    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.path).toBe("cv");
    expect(view.currentStep).toBe("cv");
    expect(view.cv).toMatchObject({ present: true, kind: "docx" });
  });

  it("routes a PDF-only CV to the confirm path but marks the outcome", async () => {
    mocks.getSnapshot.mockResolvedValue(
      snapshot({ currentCv: { kind: "pdf", lifecycleStatus: "ready" } }),
    );

    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.path).toBe("cv");
    expect(view.cv.kind).toBe("pdf");
    expect(view.cvOutcome).toBe("rich_pdf_only");
  });

  it("reports the freshly computed outcome on a first visit", async () => {
    // No row exists yet, so returning the stored outcome would leave the user
    // with no explanation of what happened to their CV.
    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.cvOutcome).toBe("rich");
  });

  it("recomputes the outcome rather than trusting a stale stored one", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot({ currentCv: null }));

    const view = await createSupabaseOnboardingRepository(
      client({
        state: {
          path: "cv",
          completed_steps: ["cv"],
          cv_outcome: "rich",
          completed_at: null,
        },
      }),
    ).getView();

    expect(view.cvOutcome).toBe("none");
  });

  it("routes a thin CV to the aspiration path", async () => {
    mocks.getSnapshot.mockResolvedValue(
      snapshot({ evidence: [{ confirmationState: "proposed" }] }),
    );

    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.path).toBe("aspiration");
  });

  it("routes a CV that never finished processing to the aspiration path", async () => {
    mocks.getSnapshot.mockResolvedValue(
      snapshot({ currentCv: { kind: "docx", lifecycleStatus: "failed" } }),
    );

    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.path).toBe("aspiration");
  });

  it("routes a user with no CV to the aspiration path", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot({ currentCv: null }));

    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.path).toBe("aspiration");
    expect(view.cv.present).toBe(false);
  });

  it("excludes rejected evidence from the useful-concept count", async () => {
    mocks.getSnapshot.mockResolvedValue(
      snapshot({
        evidence: Array.from({ length: 14 }, () => ({
          confirmationState: "rejected",
        })),
      }),
    );

    const view = await createSupabaseOnboardingRepository(client({})).getView();

    expect(view.cv.conceptCount).toBe(0);
    expect(view.path).toBe("aspiration");
  });

  it("resumes at the earliest incomplete step", async () => {
    const view = await createSupabaseOnboardingRepository(
      client({
        state: {
          path: "cv",
          completed_steps: ["cv", "confirm_evidence"],
          cv_outcome: "rich",
          completed_at: null,
        },
      }),
    ).getView();

    expect(view.currentStep).toBe("preferences");
    expect(view.complete).toBe(false);
  });

  it("reports completion only when the database recorded it", async () => {
    const view = await createSupabaseOnboardingRepository(
      client({
        state: {
          path: "cv",
          completed_steps: [...stepsForPath("cv")],
          cv_outcome: "rich",
          completed_at: "2026-07-20T09:00:00.000Z",
        },
      }),
    ).getView();

    expect(view.complete).toBe(true);
    expect(view.currentStep).toBeNull();
  });

  it("fails closed on a corrupt stored row", async () => {
    await expect(
      createSupabaseOnboardingRepository(
        client({
          state: {
            path: "wizard",
            completed_steps: [],
            cv_outcome: null,
            completed_at: null,
          },
        }),
      ).getView(),
    ).rejects.toThrow("Unable to load onboarding");
  });
});

describe("advance", () => {
  it("calls the owner-fenced RPC with the chosen step", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await createSupabaseOnboardingRepository(client({ rpc })).advance({
      path: "cv",
      step: "preferences",
      cvOutcome: "rich",
    });

    expect(rpc).toHaveBeenCalledWith("advance_onboarding", {
      target_path: "cv",
      target_step: "preferences",
      target_cv_outcome: "rich",
    });
  });

  it("refuses a step that belongs to the other path", async () => {
    const rpc = vi.fn();

    await expect(
      createSupabaseOnboardingRepository(client({ rpc })).advance({
        path: "cv",
        step: "aspirations",
        cvOutcome: null,
      }),
    ).rejects.toThrow("Unable to save onboarding progress");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a step outside the vocabulary before calling the database", async () => {
    const rpc = vi.fn();

    await expect(
      createSupabaseOnboardingRepository(client({ rpc })).advance({
        path: "cv",
        step: "teleport" as never,
        cvOutcome: null,
      }),
    ).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("finish", () => {
  const answered = {
    path: "cv",
    completed_steps: [...stepsForPath("cv")],
    cv_outcome: "rich",
    completed_at: null,
    answers: {
      roleFamilies: ["Analytics implementation"],
      employmentTypes: ["permanent"],
      notificationsEnabled: true,
      exploreEnabled: true,
    },
  };

  it("writes the profile, preferences, and completion in one transaction", async () => {
    // Four sequential RPCs could strand a saved search behind a hub that never
    // unlocked, or unlock one whose preferences were never recorded. A single
    // call means the database rolls the whole configuration back together.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.getSnapshot.mockResolvedValue(
      snapshot({
        generation: 3,
        evidence: [
          {
            confirmationState: "confirmed",
            category: "skill",
            normalizedConcept: "python",
            label: "Python",
          },
        ],
      }),
    );

    await createSupabaseOnboardingRepository(
      client({ state: answered, rpc }),
    ).finish();

    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["finish_onboarding"]);
  });

  it("uses the live generation rather than assuming a fresh account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.getSnapshot.mockResolvedValue(snapshot({ generation: 7 }));

    await createSupabaseOnboardingRepository(
      client({ state: answered, rpc }),
    ).finish();

    expect(rpc).toHaveBeenCalledWith(
      "finish_onboarding",
      expect.objectContaining({ expected_generation: 7 }),
    );
  });

  it("carries the notification and explore choices through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await createSupabaseOnboardingRepository(
      client({ state: answered, rpc }),
    ).finish();

    expect(rpc).toHaveBeenCalledWith(
      "finish_onboarding",
      expect.objectContaining({
        notifications_enabled: true,
        explore_enabled: true,
      }),
    );
  });

  it("carries the stated preferences into the saved search profile", async () => {
    // The preferences reach matching through the profile, which is what makes
    // them applied. There is no second mechanism carrying them anywhere.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await createSupabaseOnboardingRepository(
      client({ state: answered, rpc }),
    ).finish();

    const [, parameters] = rpc.mock.calls[0]!;
    expect(parameters.draft_value).toMatchObject({
      employmentTypes: ["permanent"],
      roleFamilies: [
        expect.objectContaining({ label: "Analytics implementation" }),
      ],
    });
  });

  it("refuses to finish with nothing to match on", async () => {
    // Completing here would unlock a hub with an empty feed and no explanation.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.getSnapshot.mockResolvedValue(snapshot({ evidence: [] }));

    await expect(
      createSupabaseOnboardingRepository(
        client({ state: { ...answered, answers: {} }, rpc }),
      ).finish(),
    ).rejects.toThrow("Unable to finish onboarding");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a refused completion without leaving a second call behind", async () => {
    // A stale generation rolls the transaction back inside the database, so
    // there is nothing for the repository to undo — only an honest failure to
    // report, and no follow-up write that could half-apply the configuration.
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "stale" } });

    await expect(
      createSupabaseOnboardingRepository(
        client({ state: answered, rpc }),
      ).finish(),
    ).rejects.toThrow("Unable to finish onboarding");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
