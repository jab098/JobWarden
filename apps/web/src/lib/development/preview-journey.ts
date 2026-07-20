import "server-only";

import { cookies } from "next/headers";
import {
  onboardingPaths,
  onboardingSteps,
  type OnboardingAnswers,
  type OnboardingPath,
  type OnboardingStep,
} from "@jobwarden/domain";
import { z } from "zod";

import { resolveDevelopmentAccessMode } from "./access-mode";

/**
 * A fictional run through sign-up, onboarding and the first visit to Home, for
 * reviewing those states without a real account.
 *
 * The whole journey lives in one cookie. Nothing here touches a repository, a
 * database or a real user: the fictional onboarding repository reads this to
 * decide which step to render, and the fictional dashboard reads it to decide
 * whether Home is being seen for the first time.
 *
 * It fails closed. Every entry point re-checks the documented local bypass and
 * returns null when it is off, and `resolveDevelopmentAccessMode` itself throws
 * outside `NODE_ENV=development`, so no deployment can carry this surface even
 * if the cookie were forged.
 */

const COOKIE = "jobwarden_preview_journey";

const journeySchema = z
  .object({
    path: z.enum(onboardingPaths),
    completedSteps: z
      .array(z.enum(onboardingSteps))
      .max(onboardingSteps.length),
    /** Set when the review reaches the end, so Home knows it is day one. */
    finishedAt: z.string().datetime().nullable(),
    answers: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

export type PreviewJourney = z.infer<typeof journeySchema>;

export function previewJourneyEnabled(): boolean {
  return resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  }).enabled;
}

/** The journey in progress, or null when there is none or the mode is off. */
export async function readPreviewJourney(): Promise<PreviewJourney | null> {
  if (!previewJourneyEnabled()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (raw === undefined) return null;
  try {
    return journeySchema.parse(JSON.parse(raw));
  } catch {
    // A malformed cookie means no journey, never a crash on a review surface.
    return null;
  }
}

export async function writePreviewJourney(
  journey: PreviewJourney,
): Promise<void> {
  if (!previewJourneyEnabled()) return;
  (await cookies()).set(COOKIE, JSON.stringify(journeySchema.parse(journey)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Session-scoped on purpose: a review should not outlive the browser.
    secure: false,
  });
}

export async function clearPreviewJourney(): Promise<void> {
  if (!previewJourneyEnabled()) return;
  (await cookies()).delete(COOKIE);
}

/** A journey that has not started any step yet. */
export function newPreviewJourney(path: OnboardingPath = "cv"): PreviewJourney {
  return { path, completedSteps: [], finishedAt: null, answers: null };
}

export function recordPreviewStep(
  journey: PreviewJourney,
  step: OnboardingStep,
  path: OnboardingPath,
  answers?: OnboardingAnswers,
): PreviewJourney {
  return {
    path,
    completedSteps: journey.completedSteps.includes(step)
      ? journey.completedSteps
      : [...journey.completedSteps, step],
    finishedAt: journey.finishedAt,
    answers: answers
      ? { ...(journey.answers ?? {}), ...answers }
      : journey.answers,
  };
}

/**
 * Whether Home should render its first-run state. True only while a journey has
 * been finished, so the ordinary populated preview is what you get otherwise.
 */
export function previewJourneyIsFresh(journey: PreviewJourney | null): boolean {
  return journey?.finishedAt !== null && journey !== null;
}
