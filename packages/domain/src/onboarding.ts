import { z } from "zod";

/**
 * Onboarding is mandatory initialisation: the hub is unusable without a profile,
 * so an approved user is held here until they have built one. Everything in this
 * module is pure and deterministic, and every ambiguous input fails closed —
 * an unreadable state counts as not onboarded, never as done.
 */

export const onboardingSteps = [
  "cv",
  "confirm_evidence",
  "aspirations",
  "preferences",
  "notifications",
  "review",
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export const onboardingPaths = ["cv", "aspiration"] as const;
export type OnboardingPath = (typeof onboardingPaths)[number];

/**
 * What we actually got from the user's CV, which decides the path and the copy.
 * `thin` and `failed` are deliberately separate: "we read it and there was not
 * much there" is a different problem, and a different apology, from "we could
 * not read your file at all".
 */
export type CvOutcome = "rich" | "rich_pdf_only" | "thin" | "failed" | "none";

/** Below this, a CV has not given us enough to pre-fill anything useful. */
const MINIMUM_USEFUL_CONCEPTS = 5;

export function classifyCvOutcome(input: {
  parsed: boolean;
  confirmableConceptCount: number;
  cvKind: "docx" | "pdf" | null;
}): CvOutcome {
  if (input.cvKind === null) return "none";
  if (!input.parsed) return "failed";
  if (input.confirmableConceptCount < MINIMUM_USEFUL_CONCEPTS) return "thin";
  return input.cvKind === "pdf" ? "rich_pdf_only" : "rich";
}

/**
 * A thin or failed CV drops to the aspiration path, because there is nothing to
 * confirm. The user keeps whatever was extracted; they are simply not asked to
 * approve a list that is almost empty.
 */
export function pathForOutcome(outcome: CvOutcome): OnboardingPath {
  return outcome === "rich" || outcome === "rich_pdf_only"
    ? "cv"
    : "aspiration";
}

const cvPathSteps: readonly OnboardingStep[] = [
  "cv",
  "confirm_evidence",
  "preferences",
  "notifications",
  "review",
];

const aspirationPathSteps: readonly OnboardingStep[] = [
  "cv",
  "aspirations",
  "preferences",
  "notifications",
  "review",
];

export function stepsForPath(path: OnboardingPath): readonly OnboardingStep[] {
  return path === "cv" ? cvPathSteps : aspirationPathSteps;
}

/**
 * PostgreSQL returns a `timestamptz` with an offset — `...150188+00:00` — and
 * `z.iso.datetime()` rejects an offset unless told to accept one. A completed
 * onboarding row therefore failed to parse, `isOnboardingComplete` read false,
 * and `nextOnboardingStep(null)` sent the reader to step one. Finishing setup
 * returned them to the start of it.
 *
 * Every fixture in the suite was written with a trailing `Z`, which Postgres
 * never emits, so nothing caught it.
 */
const onboardingStateSchema = z
  .object({
    path: z.enum(onboardingPaths),
    completedSteps: z
      .array(z.enum(onboardingSteps))
      .max(onboardingSteps.length),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/**
 * Anything that does not parse becomes null, and null gates the user. A corrupt
 * row must never read as "onboarded".
 */
export function parseOnboardingState(input: unknown): OnboardingState | null {
  const result = onboardingStateSchema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * The earliest step this path still needs — not the furthest the user reached.
 * Resuming at the earliest gap is what makes an abandoned flow recoverable
 * rather than silently skipping a question.
 */
export function nextOnboardingStep(
  state: OnboardingState | null,
): OnboardingStep | null {
  if (state === null) return "cv";

  const completed = new Set(state.completedSteps);
  return stepsForPath(state.path).find((step) => !completed.has(step)) ?? null;
}

/**
 * The step a reader would return to from where they are now.
 *
 * `null` on the first step, and on a flow that has not started — there is
 * nothing behind either, so no control is offered. On the review step, where
 * `nextOnboardingStep` is `null`, the answer is the last step of the path.
 *
 * Going back is expressed as un-completing that step rather than storing a
 * cursor: `nextOnboardingStep` already returns the earliest gap, so removing
 * one step from `completedSteps` moves the reader there and re-answering it
 * returns them to exactly where they were. No second notion of "where I am"
 * exists to disagree with the first.
 */
export function previousOnboardingStep(
  state: OnboardingState | null,
): OnboardingStep | null {
  if (state === null) return null;

  const steps = stepsForPath(state.path);
  const current = nextOnboardingStep(state);
  const index = current === null ? steps.length : steps.indexOf(current);

  return index <= 0 ? null : (steps[index - 1] ?? null);
}

export function isOnboardingComplete(state: OnboardingState | null): boolean {
  if (state === null || state.completedAt === null) return false;
  return nextOnboardingStep(state) === null;
}
