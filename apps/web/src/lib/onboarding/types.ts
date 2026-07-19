import type {
  CareerEvidenceItem,
  CvOutcome,
  OnboardingAnswers,
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
  /** Answers given so far, so every step renders pre-filled. */
  answers: OnboardingAnswers;
  /** Confirmable evidence the CV produced, for the confirmation step. */
  evidence: readonly CareerEvidenceItem[];
  /** Whether enough has been gathered to save a named search. */
  hasSignal: boolean;
  dataMode: "supabase" | "fixtures";
};

export type OnboardingActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
