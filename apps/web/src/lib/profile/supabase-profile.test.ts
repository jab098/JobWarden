// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseProfileRepository } from "./supabase-profile";

const profileRow = {
  current_seniority: "senior",
  target_seniority: "lead",
  target_role_families: [
    {
      normalizedConcept: "analytics implementation consulting",
      label: "Analytics implementation consulting",
    },
  ],
  industries: [],
  domains: [{ normalizedConcept: "martech", label: "Marketing technology" }],
  keywords: ["measurement strategy"],
};
type TestQueryResponse = { data: unknown; error: unknown };

function client(
  overrides: Partial<Record<string, unknown[]>> = {},
  snapshotOverrides: Record<string, unknown> = {},
) {
  const responses: Record<string, unknown[]> = {
    career_profile_generations: [{ generation: 7 }],
    career_profiles: [profileRow],
    career_evidence_items: [],
    profile_suggestions: [],
    search_profiles: [],
    cv_documents: [],
    ...overrides,
  };
  const builders: Record<
    string,
    {
      select: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      then: Promise<TestQueryResponse>["then"];
    }
  > = {};
  const from = vi.fn((table: string) => {
    const response: Promise<TestQueryResponse> = Promise.resolve({
      data: responses[table],
      error: null,
    });
    const builder = {
      select: vi.fn(),
      order: vi.fn(),
      then: response.then.bind(response),
    };
    builder.select.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builders[table] = builder;
    return builder;
  });
  const rpc = vi.fn(
    async (name: string): Promise<{ data: unknown; error: unknown }> => ({
      data:
        name === "get_career_profile_snapshot"
          ? {
              generation: responses.career_profile_generations?.[0]
                ? (
                    responses.career_profile_generations[0] as {
                      generation: number;
                    }
                  ).generation
                : 0,
              profile: responses.career_profiles?.[0] ?? null,
              evidence: responses.career_evidence_items ?? [],
              suggestions: responses.profile_suggestions ?? [],
              searches: responses.search_profiles ?? [],
              cvs: responses.cv_documents ?? [],
              ...snapshotOverrides,
            }
          : null,
      error: null,
    }),
  );
  const remove = vi.fn<(paths: string[]) => Promise<TestQueryResponse>>(
    async () => ({ data: [], error: null }),
  );
  const list = vi.fn<
    (
      prefix: string,
      options?: { offset?: number },
    ) => Promise<TestQueryResponse>
  >(async (_prefix: string, options?: { offset?: number }) => ({
    data: options?.offset === 0 ? [] : [],
    error: null,
  }));
  const getUser = vi.fn(async () => ({
    data: { user: { id: "40000000-0000-4000-8000-000000000001" } },
    error: null,
  }));
  return {
    from,
    builders,
    rpc,
    remove,
    list,
    getUser,
    client: {
      from,
      rpc,
      auth: { getUser },
      storage: { from: vi.fn(() => ({ list, remove })) },
    },
  };
}

