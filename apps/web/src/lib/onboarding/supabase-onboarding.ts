import "server-only";

import {
  classifyCvOutcome,
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
            .select("path, completed_steps, cv_outcome, completed_at")
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

        const confirmable = snapshot.evidence.filter(
          (item) => item.confirmationState !== "rejected",
        ).length;
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
          dataMode: snapshot.dataMode,
        };
      } catch {
        throw new Error("Unable to load onboarding");
      }
    },

    async advance({ path, step, cvOutcome }) {
      const targetPath = z.enum(onboardingPaths).parse(path);
      const targetStep = z.enum(onboardingSteps).parse(step);
      if (!stepsForPath(targetPath).includes(targetStep)) {
        throw new Error("Unable to save onboarding progress");
      }

      try {
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

    async complete() {
      try {
        // The database re-checks that every step of the chosen path is present,
        // so this cannot be the thing that unlocks the hub on its own.
        data(await supabaseClient.rpc("complete_onboarding"));
      } catch {
        throw new Error("Unable to finish onboarding");
      }
    },
  };
}
