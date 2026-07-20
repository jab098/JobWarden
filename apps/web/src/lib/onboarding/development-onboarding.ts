import "server-only";

import {
  nextOnboardingStep,
  parseOnboardingState,
  type OnboardingAnswers,
} from "@jobwarden/domain";

import {
  readPreviewJourney,
  recordPreviewStep,
  writePreviewJourney,
  type PreviewJourney,
} from "@/lib/development/preview-journey";

import {
  PreviewOnboardingUnavailableError,
  type OnboardingRepository,
} from "./repository";
import type { OnboardingView } from "./types";

/**
 * The fictional user already has a profile and searches, so the preview shows
 * onboarding mid-flow — the state worth reviewing — rather than pretending a
 * configured account has never started.
 */
const previewState = parseOnboardingState({
  path: "cv",
  completedSteps: ["cv"],
  completedAt: null,
});

/**
 * Explicitly fictional, so the confirmation step has something to confirm. The
 * count the step quotes is derived from this list rather than stated
 * separately, because a preview claiming fourteen concepts over an empty list
 * is exactly the inconsistency a preview exists to catch.
 */
const previewEvidence: OnboardingView["evidence"] = [
  {
    id: "b1f0c2d4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    normalizedConcept: "analytics implementation",
    label: "Analytics implementation",
    category: "skill",
    origin: "cv",
    confidence: 0.9,
    evidenceReference: "Fictional CV, experience section",
    evidenceExcerpt:
      "Fictional excerpt: led analytics implementation for a fictional UK retailer.",
    proficiencySignal: "demonstrated",
    lastUsedAt: "2026-05-01",
    confirmationState: "proposed",
  },
  {
    id: "c2a1d3e5-6b7c-4d8e-9f0a-1b2c3d4e5f60",
    normalizedConcept: "sql",
    label: "SQL",
    category: "tool",
    origin: "cv",
    confidence: 0.8,
    evidenceReference: "Fictional CV, skills section",
    evidenceExcerpt: null,
    proficiencySignal: "working",
    lastUsedAt: null,
    confirmationState: "proposed",
  },
  {
    id: "d3b2e4f6-7c8d-4e9f-a0b1-2c3d4e5f6071",
    normalizedConcept: "stakeholder reporting",
    label: "Stakeholder reporting",
    category: "responsibility",
    origin: "cv",
    confidence: 0.7,
    evidenceReference: "Fictional CV, experience section",
    evidenceExcerpt: null,
    proficiencySignal: "demonstrated",
    lastUsedAt: "2026-04-01",
    confirmationState: "confirmed",
  },
];

const previewAnswers: OnboardingAnswers = {
  roleFamilies: ["Analytics implementation"],
  targetSeniority: "lead",
  employmentTypes: ["permanent"],
  workplaceTypes: ["hybrid"],
  ukLocations: ["Manchester"],
  allowUnknownCompensation: true,
  notificationsEnabled: false,
  exploreEnabled: false,
};

/** The frozen mid-flow preview, shown when no review walkthrough is running. */
function frozenView(): OnboardingView {
  return {
    state: previewState,
    currentStep: nextOnboardingStep(previewState),
    path: "cv",
    cvOutcome: "rich",
    cv: { present: true, kind: "docx", conceptCount: previewEvidence.length },
    complete: false,
    answers: previewAnswers,
    generation: 0,
    uploadCapability: { enabled: false, reason: "fictional_preview" },
    evidence: previewEvidence,
    hasSignal: true,
    canAdvance: false,
    dataMode: "fixtures",
  };
}

/**
 * The same fictional data, but positioned wherever the review walkthrough has
 * got to. The CV is presented as already on file so both branches of the first
 * step are reachable: a journey with no CV could only ever show the aspiration
 * path, and half the flow would be unreviewable.
 */
function journeyView(journey: PreviewJourney): OnboardingView {
  const state = parseOnboardingState({
    path: journey.path,
    completedSteps: journey.completedSteps,
    completedAt: journey.finishedAt,
  });
  return {
    state,
    currentStep: nextOnboardingStep(state),
    path: journey.path,
    // Nothing has been read yet on the first step, so there is no outcome to
    // report; claiming one before the CV is accepted would be a lie.
    cvOutcome: journey.completedSteps.includes("cv")
      ? journey.path === "cv"
        ? "rich"
        : "none"
      : null,
    cv: { present: true, kind: "docx", conceptCount: previewEvidence.length },
    complete: journey.finishedAt !== null,
    answers: { ...previewAnswers, ...(journey.answers as OnboardingAnswers) },
    generation: 0,
    uploadCapability: { enabled: false, reason: "fictional_preview" },
    evidence: journey.path === "cv" ? previewEvidence : [],
    hasSignal: true,
    canAdvance: true,
    dataMode: "fixtures",
  };
}

export function createDevelopmentOnboardingRepository(): OnboardingRepository {
  return {
    async getView(): Promise<OnboardingView> {
      const journey = await readPreviewJourney();
      return journey === null ? frozenView() : journeyView(journey);
    },
    async advance(input): Promise<void> {
      const journey = await readPreviewJourney();
      if (journey === null) throw new PreviewOnboardingUnavailableError();
      await writePreviewJourney(
        recordPreviewStep(journey, input.step, input.path, input.answers),
      );
    },
    async finish(): Promise<void> {
      const journey = await readPreviewJourney();
      if (journey === null) throw new PreviewOnboardingUnavailableError();
      await writePreviewJourney({
        ...journey,
        finishedAt: new Date().toISOString(),
      });
    },
  };
}
