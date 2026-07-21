"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  pathForOutcome,
  previousOnboardingStep,
  stepsForPath,
  type OnboardingStep,
} from "@jobwarden/domain";
import {
  advanceOnboardingAction,
  completeOnboardingAction,
  goBackOnboardingAction,
} from "@/app/(onboarding)/onboarding/actions";
import {
  ChoiceField,
  ConceptListField,
  EmploymentTypeField,
  Ir35Field,
  PayFloorField,
  SeniorityField,
  WorkingTimeField,
  WorkplaceField,
} from "@/components/onboarding/onboarding-fields";
import { CvReadingNotice } from "@/components/onboarding/cv-reading-notice";
import { CvUploadCard } from "@/components/profile/cv-upload-card";
import { ProfileEvidenceList } from "@/components/profile/profile-evidence-list";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Enter } from "@/components/ui/enter";
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
    body: "That is enough to build your profile. A DOCX would also let you download tailored copies that keep your own layout. You can add one later.",
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
    body: "That is fine; plenty of people start here. We will ask about the direction you want and the skills you have or want to build.",
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
  const [goBackState, goBack, goBackPending] = useActionState(
    goBackOnboardingAction,
    initialState,
  );

  const steps = stepsForPath(view.path);
  // Null on the first step and before a flow has started, which is what
  // decides whether a back control exists at all.
  const previousStep = previousOnboardingStep(view.state);
  const step = view.currentStep;
  const readOnly = view.dataMode === "fixtures";
  const position = step === null ? steps.length : steps.indexOf(step) + 1;

  return (
    // Centred in the viewport rather than pinned to the top: onboarding is one
    // short question at a time, and left at the top of a large monitor it reads
    // as a fragment of a page that failed to load. `my-auto` centres without
    // clipping the head of a step that outgrows the screen.
    <div className="flex min-h-[100dvh] flex-col items-center px-5 py-10">
      <main className="my-auto w-full max-w-[var(--container-flow)]">
        <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
          JobWarden
        </p>
        <ol
          className="mt-6 flex flex-wrap gap-x-4 gap-y-2"
          aria-label="Onboarding progress"
        >
          {steps.map((item, index) => {
            const done = view.state?.completedSteps.includes(item) ?? false;
            const active = item === step;
            return (
              <li
                key={item}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${
                  active
                    ? "font-medium text-foreground"
                    : done
                      ? "text-success"
                      : "text-ink-faint"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`tnum flex size-4.5 items-center justify-center rounded-full font-mono text-[0.62rem] transition-colors duration-150 ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-success-surface text-success"
                        : "bg-muted text-ink-faint"
                  }`}
                >
                  {index + 1}
                </span>
                {stepTitles[item]}
              </li>
            );
          })}
        </ol>
        {/* Everything below the progress rail belongs to one step, so it animates
          as one thing when the step changes. Advancing is a server action, not
          a navigation, so nothing else would notice the change. The rail itself
          stays put: a progress indicator that re-animates on every step is
          reporting movement it did not make. */}
        <Enter id={`onboarding-${view.path}-${step ?? "review"}`}>
          <h1 className="mt-6 text-xl font-semibold tracking-[-0.02em] text-foreground">
            {step === null ? "Ready to finish" : stepTitles[step]}
          </h1>
          <p className="mt-1 text-xs text-ink-faint">
            Step {Math.max(1, position)} of {steps.length}
          </p>

          {view.cvOutcome && outcomeCopy[view.cvOutcome] ? (
            <div className="mt-6 border-t border-border pt-5">
              <h2 className="text-sm font-semibold text-foreground">
                {outcomeCopy[view.cvOutcome]!.heading}
              </h2>
              <p className="mt-1 max-w-prose text-sm leading-6 text-ink-secondary">
                {outcomeCopy[view.cvOutcome]!.body}
              </p>
            </div>
          ) : null}

          {step === "cv" ? (
            <div className="mt-6 space-y-4">
              <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                A CV is the fastest way to get useful matches, because JobWarden
                can read your real experience instead of asking you to type it
                out. It stays private to you and is never shared with employers.
              </p>
              <div className="max-w-prose">
                <CvUploadCard
                  capability={view.uploadCapability}
                  generation={view.generation}
                  hasCurrentCv={view.cv.present}
                />
                <CvReadingNotice reading={view.cv.present && !view.cv.ready} />
              </div>
              <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                You can also skip this and tell us what you are looking for
                instead. A CV can be added from your profile at any time.
              </p>
            </div>
          ) : null}

          {/* The evidence list posts its own decision per item, so it stays outside
          the step form. Nesting it would be invalid HTML, and the browser drops
          the inner form — turning Confirm into "advance past this step". */}
          {step === "confirm_evidence" ? (
            <div className="mt-6 space-y-4">
              <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                We found {view.cv.conceptCount} things we could match you on.
                Confirm the ones you actually want to be matched on. Nothing
                becomes active until you say so, and anything you leave
                unconfirmed is simply not used.
              </p>
              <ProfileEvidenceList
                evidence={view.evidence}
                readOnly={readOnly}
              />
            </div>
          ) : null}

          {/* One form per step: the answers post inside the same action that
          records the step, so nobody is advanced past a question whose answer
          was lost on the way. */}
          {step !== null && step !== "cv" ? (
            <form action={advance} className="mt-6 space-y-6">
              <input type="hidden" name="path" value={view.path} />
              <input type="hidden" name="step" value={step} />

              {step === "aspirations" ? (
                <>
                  <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                    Tell us the kind of work you want and the skills you have or
                    want to build. No experience is required: this is how
                    JobWarden helps people starting out or changing direction.
                  </p>
                  <ConceptListField
                    name="roleFamilies"
                    label="What kind of work are you aiming for?"
                    hint="Separate several with commas."
                    placeholder="Data analyst, business analyst"
                    defaultValue={view.answers.roleFamilies}
                  />
                  <ConceptListField
                    name="skillConcepts"
                    label="Skills you already have"
                    hint="Anything you would be comfortable being matched on today."
                    placeholder="SQL, Excel, stakeholder reporting"
                    defaultValue={view.answers.skillConcepts}
                  />
                  <ConceptListField
                    name="developingSkills"
                    label="Skills you want to build"
                    hint="Recorded as an aim. These are not claimed as experience you have."
                    placeholder="Python, dbt"
                    defaultValue={view.answers.developingSkills}
                  />
                  <SeniorityField defaultValue={view.answers.targetSeniority} />
                </>
              ) : null}

              {step === "preferences" ? (
                <>
                  <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                    Set what you will and will not take. These become filters on
                    your feed, shown in the address bar, that you can lift at
                    any time.
                  </p>
                  {/* The CV path never reaches the aspirations step, and confirmed
                  evidence says what someone has done, never what they want
                  next — so this path is asked here instead. */}
                  {view.path === "cv" ? (
                    <>
                      <ConceptListField
                        name="roleFamilies"
                        label="What kind of work are you aiming for?"
                        hint="Separate several with commas."
                        placeholder="Data analyst, business analyst"
                        defaultValue={view.answers.roleFamilies}
                      />
                      <SeniorityField
                        defaultValue={view.answers.targetSeniority}
                      />
                    </>
                  ) : null}
                  <EmploymentTypeField
                    selected={view.answers.employmentTypes}
                  />
                  <WorkingTimeField selected={view.answers.workingTimes} />
                  <WorkplaceField selected={view.answers.workplaceTypes} />
                  <Ir35Field selected={view.answers.ir35Statuses} />
                  <ConceptListField
                    name="ukLocations"
                    label="Where in the UK"
                    hint="Town, city, or region. Remote roles are never excluded by this."
                    placeholder="Manchester, Leeds"
                    defaultValue={view.answers.ukLocations}
                  />
                  <PayFloorField
                    minimum={view.answers.compensationMinimum}
                    period={view.answers.compensationPeriod}
                    allowUnknown={view.answers.allowUnknownCompensation}
                  />
                </>
              ) : null}

              {step === "notifications" ? (
                <>
                  <p className="max-w-prose text-sm leading-6 text-ink-secondary">
                    Two things you can turn on now or later. Both are off unless
                    you choose them.
                  </p>
                  <ChoiceField
                    name="notificationsEnabled"
                    title="Email me when genuinely new matches appear"
                    description="At most once per weekday slot, and never a repeat of a match you have already been sent. You can stop it from any email."
                    defaultChecked={view.answers.notificationsEnabled}
                  />
                  <ChoiceField
                    name="exploreEnabled"
                    title="Show me adjacent careers I already qualify for"
                    description="Pathways your confirmed skills substantially cover. Off by default, and it changes nothing about your matches."
                    defaultChecked={view.answers.exploreEnabled}
                  />
                </>
              ) : null}

              <Button
                type="submit"
                disabled={!view.canAdvance || advancePending}
              >
                {advancePending ? "Saving…" : "Save and continue"}
              </Button>
            </form>
          ) : null}

          {step === null ? (
            view.hasSignal ? (
              <p className="mt-6 max-w-prose text-sm leading-6 text-ink-secondary">
                That is everything. Finishing opens your hub, with the
                preferences you chose already shaping what JobWarden matches you
                to. Every one of them stays editable from your career profile.
              </p>
            ) : (
              <p
                role="alert"
                className="mt-6 max-w-prose text-sm leading-6 text-danger"
              >
                We still need something to match you on: a role you are aiming
                for, or a skill you want to be found for. Without one your feed
                would be empty, so go back and add at least one.
              </p>
            )
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {step === "cv" ? (
              <>
                {/* Offered only when a CV actually exists. Sending the user down
                the confirm path with nothing to confirm would be a dead end. */}
                {view.cv.present ? (
                  <form action={advance}>
                    {/* The path the CV itself implies, not the stored one. This
                    posted `view.path`, so a reader who had earlier chosen "I do
                    not have a CV yet" and then uploaded one was sent back down
                    the aspiration branch — the button said "continue with my
                    CV" and continued without it, past the confirmation step
                    where the extracted evidence lives, to a page asking them to
                    type it all in by hand. */}
                    <input
                      type="hidden"
                      name="path"
                      value={pathForOutcome(view.cvOutcome ?? "none")}
                    />
                    <input type="hidden" name="step" value="cv" />
                    <input
                      type="hidden"
                      name="cvOutcome"
                      value={view.cvOutcome ?? "none"}
                    />
                    {/* Disabled until the CV has actually been read. A document
                    row exists the moment the file lands, so this used to be
                    live while extraction was still running — pressing it then
                    carried the reader past their own CV before it had produced
                    anything to confirm. */}
                    <Button
                      type="submit"
                      disabled={
                        !view.canAdvance || advancePending || !view.cv.ready
                      }
                    >
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
                    disabled={!view.canAdvance || advancePending}
                  >
                    {view.cv.present
                      ? "I do not have a CV yet"
                      : "Continue without a CV"}
                  </Button>
                </form>
              </>
            ) : null}

            {step === null ? (
              <form action={complete}>
                <Button
                  type="submit"
                  disabled={
                    !view.canAdvance || completePending || !view.hasSignal
                  }
                >
                  {completePending ? "Finishing…" : "Finish and open my hub"}
                </Button>
              </form>
            ) : null}

            {/* Its own form: nesting it inside the step form would be invalid
            HTML and the browser would drop it, exactly as the evidence list
            comment above warns. `previousStep` is null on the first step and
            before a flow has started, so no control appears where there is
            nothing behind. The server recomputes the target from the reader's
            own state and ignores anything posted, so this cannot be used to
            jump to an arbitrary step. */}
            {previousStep !== null && !readOnly ? (
              <form action={goBack}>
                {/* `aria-label` rather than visually-hidden text. The accessible
                name algorithm trims each text node before joining them, so a
                leading space in a sibling span is lost and the button announced
                itself as "Backto What we read". The visible label stays short
                because the progress rail above already shows the reader where
                they are; the destination is announced because "Back" alone
                tells a screen-reader user nothing about where they will land. */}
                <Button
                  type="submit"
                  variant="ghost"
                  disabled={goBackPending}
                  aria-label={`Back to ${stepTitles[previousStep]}`}
                >
                  {goBackPending ? "Going back…" : "Back"}
                </Button>
              </form>
            ) : null}

            <ActionFeedback state={advanceState} />
            <ActionFeedback state={completeState} />
            <ActionFeedback state={goBackState} />
          </div>

          {readOnly ? (
            <p className="mt-6 text-sm text-ink-secondary">
              {view.canAdvance
                ? "A fictional walkthrough for review. Every step works, nothing is saved to a real account, and confirming evidence is switched off."
                : "This preview shows the onboarding flow with fictional data and cannot save progress."}
            </p>
          ) : null}
          {view.canAdvance && readOnly ? (
            <p className="mt-2">
              <a
                href="/development/journey?restart=1"
                className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-(--duration-quick) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Restart the walkthrough
              </a>
            </p>
          ) : null}
        </Enter>

        <p className="mt-10 text-xs text-ink-faint">
          Everything you choose here can be changed later from your career
          profile.{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            How JobWarden handles your data
          </Link>
        </p>
      </main>
    </div>
  );
}
