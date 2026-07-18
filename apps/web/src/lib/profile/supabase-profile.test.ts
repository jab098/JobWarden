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

function client(overrides: Partial<Record<string, unknown[]>> = {}) {
  const responses: Record<string, unknown[]> = {
    career_profiles: [profileRow],
    career_evidence_items: [],
    profile_suggestions: [],
    search_profiles: [],
    cv_documents: [],
    ...overrides,
  };
  const select = vi.fn(async (table: string) => ({
    data: responses[table],
    error: null,
  }));
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => select(table)),
  }));
  const rpc = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(
    async () => ({
      data: null,
      error: null,
    }),
  );
  const remove = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(
    async () => ({ data: [], error: null }),
  );
  return {
    from,
    rpc,
    remove,
    client: { from, rpc, storage: { from: vi.fn(() => ({ remove })) } },
  };
}

describe("caller-bound Supabase career profile repository", () => {
  it("builds a strict owner snapshot from RLS-filtered tables", async () => {
    const fake = client();
    const snapshot = await createSupabaseProfileRepository(
      fake.client,
    ).getSnapshot();

    expect(snapshot.dataMode).toBe("supabase");
    expect(snapshot.draft).toMatchObject({
      currentSeniority: "senior",
      targetSeniority: "lead",
      targetRoleFamilies: profileRow.target_role_families,
    });
    expect(fake.from).toHaveBeenCalledWith("career_profiles");
    expect(fake.from).toHaveBeenCalledWith("cv_documents");
  });

  it("saves a validated draft through an auth-derived RPC without a user ID", async () => {
    const fake = client();
    const repository = createSupabaseProfileRepository(fake.client);

    await repository.saveDraft({
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
      repository.saveSearch({
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
      draft_value: expect.any(Object),
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
});
