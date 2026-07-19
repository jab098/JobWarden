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

export function createDevelopmentOnboardingRepository(): OnboardingRepository {
  return {
    async getView(): Promise<OnboardingView> {
      return {
        state: previewState,
        currentStep: nextOnboardingStep(previewState),
        path: "cv",
        cvOutcome: "rich",
        cv: {
          present: true,
          kind: "docx",
          conceptCount: previewEvidence.length,
        },
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
        evidence: previewEvidence,
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
