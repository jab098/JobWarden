"use client";

import { useActionState } from "react";
import Link from "next/link";

import { stepsForPath, type OnboardingStep } from "@jobwarden/domain";
import {
  advanceOnboardingAction,
  completeOnboardingAction,
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
import { CvUploadCard } from "@/components/profile/cv-upload-card";
import { ProfileEvidenceList } from "@/components/profile/profile-evidence-list";
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
          <div className="max-w-prose">
            <CvUploadCard
              capability={view.uploadCapability}
              generation={view.generation}
              hasCurrentCv={view.cv.present}
            />
          </div>
          <p className="max-w-prose text-sm leading-6 text-[#596173]">
            You can also skip this and tell us what you are looking for instead.
            A CV can be added from your profile at any time.
          </p>
        </div>
      ) : null}

      {/* The evidence list posts its own decision per item, so it stays outside
          the step form. Nesting it would be invalid HTML, and the browser drops
          the inner form — turning Confirm into "advance past this step". */}
      {step === "confirm_evidence" ? (
        <div className="mt-6 space-y-4">
          <p className="max-w-prose text-sm leading-6 text-[#596173]">
            We found {view.cv.conceptCount} things we could match you on.
            Confirm the ones you actually want to be matched on — nothing
            becomes active until you say so, and anything you leave unconfirmed
            is simply not used.
          </p>
          <ProfileEvidenceList evidence={view.evidence} readOnly={readOnly} />
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
              <p className="max-w-prose text-sm leading-6 text-[#596173]">
                Tell us the kind of work you want and the skills you have or
                want to build. No experience is required: this is how JobWarden
                helps people starting out or changing direction.
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
              <p className="max-w-prose text-sm leading-6 text-[#596173]">
                Set what you will and will not take. These become filters on
                your feed, shown in the address bar, that you can lift at any
                time.
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
                  <SeniorityField defaultValue={view.answers.targetSeniority} />
                </>
              ) : null}
              <EmploymentTypeField selected={view.answers.employmentTypes} />
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
              <p className="max-w-prose text-sm leading-6 text-[#596173]">
                Two things you can turn on now or later. Both are off unless you
                choose them.
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

          <Button type="submit" disabled={readOnly || advancePending}>
            {advancePending ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      ) : null}

      {step === null ? (
        view.hasSignal ? (
          <p className="mt-6 max-w-prose text-sm leading-6 text-[#596173]">
            That is everything. Finishing opens your hub, with the preferences
            you chose already shaping what JobWarden matches you to. Every one
            of them stays editable from your career profile.
          </p>
        ) : (
          <p
            role="alert"
            className="mt-6 max-w-prose text-sm leading-6 text-[#8a3328]"
          >
            We still need something to match you on — a role you are aiming for,
            or a skill you want to be found for. Without one your feed would be
            empty, so go back and add at least one.
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

        {step === null ? (
          <form action={complete}>
            <Button
              type="submit"
              disabled={readOnly || completePending || !view.hasSignal}
            >
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
