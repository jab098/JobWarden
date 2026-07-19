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

describe("complete", () => {
  it("delegates the completeness decision to the database", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await createSupabaseOnboardingRepository(client({ rpc })).complete();

    expect(rpc).toHaveBeenCalledWith("complete_onboarding");
  });

  it("reports a refused completion without leaking detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "steps incomplete" },
    });

    await expect(
      createSupabaseOnboardingRepository(client({ rpc })).complete(),
    ).rejects.toThrow(/^Unable to finish onboarding$/);
  });
});
