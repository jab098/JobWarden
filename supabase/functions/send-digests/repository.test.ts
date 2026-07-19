import { describe, expect, it, vi } from "vitest";

import type { IngestionRpcClient } from "../_shared/supabase.ts";
import {
  createSupabaseNotificationRepository,
  NotificationRepositoryError,
} from "./repository.ts";

function client(response: { data: unknown; error?: unknown }): {
  rpc: ReturnType<typeof vi.fn>;
} {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: response.data,
      error: response.error ?? null,
    }),
  };
}

function repository(stub: { rpc: ReturnType<typeof vi.fn> }) {
  return createSupabaseNotificationRepository(
    stub as unknown as IngestionRpcClient,
  );
}

const searchRow = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Analytics implementation",
  enabled: true,
  role_families: [{ normalizedConcept: "analytics", label: "Analytics" }],
  include_terms: ["analytics"],
  exclude_terms: [],
  industries: [],
  domains: [],
  skill_concepts: ["python"],
  responsibility_concepts: [],
  current_seniority: "senior",
  target_seniority: "lead",
  employment_types: ["permanent"],
  working_times: ["full_time"],
  workplace_types: ["hybrid"],
  uk_locations: ["Manchester"],
  ir35_statuses: ["not_applicable"],
  compensation_minimum: 55_000,
  compensation_maximum: 70_000,
  compensation_period: "year",
  allow_unknown_compensation: true,
  recency_days: 14,
  notifications_enabled: true,
};

const evidenceRow = {
  id: "71000000-0000-4000-8000-000000000001",
  normalized_concept: "python",
  label: "Python",
  category: "skill",
  origin: "cv",
  confidence: "0.900",
  evidence_reference: "Experience section",
  proficiency_signal: "demonstrated",
  last_used_at: "2026-05-01",
  confirmation_state: "confirmed",
};

const recipientRow = {
  owner_id: "30000000-0000-4000-8000-000000000001",
  email: "person@example.invalid",
  unsubscribe_token: "40000000-0000-4000-8000-000000000001",
  searches: [searchRow],
  evidence: [evidenceRow],
};

const candidateRow = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Senior Analytics Engineer",
  employer: "Fictionex Ltd",
  description_text: "Analytics work in python.",
  location: "Manchester, UK",
  employment_type: "permanent",
  working_time: "full_time",
  workplace_type: "hybrid",
  ir35_status: "not_applicable",
  compensation_minimum: 60_000,
  compensation_maximum: null,
  compensation_period: "year",
  compensation_provenance: "advertised",
  posted_at: "2026-07-19T00:00:00.000Z",
};

describe("listRecipients", () => {
  it("maps a recipient row onto domain drafts and evidence", async () => {
    const stub = client({ data: [recipientRow] });

    const [recipient] = await repository(stub).listRecipients(
      "2026-07-20T09",
      25,
    );

    expect(stub.rpc).toHaveBeenCalledWith("list_pending_notification_digests", {
      target_slot: "2026-07-20T09",
      max_owners: 25,
    });
    expect(recipient.ownerId).toBe("30000000-0000-4000-8000-000000000001");
    expect(recipient.searches[0]?.draft).toMatchObject({
      name: "Analytics implementation",
      skillConcepts: ["python"],
      recencyDays: 14,
      notificationsEnabled: true,
      compensation: {
        minimum: 55_000,
        maximum: 70_000,
        period: "year",
        allowUnknown: true,
      },
    });
    expect(recipient.confirmedEvidence[0]).toMatchObject({
      normalizedConcept: "python",
      label: "Python",
      confidence: 0.9,
    });
  });

  it("nulls the evidence excerpt the runtime is never given", async () => {
    const stub = client({ data: [recipientRow] });

    const [recipient] = await repository(stub).listRecipients(
      "2026-07-20T09",
      25,
    );

    expect(recipient.confirmedEvidence[0]?.evidenceExcerpt).toBeNull();
  });

  it("rejects an evidence excerpt smuggled into the response", async () => {
    const stub = client({
      data: [
        {
          ...recipientRow,
          evidence: [
            { ...evidenceRow, evidence_excerpt: "Led the analytics team at…" },
          ],
        },
      ],
    });

    // Unknown keys are ignored rather than mapped, so CV prose cannot reach the
    // digest even if a future migration starts returning it.
    const [recipient] = await repository(stub).listRecipients(
      "2026-07-20T09",
      25,
    );
    expect(JSON.stringify(recipient)).not.toContain("Led the analytics team");
  });

  it("treats a null response as no recipients", async () => {
    await expect(
      repository(client({ data: null })).listRecipients("2026-07-20T09", 25),
    ).resolves.toEqual([]);
  });

  it("raises a sanitised error when the read fails", async () => {
    await expect(
      repository(
        client({ data: null, error: { message: "denied" } }),
      ).listRecipients("2026-07-20T09", 25),
    ).rejects.toMatchObject({ code: "recipients_failed" });
  });

  it("rejects a malformed recipient row", async () => {
    await expect(
      repository(
        client({ data: [{ ...recipientRow, owner_id: "not-a-uuid" }] }),
      ).listRecipients("2026-07-20T09", 25),
    ).rejects.toBeInstanceOf(NotificationRepositoryError);
  });

  it("rejects more recipients than were requested", async () => {
    await expect(
      repository(client({ data: [recipientRow, recipientRow] })).listRecipients(
        "2026-07-20T09",
        1,
      ),
    ).rejects.toMatchObject({ code: "invalid_recipients_response" });
  });
});

