import "server-only";

import { nextOnboardingStep, parseOnboardingState } from "@jobwarden/domain";

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

export function createDevelopmentOnboardingRepository(): OnboardingRepository {
  return {
    async getView(): Promise<OnboardingView> {
      return {
        state: previewState,
        currentStep: nextOnboardingStep(previewState),
        path: "cv",
        cvOutcome: "rich",
        cv: { present: true, kind: "docx", conceptCount: 14 },
        complete: false,
        answers: {
          roleFamilies: ["Analytics implementation"],
          targetSeniority: "lead",
          employmentTypes: ["permanent"],
          workplaceTypes: ["hybrid"],
          ukLocations: ["Manchester"],
          allowUnknownCompensation: true,
          notificationsEnabled: false,
          exploreEnabled: false,
        },
        evidence: [],
        hasSignal: true,
        dataMode: "fixtures",
      };
    },
    async advance() {
      throw new PreviewOnboardingUnavailableError();
    },
    async finish() {
      throw new PreviewOnboardingUnavailableError();
    },
  };
}
