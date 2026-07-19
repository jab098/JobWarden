import "server-only";

import type {
  CvOutcome,
  OnboardingAnswers,
  OnboardingPath,
  OnboardingStep,
} from "@jobwarden/domain";

import type { OnboardingView } from "./types";

export class PreviewOnboardingUnavailableError extends Error {
  constructor() {
    super("Onboarding changes are unavailable in this preview.");
    this.name = "PreviewOnboardingUnavailableError";
  }
}

export interface OnboardingRepository {
  getView(): Promise<OnboardingView>;
  advance(input: {
    path: OnboardingPath;
    step: OnboardingStep;
    cvOutcome: CvOutcome | null;
    answers?: OnboardingAnswers;
  }): Promise<void>;
  /**
   * Writes the search profile, Explore choice, and digest preference the
   * answers describe, then marks onboarding complete.
   */
  finish(): Promise<void>;
}