describe("listCandidateJobs", () => {
  it("maps a candidate row onto the target feed job input", async () => {
    const stub = client({ data: [candidateRow] });

    const [job] = await repository(stub).listCandidateJobs(200);

    expect(stub.rpc).toHaveBeenCalledWith("list_notification_candidate_jobs", {
      max_jobs: 200,
    });
    expect(job).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
      title: "Senior Analytics Engineer",
      employer: "Fictionex Ltd",
      descriptionText: "Analytics work in python.",
      location: "Manchester, UK",
      employmentType: "permanent",
      workingTime: "full_time",
      workplaceType: "hybrid",
      ir35Status: "not_applicable",
      compensationMinimum: 60_000,
      compensationMaximum: null,
      compensationPeriod: "year",
      compensationProvenance: "advertised",
      postedAt: "2026-07-19T00:00:00.000Z",
    });
  });

  it("rejects more candidates than the requested cap", async () => {
    await expect(
      repository(
        client({ data: [candidateRow, candidateRow] }),
      ).listCandidateJobs(1),
    ).rejects.toMatchObject({ code: "invalid_candidates_response" });
  });
});

describe("listAnnouncedKeys", () => {
  it("scopes the ledger read to the supplied candidate window", async () => {
    const stub = client({ data: ["profile-a:job-a"] });

    const keys = await repository(stub).listAnnouncedKeys("owner-1", [
      "job-a",
      "job-b",
    ]);

    expect(stub.rpc).toHaveBeenCalledWith("list_notification_announcements", {
      target_owner: "owner-1",
      target_job_ids: ["job-a", "job-b"],
    });
    expect(keys.has("profile-a:job-a")).toBe(true);
    expect(keys.size).toBe(1);
  });

  it("treats a null response as an empty ledger", async () => {
    const keys = await repository(client({ data: null })).listAnnouncedKeys(
      "owner-1",
      [],
    );
    expect(keys.size).toBe(0);
  });
});

describe("beginDigest", () => {
  const input = {
    ownerId: "30000000-0000-4000-8000-000000000001",
    slotKey: "2026-07-20T09",
    matchCount: 3,
    dailyLimit: 80,
    monthlyLimit: 2_500,
  };

  it("returns the claimed delivery id", async () => {
    const stub = client({
      data: [
        {
          delivery_id: "50000000-0000-4000-8000-000000000001",
          outcome: "claimed",
        },
      ],
    });

    await expect(repository(stub).beginDigest(input)).resolves.toEqual({
      outcome: "claimed",
      deliveryId: "50000000-0000-4000-8000-000000000001",
    });
    expect(stub.rpc).toHaveBeenCalledWith("begin_notification_digest", {
      target_owner: input.ownerId,
      target_slot: input.slotKey,
      target_match_count: 3,
      daily_limit: 80,
      monthly_limit: 2_500,
    });
  });

  it.each([
    "already_recorded",
    "suppressed_no_matches",
    "suppressed_daily_cap",
    "suppressed_monthly_cap",
  ])("returns the %s outcome without a delivery id", async (outcome) => {
    const stub = client({ data: [{ delivery_id: null, outcome }] });

    await expect(repository(stub).beginDigest(input)).resolves.toEqual({
      outcome,
    });
  });

  it("rejects a claimed outcome with no delivery id", async () => {
    const stub = client({ data: [{ delivery_id: null, outcome: "claimed" }] });

    await expect(repository(stub).beginDigest(input)).rejects.toMatchObject({
      code: "invalid_begin_response",
    });
  });

  it("rejects an unknown outcome", async () => {
    const stub = client({ data: [{ delivery_id: null, outcome: "maybe" }] });

    await expect(repository(stub).beginDigest(input)).rejects.toMatchObject({
      code: "invalid_begin_response",
    });
  });
});

describe("finishDigest", () => {
  it("sends announcements in the database's column shape", async () => {
    const stub = client({ data: null });

    await repository(stub).finishDigest({
      deliveryId: "50000000-0000-4000-8000-000000000001",
      status: "sent",
      providerMessageId: "message-1",
      errorCode: null,
      announcements: [
        {
          searchProfileId: "20000000-0000-4000-8000-000000000001",
          jobId: "10000000-0000-4000-8000-000000000001",
        },
      ],
    });

    expect(stub.rpc).toHaveBeenCalledWith("finish_notification_digest", {
      target_delivery_id: "50000000-0000-4000-8000-000000000001",
      target_status: "sent",
      target_provider_message_id: "message-1",
      target_error_code: null,
      target_announcements: [
        {
          search_profile_id: "20000000-0000-4000-8000-000000000001",
          job_id: "10000000-0000-4000-8000-000000000001",
        },
      ],
    });
  });

  it("raises a sanitised error when completion fails", async () => {
    await expect(
      repository(
        client({ data: null, error: { message: "denied" } }),
      ).finishDigest({
        deliveryId: "50000000-0000-4000-8000-000000000001",
        status: "failed",
        providerMessageId: null,
        errorCode: "provider_unavailable",
        announcements: [],
      }),
    ).rejects.toMatchObject({ code: "finish_failed" });
  });
});
