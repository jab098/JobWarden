// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseTargetFeedRepository } from "./supabase-target-feed";

type QueryResponse = { data: unknown; error: unknown };

const emptyCompensation = {
  compensation_minimum: null,
  compensation_maximum: null,
  compensation_period: "unknown",
  allow_unknown_compensation: true,
};

function searchRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "63000000-0000-4000-8000-000000000001",
    name: "Implementation leadership",
    enabled: true,
    role_families: [],
    include_terms: [],
    exclude_terms: [],
    industries: [],
    domains: [],
    skill_concepts: ["sql"],
    responsibility_concepts: [],
    current_seniority: "senior",
    target_seniority: "unspecified",
    employment_types: ["permanent"],
    working_times: ["full_time"],
    workplace_types: ["remote"],
    uk_locations: [],
    ir35_statuses: ["not_applicable"],
    ...emptyCompensation,
    recency_days: 30,
    notifications_enabled: false,
    ...overrides,
  };
}

function jobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "0d74a055-d0e6-4f50-a77a-9c8fd8543af3",
    title: "Platform Engineer",
    employer: "Fictional Northstar Tools UK Ltd",
    employment_type: "permanent",
    working_time: "full_time",
    workplace_type: "remote",
    ir35_status: "not_applicable",
    compensation_minimum: null,
    compensation_maximum: null,
    compensation_currency: null,
    compensation_period: "unknown",
    compensation_provenance: "unknown",
    posted_at: "2026-07-15T09:00:00.000Z",
    closes_at: null,
    description_text: "A fictional remote platform role using SQL daily.",
    job_locations: [{ raw_location: "Remote within the United Kingdom" }],
    ...overrides,
  };
}

function confirmedEvidenceRow() {
  return {
    id: "61000000-0000-4000-8000-000000000001",
    normalized_concept: "sql",
    label: "SQL",
    category: "tool",
    origin: "cv",
    confidence: 0.9,
    evidence_reference: "character:1-3",
    evidence_excerpt: "Fictional evidence: used SQL daily.",
    proficiency_signal: "demonstrated",
    last_used_at: null,
    confirmation_state: "confirmed",
  };
}

function profileRow() {
  return {
    current_seniority: "senior",
    target_seniority: "lead",
    target_role_families: [
      {
        normalizedConcept: "platform engineering",
        label: "Platform engineering",
      },
    ],
    industries: [],
    domains: [],
    keywords: [],
  };
}

