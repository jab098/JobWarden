import type {
  CvOutcome,
  OnboardingPath,
  OnboardingState,
  OnboardingStep,
} from "@jobwarden/domain";

export type OnboardingView = {
  state: OnboardingState | null;
  /** The earliest step still needed, or null when every step is done. */
  currentStep: OnboardingStep | null;
  path: OnboardingPath;
  cvOutcome: CvOutcome | null;
  /** Whether a CV exists and what came out of reading it. */
  cv: { present: boolean; kind: "docx" | "pdf" | null; conceptCount: number };
  complete: boolean;
  dataMode: "supabase" | "fixtures";
};

export type OnboardingActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
