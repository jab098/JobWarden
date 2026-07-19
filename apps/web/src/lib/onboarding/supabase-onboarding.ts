import "server-only";

import {
  buildFirstRunFilters,
  buildSearchProfileFromAnswers,
  classifyCvOutcome,
  hasSearchSignal,
  parseOnboardingAnswers,
  isOnboardingComplete,
  nextOnboardingStep,
  onboardingPaths,
  onboardingSteps,
  parseOnboardingState,
  pathForOutcome,
  stepsForPath,
  type CvOutcome,
} from "@jobwarden/domain";
import { z } from "zod";

import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";

import type { OnboardingRepository } from "./repository";
import type { OnboardingView } from "./types";

const stateRowSchema = z.object({
  path: z.enum(onboardingPaths),
  completed_steps: z.array(z.enum(onboardingSteps)),
  cv_outcome: z
    .enum(["rich", "rich_pdf_only", "thin", "failed", "none"])
    .nullable(),
  completed_at: z.string().nullable(),
  answers: z.unknown().optional(),
});

type QueryResponse = { data: unknown; error: unknown };

type OnboardingClient = {
  from(table: string): {
    select(columns: string): { maybeSingle(): Promise<QueryResponse> };
  };
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
};

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new Error("query failed");
  }
  return response.data;
}

/**
 * The SQL path vocabulary is duplicated in the migration so the database can
 * refuse an incomplete completion on its own. This test-covered constant keeps
 * the two in lockstep.
 */
export const sqlOnboardingSteps = {
  cv: ["cv", "confirm_evidence", "preferences", "notifications", "review"],
  aspiration: ["cv", "aspirations", "preferences", "notifications", "review"],
} as const;

export function createSupabaseOnboardingRepository(
  client: object,
): OnboardingRepository {
  const supabaseClient = client as OnboardingClient;
  const profileRepository = createSupabaseProfileRepository(client);

  return {
    async getView(): Promise<OnboardingView> {
      try {
        const [stateResponse, snapshot] = await Promise.all([
          supabaseClient
            .from("career_onboarding_state")
            .select("path, completed_steps, cv_outcome, completed_at, answers")
            .maybeSingle(),
          profileRepository.getSnapshot(),
        ]);

        const row = stateRowSchema
          .nullable()
          .parse(data(stateResponse) ?? null);
        const state = parseOnboardingState(
          row === null
            ? null
            : {
                path: row.path,
                completedSteps: row.completed_steps,
                completedAt: row.completed_at,
              },
        );

        const confirmableEvidence = snapshot.evidence.filter(
          (item) => item.confirmationState !== "rejected",
        );
        const confirmable = confirmableEvidence.length;
        const answers = parseOnboardingAnswers(row?.answers);
        const confirmedEvidence = snapshot.evidence.filter(
          (item) => item.confirmationState === "confirmed",
        );
        const cv = snapshot.currentCv;
        // Recomputed from the live profile rather than trusted from the stored
        // outcome, so replacing a CV moves the user onto the right path.
        const cvOutcome: CvOutcome = classifyCvOutcome({
          parsed: cv !== null && cv.lifecycleStatus === "ready",
          confirmableConceptCount: confirmable,
          cvKind: cv?.kind ?? null,
        });

        return {
          state,
          currentStep: nextOnboardingStep(state),
          path: state?.path ?? pathForOutcome(cvOutcome),
          // The freshly computed outcome, not the stored one. On a first visit
          // no row exists yet, and the stored value would leave the user with
          // no explanation of what happened to their CV.
          cvOutcome,
          cv: {
            present: cv !== null,
            kind: cv?.kind ?? null,
            conceptCount: confirmable,
          },
          complete: isOnboardingComplete(state),
          answers,
          evidence: confirmableEvidence,
          hasSignal: hasSearchSignal({ answers, confirmedEvidence }),
          dataMode: snapshot.dataMode,
        };
      } catch {
        throw new Error("Unable to load onboarding");
      }
    },

    async advance({ path, step, cvOutcome, answers }) {
      const targetPath = z.enum(onboardingPaths).parse(path);
      const targetStep = z.enum(onboardingSteps).parse(step);
      if (!stepsForPath(targetPath).includes(targetStep)) {
        throw new Error("Unable to save onboarding progress");
      }

      try {
        // Answers first: if the step is recorded but the answers are lost, the
        // user is advanced past a question they would then have to re-answer.
        if (answers !== undefined) {
          data(
            await supabaseClient.rpc("save_onboarding_answers", {
              answers_value: answers,
            }),
          );
        }
        data(
          await supabaseClient.rpc("advance_onboarding", {
            target_path: targetPath,
            target_step: targetStep,
            target_cv_outcome: cvOutcome,
          }),
        );
      } catch {
        throw new Error("Unable to save onboarding progress");
      }
    },

    async finish() {
      const view = await this.getView();
      if (!view.hasSignal) {
        // Completing with nothing to match on would hand the user the empty
        // feed this whole flow exists to prevent.
        throw new Error("Unable to finish onboarding");
      }

      const confirmedEvidence = view.evidence.filter(
        (item) => item.confirmationState === "confirmed",
      );
      // Read the live generation rather than assuming a fresh account: another
      // tab, or a deletion, may have advanced it since onboarding started.
      const { generation } = await profileRepository.getSnapshot();

      try {
        // The search profile is written before completion, so a failure here
        // leaves the user inside onboarding rather than in a gated-open hub
        // with nothing configured.
        const draft = buildSearchProfileFromAnswers({
          answers: view.answers,
          confirmedEvidence,
          name: "My first search",
        });
        data(
          await supabaseClient.rpc("save_search_profile", {
            target_search_id: null,
            expected_generation: generation,
            draft_value: draft,
          }),
        );
        data(
          await supabaseClient.rpc("set_career_notification_settings", {
            target_enabled: view.answers.notificationsEnabled ?? false,
          }),
        );
        data(
          await supabaseClient.rpc("set_explore_enabled", {
            target_enabled: view.answers.exploreEnabled ?? false,
          }),
        );
        data(await supabaseClient.rpc("complete_onboarding"));
      } catch {
        throw new Error("Unable to finish onboarding");
      }

      return { filters: buildFirstRunFilters(view.answers) };
    },
  };
}
