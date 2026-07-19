// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSupabaseExploreRepository,
  PathwayNotSuggestedError,
} from "./supabase-explore";

type QueryResponse = { data: unknown; error: unknown };

function evidenceRow(
  id: string,
  normalizedConcept: string,
  label: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    normalized_concept: normalizedConcept,
    label,
    category: "skill",
    origin: "cv",
    confidence: 0.9,
    evidence_reference: "character:1-3",
    evidence_excerpt: "Fictional evidence used in tests.",
    proficiency_signal: "working",
    last_used_at: null,
    confirmation_state: "confirmed",
    ...overrides,
  };
}

/**
 * Confirmed fictional evidence that lifts "product analytics implementation"
 * (weights 3+3+2+2 of 14 = 71%) above the threshold.
 */
function qualifyingEvidence() {
  return [
    evidenceRow(
      "61000000-0000-4000-8000-000000000001",
      "event instrumentation",
      "Event instrumentation",
    ),
    evidenceRow(
      "61000000-0000-4000-8000-000000000002",
      "analytics implementation",
      "Analytics implementation",
      { category: "responsibility" },
    ),
    evidenceRow(
      "61000000-0000-4000-8000-000000000003",
      "data quality governance",
      "Data quality and governance",
    ),
    evidenceRow(
      "61000000-0000-4000-8000-000000000004",
      "experimentation",
      "Experimentation",
    ),
  ];
}