function createFakeClient(options: {
  searches?: unknown[];
  evidence?: unknown[];
  profile?: unknown;
  jobsResponse?: QueryResponse;
  decisionsResponse?: QueryResponse;
  mutedResponse?: QueryResponse;
  rpcResponse?: QueryResponse;
}) {
  const jobsResponse = options.jobsResponse ?? {
    data: [jobRow()],
    error: null,
  };
  const decisionsResponse = options.decisionsResponse ?? {
    data: [],
    error: null,
  };
  const mutedResponse = options.mutedResponse ?? {
    data: [],
    error: null,
  };

  const candidateBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(jobsResponse),
  };
  candidateBuilder.select.mockReturnValue(candidateBuilder);
  candidateBuilder.eq.mockReturnValue(candidateBuilder);
  candidateBuilder.in.mockReturnValue(candidateBuilder);
  candidateBuilder.order.mockReturnValue(candidateBuilder);

  const decisionBuilder = {
    select: vi.fn().mockResolvedValue(decisionsResponse),
  };

  const mutedBuilder = {
    select: vi.fn().mockResolvedValue(mutedResponse),
  };

  const from = vi.fn((table: string) => {
    if (table === "jobs") return candidateBuilder;
    if (table === "career_job_decisions") return decisionBuilder;
    if (table === "career_muted_employers") return mutedBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  const rpc = vi.fn(async (name: string) => {
    if (name === "decide_career_job") {
      return options.rpcResponse ?? { data: "saved", error: null };
    }
    if (name === "get_career_profile_snapshot") {
      return {
        data: {
          generation: 1,
          profile: options.profile ?? null,
          evidence: options.evidence ?? [],
          suggestions: [],
          searches: options.searches ?? [searchRow()],
          cvs: [],
        },
        error: null,
      };
    }
    throw new Error(`unexpected rpc ${name}`);
  });

  return {
    client: { from, rpc },
    candidateBuilder,
    decisionBuilder,
    from,
    rpc,
  };
}

describe("Supabase target-feed repository", () => {
  it("pushes allow-list filters down to SQL only when every enabled profile constrains them identically", async () => {
    const fake = createFakeClient({
      searches: [
        searchRow({
          id: "63000000-0000-4000-8000-000000000001",
          employment_types: ["permanent"],
        }),
        searchRow({
          id: "63000000-0000-4000-8000-000000000002",
          employment_types: ["permanent"],
        }),
      ],
    });

    await createSupabaseTargetFeedRepository(fake.client).getFeed({
      includeDismissed: false,
    });

    expect(fake.candidateBuilder.select.mock.calls[0]?.[0]).toContain(
      "description_text",
    );
    expect(fake.candidateBuilder.in).toHaveBeenCalledWith("employment_type", [
      "permanent",
      "unknown",
    ]);
    expect(fake.candidateBuilder.in).toHaveBeenCalledWith("working_time", [
      "full_time",
      "unknown",
    ]);
    expect(fake.candidateBuilder.limit).toHaveBeenCalledWith(200);
    expect(fake.candidateBuilder.order.mock.calls).toEqual([
      ["posted_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("skips pushdown for a field when enabled profiles differ or leave it unconstrained", async () => {
    const fake = createFakeClient({
      searches: [
        searchRow({
          id: "63000000-0000-4000-8000-000000000001",
          employment_types: ["permanent"],
        }),
        searchRow({
          id: "63000000-0000-4000-8000-000000000002",
          employment_types: ["contract"],
        }),
        // working_times identical below but workplace_types left empty on one profile
      ],
    });
    fake.candidateBuilder.limit.mockResolvedValue({ data: [], error: null });

    await createSupabaseTargetFeedRepository(fake.client).getFeed({
      includeDismissed: false,
    });

    const employmentPushdown = fake.candidateBuilder.in.mock.calls.some(
      (call) => call[0] === "employment_type",
    );
    expect(employmentPushdown).toBe(false);
  });

  it("re-applies the domain gate in memory regardless of pushdown, so a location mismatch always excludes", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ uk_locations: ["London"] })],
      jobsResponse: {
        data: [
          jobRow({
            workplace_type: "onsite",
            job_locations: [{ raw_location: "Manchester, England" }],
          }),
        ],
        error: null,
      },
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });

    expect(result.items).toEqual([]);
  });

  it("keeps the highest-scoring explanation when several enabled profiles match the same job", async () => {
    const fake = createFakeClient({
      searches: [
        searchRow({
          id: "63000000-0000-4000-8000-000000000001",
          name: "Low match",
          skill_concepts: ["excel"],
        }),
        searchRow({
          id: "63000000-0000-4000-8000-000000000002",
          name: "High match",
          skill_concepts: ["sql"],
          responsibility_concepts: ["platform engineering"],
        }),
      ],
      jobsResponse: {
        data: [
          jobRow({
            description_text:
              "A fictional remote platform engineering role using SQL daily.",
          }),
        ],
        error: null,
      },
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.explanation.profileName).toBe("High match");
  });

  it("gates relevance per profile, so a higher-scoring irrelevant profile does not suppress an aspiration profile that would surface the job", async () => {
    const fake = createFakeClient({
      searches: [
        // Scores higher (one weak skill hit + free points) but fails the
        // relevance gate: 1 of 5 skills is below the core floor.
        searchRow({
          id: "63000000-0000-4000-8000-000000000001",
          name: "Niche",
          skill_concepts: ["sql", "python", "rust", "golang", "elixir"],
        }),
        // Aspiration-only: a target role family but no skills or
        // responsibilities, so it is exempt and should still surface the job.
        // Were relevance applied only to the top scorer, the Niche profile's
        // failure would wrongly drop the job entirely.
        searchRow({
          id: "63000000-0000-4000-8000-000000000002",
          name: "Exploring",
          role_families: [
            {
              normalizedConcept: "analytics leadership",
              label: "Analytics leadership",
            },
          ],
          skill_concepts: [],
          responsibility_concepts: [],
        }),
      ],
      jobsResponse: {
        data: [
          jobRow({ description_text: "A fictional remote role using SQL." }),
        ],
        error: null,
      },
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.explanation.profileName).toBe("Exploring");
  });

  it("sorts by score desc, then postedAt desc, then id, within the 200 candidate cap", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ skill_concepts: ["sql"] })],
      jobsResponse: {
        data: [
          jobRow({
            id: "00000000-0000-4000-8000-000000000001",
            posted_at: "2026-07-10T09:00:00.000Z",
            closes_at: null,
            // Both match the profile's SQL skill (so both clear the relevance
            // gate); the older one sorts second on the recency tie-break.
            description_text: "A fictional older role using SQL daily.",
          }),
          jobRow({
            id: "00000000-0000-4000-8000-000000000002",
            posted_at: "2026-07-16T09:00:00.000Z",
            closes_at: null,
            description_text: "A fictional role using SQL daily.",
          }),
        ],
        error: null,
      },
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });

    expect(result.items.map((item) => item.job.id)).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("excludes dismissed jobs unless includeDismissed is requested", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ skill_concepts: ["sql"] })],
      decisionsResponse: {
        data: [{ job_id: jobRow().id, decision: "dismissed" }],
        error: null,
      },
    });

    const hidden = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });
    expect(hidden.items).toEqual([]);

    const shown = await createSupabaseTargetFeedRepository(fake.client).getFeed(
      { includeDismissed: true },
    );
    expect(shown.items).toHaveLength(1);
    expect(shown.items[0]?.decision).toBe("dismissed");
  });

  it("hides every listing from a muted employer and reports the mute", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ skill_concepts: ["sql"] })],
      mutedResponse: {
        data: [{ employer: "Fictional Northstar Tools UK Ltd" }],
        error: null,
      },
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: true });

    // The candidate would otherwise score and appear; the mute removes it.
    expect(result.items).toEqual([]);
    expect(result.mutedEmployers).toEqual(["Fictional Northstar Tools UK Ltd"]);
  });

  it("produces deterministic results across repeated calls with no AI involved", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ skill_concepts: ["sql"] })],
    });

    const repository = createSupabaseTargetFeedRepository(fake.client);
    const first = await repository.getFeed({ includeDismissed: false });
    const second = await repository.getFeed({ includeDismissed: false });

    expect(first).toEqual(second);
  });

  it.each([
    { label: "with a saved profile row", profile: profileRow() },
    { label: "without a saved profile row", profile: null },
  ])("feeds confirmed evidence into the scorer $label", async ({ profile }) => {
    // Search relies solely on evidence for the skills component.
    const evidenceOnlySearch = searchRow({
      skill_concepts: [],
      include_terms: ["implementation"],
    });

    const withEvidence = await createSupabaseTargetFeedRepository(
      createFakeClient({
        searches: [evidenceOnlySearch],
        evidence: [confirmedEvidenceRow()],
        profile,
      }).client,
    ).getFeed({ includeDismissed: false });

    const withoutEvidence = await createSupabaseTargetFeedRepository(
      createFakeClient({
        searches: [evidenceOnlySearch],
        evidence: [],
        profile,
      }).client,
    ).getFeed({ includeDismissed: false });

    expect(withEvidence.items[0]?.explanation.score ?? 0).toBeGreaterThan(
      withoutEvidence.items[0]?.explanation.score ?? 0,
    );
    expect(withEvidence.items[0]?.explanation.matchedEvidence).toContain("SQL");
  });

  it("ignores unconfirmed evidence when scoring", async () => {
    const evidenceOnlySearch = searchRow({
      skill_concepts: [],
      include_terms: ["implementation"],
    });

    const result = await createSupabaseTargetFeedRepository(
      createFakeClient({
        searches: [evidenceOnlySearch],
        evidence: [
          { ...confirmedEvidenceRow(), confirmation_state: "proposed" },
        ],
      }).client,
    ).getFeed({ includeDismissed: false });

    expect(result.items[0]?.explanation.matchedEvidence).toEqual([]);
  });

  it("returns an empty feed without querying jobs when no search profile is enabled", async () => {
    const fake = createFakeClient({
      searches: [searchRow({ enabled: false })],
    });

    const result = await createSupabaseTargetFeedRepository(
      fake.client,
    ).getFeed({ includeDismissed: false });

    expect(result).toEqual({
      items: [],
      enabledProfileNames: [],
      mutedEmployers: [],
      candidateCap: 200,
      dataMode: "supabase",
    });
    expect(fake.from).not.toHaveBeenCalledWith("jobs");
  });

  it("uses a generic error boundary when the jobs query fails", async () => {
    const fake = createFakeClient({
      jobsResponse: { data: null, error: { message: "secret detail" } },
    });

    await expect(
      createSupabaseTargetFeedRepository(fake.client).getFeed({
        includeDismissed: false,
      }),
    ).rejects.toThrow("Unable to load target feed");
  });

  it("validates and forwards decision RPC calls, including clear", async () => {
    const fake = createFakeClient({});

    await createSupabaseTargetFeedRepository(fake.client).decide(
      jobRow().id,
      "saved",
    );
    expect(fake.rpc).toHaveBeenCalledWith("decide_career_job", {
      target_job_id: jobRow().id,
      target_decision: "saved",
    });

    await createSupabaseTargetFeedRepository(fake.client).decide(
      jobRow().id,
      "clear",
    );
    expect(fake.rpc).toHaveBeenLastCalledWith("decide_career_job", {
      target_job_id: jobRow().id,
      target_decision: "clear",
    });

    await expect(
      createSupabaseTargetFeedRepository(fake.client).decide(
        "not-a-uuid",
        "saved",
      ),
    ).rejects.toThrow();
  });

  it("uses a generic error boundary when the decision RPC fails", async () => {
    const fake = createFakeClient({
      rpcResponse: { data: null, error: { message: "secret detail" } },
    });

    await expect(
      createSupabaseTargetFeedRepository(fake.client).decide(
        jobRow().id,
        "saved",
      ),
    ).rejects.toThrow("Unable to update job decision");
  });
});
