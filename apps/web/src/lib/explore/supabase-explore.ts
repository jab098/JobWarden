import "server-only";

import {
  evaluateExplorePathways,
  normalizedConceptSchema,
} from "@jobwarden/domain";
import { z } from "zod";

import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";
import type { ProfileSnapshot } from "@/lib/profile/types";

import { buildPromotedSearchDraft } from "./promoted-search";
import type { ExploreRepository } from "./repository";
import type {
  ExploreResult,
  ExploreSuggestionItem,
  PathwayDecision,
} from "./types";

export class PathwayNotSuggestedError extends Error {
  constructor() {
    super("This pathway is not currently suggested.");
    this.name = "PathwayNotSuggestedError";
  }
}

const settingsRowSchema = z.object({ enabled: z.boolean() });

const decisionRowSchema = z.object({
  pathway_concept: normalizedConceptSchema,
  decision: z.enum(["dismissed", "promoted"]),
});

type QueryResponse = { data: unknown; error: unknown };

type SelectQuery = { select(columns: string): Promise<QueryResponse> };

type ExploreClient = {
  from(
    table: "career_explore_settings" | "career_pathway_decisions",
  ): SelectQuery;
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
 * Active target role families are the career draft's target families plus
 * every enabled saved search's role families; qualifying pathways must sit
 * outside all of them.
 */
function activeTargetRoleFamilies(
  snapshot: Pick<ProfileSnapshot, "draft" | "searches">,
): readonly string[] {
  return [
    ...(snapshot.draft?.targetRoleFamilies ?? []).map(
      (family) => family.normalizedConcept,
    ),
    ...snapshot.searches
      .filter((search) => search.enabled)
      .flatMap((search) =>
        search.roleFamilies.map((family) => family.normalizedConcept),
      ),
  ];
}

/**
 * Pure, side-effect-free explore builder shared by every data source. The
 * deterministic domain evaluator always runs here — data sources only supply
 * the profile snapshot, the opt-in flag, and prior decisions.
 */
export function buildExploreResult(input: {
  enabled: boolean;
  snapshot: Pick<ProfileSnapshot, "draft" | "evidence" | "searches">;
  decisions: ReadonlyMap<string, PathwayDecision>;
  dataMode: "supabase" | "fixtures";
}): ExploreResult {
  if (!input.enabled) {
    return {
      enabled: false,
      items: [],
      dismissed: [],
      dataMode: input.dataMode,
    };
  }

  const suggestions = evaluateExplorePathways(
    input.snapshot.evidence,
    activeTargetRoleFamilies(input.snapshot),
  );

  const items: ExploreSuggestionItem[] = [];
  const dismissed: ExploreSuggestionItem[] = [];
  for (const suggestion of suggestions) {
    const decision =
      input.decisions.get(suggestion.pathway.normalizedConcept) ?? null;
    if (decision === "dismissed") {
      dismissed.push({ suggestion, decision });
    } else {
      items.push({ suggestion, decision });
    }
  }

  return { enabled: true, items, dismissed, dataMode: input.dataMode };
}

export function createSupabaseExploreRepository(
  client: object,
): ExploreRepository {
  const supabaseClient = client as ExploreClient;
  const profileRepository = createSupabaseProfileRepository(client);

  async function readEnabled(): Promise<boolean> {
    const rows = z
      .array(settingsRowSchema)
      .parse(
        data(
          await supabaseClient
            .from("career_explore_settings")
            .select("enabled"),
        ),
      );
    return rows[0]?.enabled ?? false;
  }

  async function readDecisions(): Promise<Map<string, PathwayDecision>> {
    const decisionRows = z
      .array(decisionRowSchema)
      .parse(
        data(
          await supabaseClient
            .from("career_pathway_decisions")
            .select("pathway_concept,decision"),
        ),
      );
    return new Map<string, PathwayDecision>(
      decisionRows.map((row) => [row.pathway_concept, row.decision]),
    );
  }

  const disabledResult: ExploreResult = {
    enabled: false,
    items: [],
    dismissed: [],
    dataMode: "supabase",
  };

  /**
   * The opt-in check runs first so a user who never enabled Explore pays no
   * snapshot cost; the enabled path fetches the snapshot and decisions in
   * parallel.
   */
  async function loadEnabledSuggestions(): Promise<{
    snapshot: ProfileSnapshot;
    result: ExploreResult;
  } | null> {
    if (!(await readEnabled())) return null;

    const [snapshot, decisions] = await Promise.all([
      profileRepository.getSnapshot(),
      readDecisions(),
    ]);
    return {
      snapshot,
      result: buildExploreResult({
        enabled: true,
        snapshot,
        decisions,
        dataMode: "supabase",
      }),
    };
  }

  return {
    async getExplore() {
      try {
        return (await loadEnabledSuggestions())?.result ?? disabledResult;
      } catch {
        throw new Error("Unable to load explore pathways");
      }
    },

    async setEnabled(enabled) {
      const targetEnabled = z.boolean().parse(enabled);
      try {
        data(
          await supabaseClient.rpc("set_explore_enabled", {
            target_enabled: targetEnabled,
          }),
        );
      } catch {
        throw new Error("Unable to update explore setting");
      }
    },

    async decide(pathwayConcept, decision) {
      const targetConcept = normalizedConceptSchema.parse(pathwayConcept);
      const targetDecision = z.enum(["dismissed", "clear"]).parse(decision);
      try {
        data(
          await supabaseClient.rpc("decide_career_pathway", {
            target_pathway_concept: targetConcept,
            target_decision: targetDecision,
          }),
        );
      } catch {
        throw new Error("Unable to update pathway decision");
      }
    },

    async promote(pathwayConcept) {
      const targetConcept = normalizedConceptSchema.parse(pathwayConcept);

      const loaded = await loadEnabledSuggestions();
      if (!loaded) throw new PathwayNotSuggestedError();
      const { snapshot, result } = loaded;
      const item = [...result.items, ...result.dismissed].find(
        (candidate) =>
          candidate.suggestion.pathway.normalizedConcept === targetConcept,
      );
      if (!item) throw new PathwayNotSuggestedError();

      // Idempotency: if a saved search already targets this role family
      // (necessarily disabled, or the pathway would not be suggested),
      // re-enable it instead of creating a duplicate.
      const existingSearch = snapshot.searches.find((search) =>
        search.roleFamilies.some(
          (family) =>
            family.normalizedConcept.trim().toLowerCase() === targetConcept,
        ),
      );
      if (existingSearch) {
        const { id, ...existingDraft } = existingSearch;
        await profileRepository.saveSearch(snapshot.generation, id, {
          ...existingDraft,
          enabled: true,
        });
      } else {
        const draft = buildPromotedSearchDraft(item.suggestion, snapshot.draft);
        await profileRepository.saveSearch(snapshot.generation, null, draft);
      }
      try {
        data(
          await supabaseClient.rpc("decide_career_pathway", {
            target_pathway_concept: targetConcept,
            target_decision: "promoted",
          }),
        );
      } catch {
        throw new Error("Unable to record pathway promotion");
      }
    },
  };
}
