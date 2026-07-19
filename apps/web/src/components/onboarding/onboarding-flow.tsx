"use client";

import { useActionState } from "react";
import Link from "next/link";

import { stepsForPath, type OnboardingStep } from "@jobwarden/domain";
import {
  advanceOnboardingAction,
  completeOnboardingAction,
} from "@/app/(onboarding)/onboarding/actions";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import type {
  OnboardingActionState,
  OnboardingView,
} from "@/lib/onboarding/types";

const initialState: OnboardingActionState = { kind: "idle" };

const stepTitles: Record<OnboardingStep, string> = {
  cv: "Your CV",
  confirm_evidence: "What we read",
  aspirations: "Where you want to go",
  preferences: "What you will and will not take",
  notifications: "Staying up to date",
  review: "Check and finish",
};

/**
 * Honest copy per CV outcome. A file we could not read is a different apology
 * from a file we read that turned out to be thin, and neither is the same as
 * the user telling us they have no CV yet.
 */
const outcomeCopy: Record<string, { heading: string; body: string }> = {
  rich: {
    heading: "We read your CV",
    body: "We found enough to pre-fill the next steps. You approve everything before it becomes active.",
  },
  rich_pdf_only: {
    heading: "We read your PDF",
    body: "That is enough to build your profile. A DOCX would also let you download tailored copies that keep your own layout — you can add one later.",
  },
  thin: {
    heading: "We could not get much from that file",
    body: "It read as valid, but there was little we could use. Rather than guess, we will ask you directly instead.",
  },
  failed: {
    heading: "We could not read that file",
    body: "Nothing is wrong with your account, and your file is untouched. We will ask you directly instead, and you can try another file any time.",
  },
  none: {
    heading: "No CV for now",
    body: "That is fine — plenty of people start here. We will ask about the direction you want and the skills you have or want to build.",
  },
};

export function OnboardingFlow({ view }: { view: OnboardingView }) {
  const [advanceState, advance, advancePending] = useActionState(
    advanceOnboardingAction,
    initialState,
  );
  const [completeState, complete, completePending] = useActionState(
    completeOnboardingAction,
    initialState,
  );

  const steps = stepsForPath(view.path);
  const step = view.currentStep;
  const readOnly = view.dataMode === "fixtures";
  const position = step === null ? steps.length : steps.indexOf(step) + 1;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
        Setting up JobWarden
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#172033]">
        {step === null ? "Ready to finish" : stepTitles[step]}
      </h1>

      <p className="mt-1 text-xs text-[#697181]">
        Step {Math.max(1, position)} of {steps.length}
      </p>
      <ol
        className="mt-3 flex flex-wrap gap-2"
        aria-label="Onboarding progress"
      >
        {steps.map((item) => {
          const done = view.state?.completedSteps.includes(item) ?? false;
          return (
            <li
              key={item}
              aria-current={item === step ? "step" : undefined}
              className={`rounded-md border px-2 py-1 text-xs ${
                item === step
                  ? "border-[#2458a6] text-[#172033]"
                  : done
                    ? "border-[#ece9e2] text-[#2f6f4f]"
                    : "border-[#ece9e2] text-[#697181]"
              }`}
            >
              {stepTitles[item]}
            </li>
          );
        })}
      </ol>

      {view.cvOutcome && outcomeCopy[view.cvOutcome] ? (
        <div className="mt-6 border-t border-[#ece9e2] pt-5">
          <h2 className="text-sm font-semibold text-[#263248]">
            {outcomeCopy[view.cvOutcome]!.heading}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-6 text-[#596173]">
            {outcomeCopy[view.cvOutcome]!.body}
          </p>
        </div>
      ) : null}

      {step === "cv" ? (
        <div className="mt-6 space-y-4">
          <p className="max-w-prose text-sm leading-6 text-[#596173]">
            A CV is the fastest way to get useful matches, because JobWarden can
            read your real experience instead of asking you to type it out. It
            stays private to you and is never shared with employers.
          </p>
          <p className="max-w-prose text-sm leading-6 text-[#596173]">
            Uploading is not open yet in this build. Choose how you want to
            continue and you can add a CV from your profile at any time.
          </p>
        </div>
      ) : null}

      {step === "confirm_evidence" ? (
        <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
          We found {view.cv.conceptCount} things we could match you on. Next you
          will confirm which of them you actually want to be matched on —
          nothing becomes active until you say so.
        </p>
      ) : null}

      {step === "aspirations" ? (
        <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
          Tell us the kind of work you want and the skills you have or want to
          build. No experience is required: this is how JobWarden helps people
          starting out or changing direction.
        </p>
      ) : null}

      {step === "preferences" ? (
        <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
          Set what you will and will not take — location, working pattern,
          contract type, and a pay floor. These become filters on your feed that
          you can lift at any time.
        </p>
      ) : null}

      {step === "notifications" ? (
        <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
          JobWarden can email you when genuinely new matches appear, at most
          once per weekday slot. It is off unless you turn it on, and you can
          stop it from any email.
        </p>
      ) : null}

      {step === null ? (
        <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
          That is everything. Finishing takes you to your hub, with the
          preferences you chose already applied to your feed — and removable
          whenever you change your mind.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step === "cv" ? (
          <>
            {/* Offered only when a CV actually exists. Sending the user down
                the confirm path with nothing to confirm would be a dead end. */}
            {view.cv.present ? (
              <form action={advance}>
                <input type="hidden" name="path" value={view.path} />
                <input type="hidden" name="step" value="cv" />
                <input
                  type="hidden"
                  name="cvOutcome"
                  value={view.cvOutcome ?? "none"}
                />
                <Button type="submit" disabled={readOnly || advancePending}>
                  Continue with my CV
                </Button>
              </form>
            ) : null}
            <form action={advance}>
              <input type="hidden" name="path" value="aspiration" />
              <input type="hidden" name="step" value="cv" />
              <input type="hidden" name="cvOutcome" value="none" />
              <Button
                type="submit"
                variant={view.cv.present ? "outline" : "default"}
                disabled={readOnly || advancePending}
              >
                {view.cv.present
                  ? "I do not have a CV yet"
                  : "Continue without a CV"}
              </Button>
            </form>
          </>
        ) : null}

        {step !== null && step !== "cv" ? (
          <form action={advance}>
            <input type="hidden" name="path" value={view.path} />
            <input type="hidden" name="step" value={step} />
            <Button type="submit" disabled={readOnly || advancePending}>
              {advancePending ? "Saving…" : "Continue"}
            </Button>
          </form>
        ) : null}

        {step === null ? (
          <form action={complete}>
            <Button type="submit" disabled={readOnly || completePending}>
              {completePending ? "Finishing…" : "Finish and open my hub"}
            </Button>
          </form>
        ) : null}

        <ActionFeedback state={advanceState} />
        <ActionFeedback state={completeState} />
      </div>

      {readOnly ? (
        <p className="mt-6 text-sm text-[#596173]">
          This preview shows the onboarding flow with fictional data and cannot
          save progress.
        </p>
      ) : null}

      <p className="mt-10 text-xs text-[#697181]">
        Everything you choose here can be changed later from your career
        profile.{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          How JobWarden handles your data
        </Link>
      </p>
    </main>
  );
}
