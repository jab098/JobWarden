import "server-only";

import type {
  CvOutcome,
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
  }): Promise<void>;
  complete(): Promise<void>;
}
