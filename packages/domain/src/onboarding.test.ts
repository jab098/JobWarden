import { describe, expect, it } from "vitest";

import {
  classifyCvOutcome,
  isOnboardingComplete,
  nextOnboardingStep,
  onboardingSteps,
  parseOnboardingState,
  previousOnboardingStep,
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

describe("previousOnboardingStep", () => {
  // Going back is un-completing a step, so it must agree exactly with
  // `nextOnboardingStep` — the two together are the whole notion of "where am
  // I", and a disagreement would strand a reader between them.
  it("offers nothing on the first step", () => {
    expect(
      previousOnboardingStep({
        path: "cv",
        completedSteps: [],
        completedAt: null,
      }),
    ).toBeNull();
  });

  it("offers nothing before a flow has started", () => {
    expect(previousOnboardingStep(null)).toBeNull();
  });

  it("offers the step just behind the current one", () => {
    expect(
      previousOnboardingStep({
        path: "cv",
        completedSteps: ["cv", "confirm_evidence"],
        completedAt: null,
      }),
    ).toBe("confirm_evidence");
  });

  it("offers the last step of the path from the review step", () => {
    const steps = stepsForPath("aspiration");
    expect(
      previousOnboardingStep({
        path: "aspiration",
        completedSteps: [...steps],
        completedAt: null,
      }),
    ).toBe(steps[steps.length - 1]);
  });

  it("follows the aspiration path rather than the cv one", () => {
    expect(
      previousOnboardingStep({
        path: "aspiration",
        completedSteps: ["cv"],
        completedAt: null,
      }),
    ).toBe("cv");
  });

  // The round trip: going back and re-answering returns the reader to exactly
  // where they were, which is the property that makes this safe to offer.
  it("returns the reader to where they were once the step is re-answered", () => {
    const before: OnboardingState = {
      path: "cv",
      completedSteps: ["cv", "confirm_evidence"],
      completedAt: null,
    };
    const wasOn = nextOnboardingStep(before);
    const back = previousOnboardingStep(before);

    const afterGoingBack: OnboardingState = {
      ...before,
      completedSteps: before.completedSteps.filter((step) => step !== back),
    };
    expect(nextOnboardingStep(afterGoingBack)).toBe(back);

    const afterReanswering: OnboardingState = {
      ...before,
      completedSteps: [...afterGoingBack.completedSteps, back!],
    };
    expect(nextOnboardingStep(afterReanswering)).toBe(wasOn);
  });
});
