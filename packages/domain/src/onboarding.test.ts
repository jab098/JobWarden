import { describe, expect, it } from "vitest";

import {
  classifyCvOutcome,
  isOnboardingComplete,
  nextOnboardingStep,
  onboardingSteps,
  parseOnboardingState,
  stepsForPath,
  type OnboardingState,
} from "./onboarding.ts";

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    path: "cv",
    completedSteps: [],
    completedAt: null,
    ...overrides,
  };
}

describe("classifyCvOutcome", () => {
  it("treats a well-parsed DOCX with plenty of evidence as rich", () => {
    expect(
      classifyCvOutcome({
        parsed: true,
        confirmableConceptCount: 14,
        cvKind: "docx",
      }),
    ).toBe("rich");
  });

  it("treats a parsed PDF as rich but distinguishable for tailoring", () => {
    expect(
      classifyCvOutcome({
        parsed: true,
        confirmableConceptCount: 14,
        cvKind: "pdf",
      }),
    ).toBe("rich_pdf_only");
  });

  it("treats a parse that yielded almost nothing as thin", () => {
    expect(
      classifyCvOutcome({
        parsed: true,
        confirmableConceptCount: 2,
        cvKind: "docx",
      }),
    ).toBe("thin");
  });

  it("treats a failed parse as failed rather than thin", () => {
    // These need different copy: "we could not read your file" is a different
    // problem from "we read it and there was not much there".
    expect(
      classifyCvOutcome({
        parsed: false,
        confirmableConceptCount: 0,
        cvKind: "docx",
      }),
    ).toBe("failed");
  });

  it("treats an absent CV as the deliberate no-CV choice", () => {
    expect(
      classifyCvOutcome({
        parsed: false,
        confirmableConceptCount: 0,
        cvKind: null,
      }),
    ).toBe("none");
  });

  it("is deterministic at the thin boundary", () => {
    const base = { parsed: true, cvKind: "docx" as const };
    expect(classifyCvOutcome({ ...base, confirmableConceptCount: 4 })).toBe(
      "thin",
    );
    expect(classifyCvOutcome({ ...base, confirmableConceptCount: 5 })).toBe(
      "rich",
    );
  });
});

describe("stepsForPath", () => {
  it("asks a CV user to confirm what was read", () => {
    expect(stepsForPath("cv")).toContain("confirm_evidence");
  });

  it("asks an aspiration user about direction instead of evidence", () => {
    const steps = stepsForPath("aspiration");

    expect(steps).toContain("aspirations");
    expect(steps).not.toContain("confirm_evidence");
  });

  it("gives both paths the same preference and finish steps", () => {
    for (const path of ["cv", "aspiration"] as const) {
      expect(stepsForPath(path)).toContain("preferences");
      expect(stepsForPath(path)).toContain("notifications");
      expect(stepsForPath(path).at(-1)).toBe("review");
    }
  });

  it("starts both paths at the same first decision", () => {
    expect(stepsForPath("cv")[0]).toBe("cv");
    expect(stepsForPath("aspiration")[0]).toBe("cv");
  });

  it("only uses steps from the declared vocabulary", () => {
    for (const path of ["cv", "aspiration"] as const) {
      for (const step of stepsForPath(path)) {
        expect(onboardingSteps).toContain(step);
      }
    }
  });
});

describe("nextOnboardingStep", () => {
  it("starts a new user at the CV decision", () => {
    expect(nextOnboardingStep(state())).toBe("cv");
  });

  it("advances past completed steps in order", () => {
    expect(
      nextOnboardingStep(state({ completedSteps: ["cv", "confirm_evidence"] })),
    ).toBe("preferences");
  });

  it("returns null once every step for the path is done", () => {
    expect(
      nextOnboardingStep(state({ completedSteps: [...stepsForPath("cv")] })),
    ).toBeNull();
  });

  it("ignores a completed step that is not part of this path", () => {
    // Switching from the CV path to aspirations must not let an evidence step
    // completed earlier satisfy a step the aspiration path never asks.
    const result = nextOnboardingStep(
      state({ path: "aspiration", completedSteps: ["cv", "confirm_evidence"] }),
    );

    expect(result).toBe("aspirations");
  });

  it("resumes at the earliest incomplete step, not the furthest reached", () => {
    expect(
      nextOnboardingStep(
        state({ completedSteps: ["cv", "preferences", "review"] }),
      ),
    ).toBe("confirm_evidence");
  });
});

describe("isOnboardingComplete", () => {
  it("is complete only when the completion timestamp is set", () => {
    expect(
      isOnboardingComplete(
        state({
          completedSteps: [...stepsForPath("cv")],
          completedAt: "2026-07-20T09:00:00.000Z",
        }),
      ),
    ).toBe(true);
  });

  it("is not complete while any step remains, even with a timestamp", () => {
    // A timestamp without the steps means something wrote it out of band.
    expect(
      isOnboardingComplete(
        state({
          completedSteps: ["cv"],
          completedAt: "2026-07-20T09:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("is not complete when every step is done but nothing finalised it", () => {
    expect(
      isOnboardingComplete(state({ completedSteps: [...stepsForPath("cv")] })),
    ).toBe(false);
  });

  it("treats a null state as not complete", () => {
    expect(isOnboardingComplete(null)).toBe(false);
  });
});

describe("parseOnboardingState", () => {
  it("accepts a well-formed state", () => {
    const parsed = parseOnboardingState({
      path: "cv",
      completedSteps: ["cv"],
      completedAt: null,
    });

    expect(parsed).toMatchObject({ path: "cv", completedSteps: ["cv"] });
  });

  it("returns null for an absent state so the caller gates", () => {
    expect(parseOnboardingState(null)).toBeNull();
    expect(parseOnboardingState(undefined)).toBeNull();
  });

  it.each([
    [
      "an unknown path",
      { path: "wizard", completedSteps: [], completedAt: null },
    ],
    [
      "an unknown step",
      { path: "cv", completedSteps: ["teleport"], completedAt: null },
    ],
    [
      "a non-array step list",
      { path: "cv", completedSteps: "cv", completedAt: null },
    ],
    [
      "a malformed timestamp",
      { path: "cv", completedSteps: [], completedAt: "yesterday" },
    ],
    ["a non-object", "onboarded"],
  ])("fails closed on %s", (_label, input) => {
    // Anything unreadable counts as not onboarded, so a corrupt row gates the
    // user rather than letting them past.
    expect(parseOnboardingState(input)).toBeNull();
    expect(isOnboardingComplete(parseOnboardingState(input))).toBe(false);
  });
});