describe("caller-bound Supabase career profile repository", () => {
  it("opens the upload control only when the server says uploads are open", async () => {
    const open = await createSupabaseProfileRepository(
      client({}, { uploadsEnabled: true }).client,
    ).getSnapshot();
    expect(open.uploadCapability).toEqual({ enabled: true });

    const closed = await createSupabaseProfileRepository(
      client({}, { uploadsEnabled: false }).client,
    ).getSnapshot();
    expect(closed.uploadCapability).toEqual({
      enabled: false,
      reason: "uploads_disabled",
    });
  });

  it("keeps uploads closed against a database that does not report the flag", async () => {
    // An older database has no `uploadsEnabled` key. Offering an upload the
    // Storage policy would then refuse is worse than offering none.
    const snapshot = await createSupabaseProfileRepository(
      client().client,
    ).getSnapshot();
    expect(snapshot.uploadCapability).toEqual({
      enabled: false,
      reason: "uploads_disabled",
    });
  });

  it("builds a strict owner snapshot from one transactionally consistent RPC", async () => {
    const fake = client();
    const snapshot = await createSupabaseProfileRepository(
      fake.client,
    ).getSnapshot();

    expect(snapshot.dataMode).toBe("supabase");
    expect(snapshot.generation).toBe(7);
    expect(snapshot.draft).toMatchObject({
      currentSeniority: "senior",
      targetSeniority: "lead",
      targetRoleFamilies: profileRow.target_role_families,
    });
    expect(fake.rpc).toHaveBeenCalledWith(
      "get_career_profile_snapshot",
      undefined,
    );
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("surfaces evidence at the top level even when no profile row exists", async () => {
    const evidenceRow = {
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
    const fake = client({
      career_profiles: [],
      career_evidence_items: [evidenceRow],
    });

    const snapshot = await createSupabaseProfileRepository(
      fake.client,
    ).getSnapshot();

    expect(snapshot.draft).toBeNull();
    expect(snapshot.evidence).toEqual([
      expect.objectContaining({ label: "SQL", confirmationState: "confirmed" }),
    ]);
  });

  it("saves a validated draft through an auth-derived RPC without a user ID", async () => {
    const fake = client();
    const repository = createSupabaseProfileRepository(fake.client);

    await repository.saveDraft(7, {
      cvDocumentId: null,
      currentSeniority: "senior",
      targetSeniority: "lead",
      evidence: [],
      targetRoleFamilies: profileRow.target_role_families,
      industries: [],
      domains: profileRow.domains,
      keywords: profileRow.keywords,
    });

    expect(fake.rpc).toHaveBeenCalledWith("save_career_profile_draft", {
      expected_generation: 7,
      draft_value: expect.objectContaining({ targetSeniority: "lead" }),
    });
    expect(JSON.stringify(fake.rpc.mock.calls)).not.toContain("userId");
  });

  it.each([
    ["acceptSuggestion", "accepted"],
    ["rejectSuggestion", "rejected"],
  ] as const)(
    "%s uses the existing owner-derived decision RPC",
    async (method, state) => {
      const fake = client();
      const repository = createSupabaseProfileRepository(fake.client);
      const id = "10000000-0000-4000-8000-000000000001";

      await repository[method](id);

      expect(fake.rpc).toHaveBeenCalledWith("decide_profile_suggestion", {
        target_suggestion_id: id,
        target_state: state,
      });
    },
  );

  it.each([
    ["acceptEvidence", "confirmed"],
    ["rejectEvidence", "rejected"],
  ] as const)(
    "%s uses the owner-derived evidence decision RPC",
    async (method, state) => {
      const fake = client();
      const repository = createSupabaseProfileRepository(fake.client);
      const id = "10000000-0000-4000-8000-000000000001";

      await repository[method](id);

      expect(fake.rpc).toHaveBeenCalledWith("decide_career_evidence", {
        target_evidence_id: id,
        target_state: state,
      });
    },
  );

  it("saves named searches through an owner-derived RPC", async () => {
    const fake = client();
    fake.rpc.mockResolvedValueOnce({
      data: "20000000-0000-4000-8000-000000000001",
      error: null,
    });
    const repository = createSupabaseProfileRepository(fake.client);

    await expect(
      repository.saveSearch(7, "20000000-0000-4000-8000-000000000002", {
        name: "Implementation roles",
        enabled: true,
        roleFamilies: profileRow.target_role_families,
        includeTerms: [],
        excludeTerms: [],
        industries: [],
        domains: [],
        skillConcepts: ["sql"],
        responsibilityConcepts: [],
        currentSeniority: "senior",
        targetSeniority: "lead",
        employmentTypes: ["permanent"],
        workingTimes: ["full_time"],
        workplaceTypes: ["hybrid"],
        ukLocations: ["London"],
        ir35Statuses: ["not_applicable"],
        compensation: {
          minimum: null,
          maximum: null,
          period: "unknown",
          allowUnknown: true,
        },
        recencyDays: 14,
        notificationsEnabled: false,
      }),
    ).resolves.toBe("20000000-0000-4000-8000-000000000001");
    expect(fake.rpc).toHaveBeenCalledWith("save_search_profile", {
      expected_generation: 7,
      target_search_id: "20000000-0000-4000-8000-000000000002",
      draft_value: expect.any(Object),
    });
  });

  it("preserves the stable search order returned by the atomic snapshot", async () => {
    const earlier = {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Earlier",
      enabled: true,
      role_families: profileRow.target_role_families,
      include_terms: ["earlier"],
      exclude_terms: [],
      industries: [],
      domains: [],
      skill_concepts: [],
      responsibility_concepts: [],
      current_seniority: "senior",
      target_seniority: "lead",
      employment_types: [],
      working_times: [],
      workplace_types: [],
      uk_locations: [],
      ir35_statuses: [],
      compensation_minimum: null,
      compensation_maximum: null,
      compensation_period: "unknown",
      allow_unknown_compensation: true,
      recency_days: 14,
      notifications_enabled: false,
    };
    const later = {
      ...earlier,
      id: "20000000-0000-4000-8000-000000000002",
      name: "Later",
      include_terms: ["later"],
    };
    const fake = client({ search_profiles: [earlier, later] });

    const snapshot = await createSupabaseProfileRepository(
      fake.client,
    ).getSnapshot();

    expect(snapshot.searches.map(({ id }) => id)).toEqual([
      earlier.id,
      later.id,
    ]);
  });

  it("treats a search-only profile root as an empty career draft", async () => {
    const search = {
      id: "20000000-0000-4000-8000-000000000003",
      name: "Search-only onboarding",
      enabled: true,
      role_families: [],
      include_terms: ["data governance"],
      exclude_terms: [],
      industries: [],
      domains: [],
      skill_concepts: [],
      responsibility_concepts: [],
      current_seniority: "unspecified",
      target_seniority: "unspecified",
      employment_types: [],
      working_times: [],
      workplace_types: [],
      uk_locations: ["Manchester"],
      ir35_statuses: [],
      compensation_minimum: null,
      compensation_maximum: null,
      compensation_period: "unknown",
      allow_unknown_compensation: true,
      recency_days: 14,
      notifications_enabled: false,
    };
    const fake = client({
      career_profiles: [
        {
          current_seniority: "unspecified",
          target_seniority: "unspecified",
          target_role_families: [],
          industries: [],
          domains: [],
          keywords: [],
        },
      ],
      search_profiles: [search],
    });

    const snapshot = await createSupabaseProfileRepository(
      fake.client,
    ).getSnapshot();

    expect(snapshot.draft).toBeNull();
    expect(snapshot.searches).toHaveLength(1);
    expect(snapshot.searches[0]).toMatchObject({
      id: search.id,
      name: search.name,
      includeTerms: search.include_terms,
    });
  });

  it("removes the private object before atomically deleting current CV metadata", async () => {
    const cv = {
      id: "30000000-0000-4000-8000-000000000001",
      storage_path:
        "40000000-0000-4000-8000-000000000001/fictional-career-notes.docx",
      original_file_name: "fictional-career-notes.docx",
      file_kind: "docx",
      lifecycle_status: "ready",
      is_current: true,
      uploaded_at: "2026-07-18T09:00:00.000Z",
    };
    const fake = client({ cv_documents: [cv] });

    await createSupabaseProfileRepository(fake.client).deleteCv();

    expect(fake.remove).toHaveBeenCalledWith([cv.storage_path]);
    expect(fake.rpc).toHaveBeenCalledWith("delete_current_cv", {
      target_document_id: cv.id,
      expected_storage_path: cv.storage_path,
    });
    expect(fake.remove.mock.invocationCallOrder[0]).toBeLessThan(
      fake.rpc.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not delete metadata when private object removal fails", async () => {
    const fake = client({
      cv_documents: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          storage_path:
            "40000000-0000-4000-8000-000000000001/fictional-career-notes.docx",
          original_file_name: "fictional-career-notes.docx",
          file_kind: "docx",
          lifecycle_status: "ready",
          is_current: true,
          uploaded_at: "2026-07-18T09:00:00.000Z",
        },
      ],
    });
    fake.remove.mockResolvedValueOnce({
      data: null,
      error: { code: "storage_unavailable" },
    });

    await expect(
      createSupabaseProfileRepository(fake.client).deleteCv(),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("paginates the owner prefix and removes registered plus unregistered objects before structured deletion", async () => {
    const registeredPath =
      "40000000-0000-4000-8000-000000000001/registered.docx";
    const fake = client({
      cv_documents: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          storage_path: registeredPath,
          original_file_name: "registered.docx",
          file_kind: "docx",
          lifecycle_status: "deleted",
          is_current: false,
          uploaded_at: "2026-07-18T09:00:00.000Z",
        },
      ],
    });
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      index === 1
        ? { name: "nested", id: null, metadata: null }
        : {
            name: index === 0 ? "registered.docx" : `unregistered-${index}.pdf`,
          },
    );
    fake.list
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [{ name: "last-orphan.pdf" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: "nested-orphan.pdf", id: crypto.randomUUID() }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    await createSupabaseProfileRepository(fake.client).deleteProfileData();

    expect(fake.getUser).toHaveBeenCalledOnce();
    expect(fake.list.mock.calls.slice(0, 2)).toEqual([
      [
        "40000000-0000-4000-8000-000000000001",
        expect.objectContaining({ limit: 100, offset: 0 }),
      ],
      [
        "40000000-0000-4000-8000-000000000001",
        expect.objectContaining({ limit: 100, offset: 100 }),
      ],
    ]);
    const removedPaths = fake.remove.mock.calls.flatMap(([paths]) => paths);
    expect(new Set(removedPaths)).toEqual(
      new Set([
        registeredPath,
        ...firstPage
          .filter(({ id }) => id !== null)
          .map(({ name }) => `40000000-0000-4000-8000-000000000001/${name}`),
        "40000000-0000-4000-8000-000000000001/last-orphan.pdf",
        "40000000-0000-4000-8000-000000000001/nested/nested-orphan.pdf",
      ]),
    );
    expect(fake.rpc).toHaveBeenCalledWith(
      "delete_career_profile_data",
      undefined,
    );
    expect(fake.remove.mock.invocationCallOrder.at(-1)).toBeLessThan(
      fake.rpc.mock.invocationCallOrder.at(-1) ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("never calls structured deletion after owner Storage listing fails", async () => {
    const fake = client();
    fake.list.mockResolvedValueOnce({
      data: null,
      error: { code: "storage_unavailable" },
    });

    await expect(
      createSupabaseProfileRepository(fake.client).deleteProfileData(),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("never calls structured deletion after any owner Storage removal fails", async () => {
    const fake = client();
    fake.list.mockResolvedValueOnce({
      data: [{ name: "orphan.pdf" }],
      error: null,
    });
    fake.remove.mockResolvedValueOnce({
      data: null,
      error: { code: "storage_unavailable" },
    });

    await expect(
      createSupabaseProfileRepository(fake.client).deleteProfileData(),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