function createFakeClient(
  options: {
    enabledRows?: unknown[];
    decisionRows?: unknown[];
    evidence?: unknown[];
    profile?: unknown;
    searches?: unknown[];
    rpcError?: unknown;
  } = {},
) {
  const settingsBuilder = {
    select: vi.fn().mockResolvedValue({
      data: options.enabledRows ?? [{ enabled: true }],
      error: null,
    } satisfies QueryResponse),
  };
  const decisionsBuilder = {
    select: vi.fn().mockResolvedValue({
      data: options.decisionRows ?? [],
      error: null,
    } satisfies QueryResponse),
  };

  const from = vi.fn((table: string) => {
    if (table === "career_explore_settings") return settingsBuilder;
    if (table === "career_pathway_decisions") return decisionsBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  const rpc = vi.fn(
    async (name: string, _parameters?: Record<string, unknown>) => {
      void _parameters;
      return rpcResult(name);
    },
  );

  async function rpcResult(name: string) {
    if (options.rpcError && name !== "get_career_profile_snapshot") {
      return { data: null, error: options.rpcError };
    }
    if (name === "get_career_profile_snapshot") {
      return {
        data: {
          generation: 4,
          profile: options.profile ?? null,
          evidence: options.evidence ?? qualifyingEvidence(),
          suggestions: [],
          searches: options.searches ?? [],
          cvs: [],
        },
        error: null,
      };
    }
    if (name === "set_explore_enabled") return { data: true, error: null };
    if (name === "decide_career_pathway") {
      return { data: "dismissed", error: null };
    }
    if (name === "save_search_profile") {
      return { data: "63000000-0000-4000-8000-000000000009", error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  }

  return { client: { from, rpc }, from, rpc, settingsBuilder };
}

describe("Supabase explore repository", () => {
  it("returns qualifying suggestions with decisions partitioned", async () => {
    const fake = createFakeClient({
      decisionRows: [
        {
          pathway_concept: "product analytics implementation",
          decision: "dismissed",
        },
      ],
    });

    const result = await createSupabaseExploreRepository(
      fake.client,
    ).getExplore();

    expect(result.enabled).toBe(true);
    expect(result.dataMode).toBe("supabase");
    expect(
      result.items.map((item) => item.suggestion.pathway.normalizedConcept),
    ).not.toContain("product analytics implementation");
    expect(result.dismissed).toHaveLength(1);
    expect(result.dismissed[0]?.decision).toBe("dismissed");
    expect(result.dismissed[0]?.suggestion.overlapPercent).toBe(71);
  });

  it("short-circuits with no suggestions while explore is disabled", async () => {
    const fake = createFakeClient({ enabledRows: [] });

    const result = await createSupabaseExploreRepository(
      fake.client,
    ).getExplore();

    expect(result.enabled).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.dismissed).toEqual([]);
  });

  it("excludes pathways covered by enabled saved searches", async () => {
    const fake = createFakeClient({
      searches: [
        {
          id: "63000000-0000-4000-8000-000000000001",
          name: "Product analytics",
          enabled: true,
          role_families: [
            {
              normalizedConcept: "product analytics implementation",
              label: "Product analytics implementation",
            },
          ],
          include_terms: [],
          exclude_terms: [],
          industries: [],
          domains: [],
          skill_concepts: [],
          responsibility_concepts: [],
          current_seniority: "senior",
          target_seniority: "unspecified",
          employment_types: [],
          working_times: [],
          workplace_types: [],
          uk_locations: [],
          ir35_statuses: [],
          compensation_minimum: null,
          compensation_maximum: null,
          compensation_period: "unknown",
          allow_unknown_compensation: true,
          recency_days: 30,
          notifications_enabled: false,
        },
      ],
    });

    const result = await createSupabaseExploreRepository(
      fake.client,
    ).getExplore();

    expect(
      result.items.map((item) => item.suggestion.pathway.normalizedConcept),
    ).not.toContain("product analytics implementation");
  });

  it("toggles explore through the owner-fenced RPC", async () => {
    const fake = createFakeClient();

    await createSupabaseExploreRepository(fake.client).setEnabled(true);

    expect(fake.rpc).toHaveBeenCalledWith("set_explore_enabled", {
      target_enabled: true,
    });
  });

  it("records dismissals through the pathway decision RPC", async () => {
    const fake = createFakeClient();

    await createSupabaseExploreRepository(fake.client).decide(
      "product analytics implementation",
      "dismissed",
    );

    expect(fake.rpc).toHaveBeenCalledWith("decide_career_pathway", {
      target_pathway_concept: "product analytics implementation",
      target_decision: "dismissed",
    });
  });

  it("rejects malformed pathway concepts before any RPC", async () => {
    const fake = createFakeClient();

    await expect(
      createSupabaseExploreRepository(fake.client).decide(
        "NOT a valid Concept!",
        "dismissed",
      ),
    ).rejects.toThrow();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("promotes a live suggestion into a named search then records the decision", async () => {
    const fake = createFakeClient();

    await createSupabaseExploreRepository(fake.client).promote(
      "product analytics implementation",
    );

    const rpcNames = fake.rpc.mock.calls.map(([name]) => name);
    const saveIndex = rpcNames.indexOf("save_search_profile");
    const decideIndex = rpcNames.indexOf("decide_career_pathway");
    expect(saveIndex).toBeGreaterThan(-1);
    expect(decideIndex).toBeGreaterThan(saveIndex);

    const saveCall = fake.rpc.mock.calls[saveIndex]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(saveCall.expected_generation).toBe(4);
    expect(saveCall.target_search_id).toBeNull();
    const draft = saveCall.draft_value as {
      name: string;
      roleFamilies: readonly { normalizedConcept: string }[];
    };
    expect(draft.name).toBe("Product analytics implementation");
    expect(draft.roleFamilies[0]?.normalizedConcept).toBe(
      "product analytics implementation",
    );

    const decideCall = fake.rpc.mock.calls[decideIndex]?.[1];
    expect(decideCall).toEqual({
      target_pathway_concept: "product analytics implementation",
      target_decision: "promoted",
    });
  });

  it("refuses to promote a pathway that is not currently suggested", async () => {
    const fake = createFakeClient({ evidence: [] });

    await expect(
      createSupabaseExploreRepository(fake.client).promote(
        "product analytics implementation",
      ),
    ).rejects.toBeInstanceOf(PathwayNotSuggestedError);
    expect(fake.rpc.mock.calls.map(([name]) => name)).not.toContain(
      "save_search_profile",
    );
  });

  it("sanitises decision failures", async () => {
    const fake = createFakeClient({ rpcError: { message: "boom" } });

    await expect(
      createSupabaseExploreRepository(fake.client).decide(
        "product analytics implementation",
        "dismissed",
      ),
    ).rejects.toThrow("Unable to update pathway decision");
  });
});
