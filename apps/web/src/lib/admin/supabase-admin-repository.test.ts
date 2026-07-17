// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminRepositoryError } from "./repository";
import { createSupabaseAdminRepository } from "./supabase-admin-repository";

const accessRows = [
  {
    user_id: "c86eb71b-a02d-4483-8ec5-26f015554922",
    status: "approved",
    requested_at: "2026-07-16T09:00:00.000Z",
    decided_at: "2026-07-17T09:00:00.000Z",
    decision_reason: "Verified member",
  },
  {
    user_id: "e046b1b9-0a2e-4928-ab4a-5ba8f3f57b2f",
    status: "pending",
    requested_at: "2026-07-18T09:00:00.000Z",
    decided_at: null,
    decision_reason: null,
  },
];

const profileRows = [
  {
    user_id: "c86eb71b-a02d-4483-8ec5-26f015554922",
    display_name: "Fictional Alex",
  },
];

const sourceRow = {
  id: "f3f11bd2-46b6-476e-92bc-74f6cd47057c",
  provider: "greenhouse",
  board_token: "fictional-board",
  employer_name: "Fictional Northstar Ltd",
  enabled: true,
  minimum_sync_interval: "01:00:00",
  last_successful_sync_at: "2026-07-18T08:00:00.000Z",
  terms_reviewed_at: "2026-07-01",
  robots_reviewed_at: "2025-08-17",
  allowed_method: "GET",
  compliance_notes: "Reviewed fictional public endpoint.",
  allowed_hosts: ["boards.greenhouse.io"],
};

const runRow = {
  id: "63776909-cdf9-4c85-9dfd-2feb39162f63",
  run_id: "75a10493-761d-49a9-9268-1d7e9fbecad7",
  source_id: sourceRow.id,
  status: "succeeded",
  response_complete: true,
  received_count: 25,
  eligible_count: 18,
  upserted_count: 4,
  unchanged_count: 14,
  closed_count: 1,
  duration_ms: 840,
  retry_count: 0,
  error_code: null,
  started_at: "2026-07-18T09:00:00.000Z",
  completed_at: "2026-07-18T09:00:00.840Z",
  job_sources: {
    id: sourceRow.id,
    provider: "greenhouse",
    employer_name: "Fictional Northstar Ltd",
  },
  ingestion_runs: {
    id: "75a10493-761d-49a9-9268-1d7e9fbecad7",
    trigger_type: "scheduled",
  },
};

const requestRow = {
  id: "be9e55e5-0c64-4eef-b41d-792c0ea1ed62",
  correlation_id: "ac1651c5-500f-4865-b88c-e42d0e65a39a",
  source_id: sourceRow.id,
  status: "pending",
  requested_at: "2026-07-18T10:00:00.000Z",
  job_sources: {
    employer_name: "Fictional Northstar Ltd",
    provider: "greenhouse",
  },
};

function builder(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(response),
    in: vi.fn().mockResolvedValue(response),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

function createClient(
  responses: Record<string, { data: unknown; error: unknown }>,
) {
  const builders = Object.fromEntries(
    Object.entries(responses).map(([table, response]) => [
      table,
      builder(response),
    ]),
  );
  return {
    builders,
    client: {
      from: vi.fn((table: string) => builders[table]),
      rpc: vi.fn(),
    },
  };
}

describe("Supabase administrator repository", () => {
  it("loads access requests and display names without querying auth users or emails", async () => {
    const { client, builders } = createClient({
      access_requests: { data: accessRows, error: null },
      profiles: { data: profileRows, error: null },
    });

    const result = await createSupabaseAdminRepository(
      client,
      () => new Date("2026-07-18T12:00:00.000Z"),
    ).listAccessRequests();

    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "access_requests",
      "profiles",
    ]);
    expect(builders.access_requests.select).toHaveBeenCalledWith(
      "user_id,status,requested_at,decided_at,decision_reason",
    );
    expect(builders.profiles.select).toHaveBeenCalledWith(
      "user_id,display_name",
    );
    expect(
      JSON.stringify(builders.access_requests.select.mock.calls),
    ).not.toMatch(/email|auth\.users/i);
    expect(result.map((item) => item.status)).toEqual(["pending", "approved"]);
    expect(result[0]).toMatchObject({
      displayName: "Private beta applicant",
      userId: accessRows[1].user_id,
    });
    expect(result[1]).toMatchObject({ displayName: "Fictional Alex" });
  });

  it("maps source intervals and compliance review states", async () => {
    const { client, builders } = createClient({
      job_sources: { data: [sourceRow], error: null },
    });

    const result = await createSupabaseAdminRepository(
      client,
      () => new Date("2026-07-18T12:00:00.000Z"),
    ).listSources();

    expect(builders.job_sources.select).toHaveBeenCalledWith(
      expect.not.stringMatching(/payload|description|response/i),
    );
    expect(result).toEqual([
      expect.objectContaining({
        sourceId: sourceRow.id,
        minimumSyncMinutes: 60,
        termsReviewState: "current",
        robotsReviewState: "due_soon",
        allowedHosts: ["boards.greenhouse.io"],
      }),
    ]);
  });

  it("loads bounded run and queued-request metadata without provider payloads", async () => {
    const { client, builders } = createClient({
      ingestion_source_runs: { data: [runRow], error: null },
      ingestion_requests: { data: [requestRow], error: null },
    });
    const repository = createSupabaseAdminRepository(client);

    await expect(repository.listIngestionRuns(50)).resolves.toEqual([
      expect.objectContaining({
        id: runRow.id,
        triggerType: "scheduled",
        receivedCount: 25,
        errorCode: null,
      }),
    ]);
    await expect(repository.listIngestionRequests(20)).resolves.toEqual([
      expect.objectContaining({
        id: requestRow.id,
        correlationId: requestRow.correlation_id,
        status: "pending",
      }),
    ]);
    expect(builders.ingestion_source_runs.limit).toHaveBeenCalledWith(50);
    expect(builders.ingestion_requests.limit).toHaveBeenCalledWith(20);
    expect(
      JSON.stringify([
        builders.ingestion_source_runs.select.mock.calls,
        builders.ingestion_requests.select.mock.calls,
      ]),
    ).not.toMatch(/payload|description|response_body|headers/i);
  });

  it("calls audited RPCs with exact target-only parameters", async () => {
    const { client } = createClient({});
    client.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: sourceRow.id, error: null });
    const repository = createSupabaseAdminRepository(client);

    await repository.decideAccess({
      userId: accessRows[1].user_id,
      nextStatus: "approved",
      reason: "Verified member",
    });
    await repository.setAccessRequestsEnabled(false);
    await repository.saveSource({
      sourceId: null,
      provider: "greenhouse",
      boardToken: "fictional-board",
      employerName: "Fictional Northstar Ltd",
      enabled: true,
      minimumSyncMinutes: 60,
      termsReviewedAt: "2026-07-17",
      robotsReviewedAt: "2026-07-17",
      complianceNotes: "Reviewed fictional public endpoint.",
      allowedHosts: ["boards.greenhouse.io"],
    });

    expect(client.rpc.mock.calls).toEqual([
      [
        "decide_access_request",
        {
          target_user_id: accessRows[1].user_id,
          next_status: "approved",
          decision_reason: "Verified member",
        },
      ],
      ["set_access_requests_enabled", { enabled: false }],
      [
        "upsert_job_source",
        expect.objectContaining({
          target_source_id: null,
          provider_name: "greenhouse",
          minimum_sync_minutes: 60,
          allowed_method_value: "GET",
        }),
      ],
    ]);
    expect(JSON.stringify(client.rpc.mock.calls)).not.toMatch(
      /actor|is_admin|role|email/i,
    );
  });

  it("maps request results and typed database errors without raw leakage", async () => {
    const { client } = createClient({});
    client.rpc
      .mockResolvedValueOnce({
        data: [
          {
            request_id: requestRow.id,
            correlation_id: requestRow.correlation_id,
            request_state: "queued",
            eligible_after: "2026-07-18T10:00:00.000Z",
          },
        ],
        error: null,
      })
      .mockResolvedValue({
        data: null,
        error: { code: "P0001", message: "source cooldown active raw detail" },
      });
    const repository = createSupabaseAdminRepository(client);

    await expect(
      repository.requestSourceIngestion(sourceRow.id),
    ).resolves.toEqual({
      requestId: requestRow.id,
      correlationId: requestRow.correlation_id,
      state: "queued",
      eligibleAfter: "2026-07-18T10:00:00.000Z",
    });
    await expect(
      repository.requestSourceIngestion(sourceRow.id),
    ).rejects.toMatchObject({
      code: "cooldown",
    });
    await expect(
      repository.requestSourceIngestion(sourceRow.id),
    ).rejects.not.toThrow(/raw detail/);
  });

  it("rejects malformed database rows with a fixed repository error", async () => {
    const { client } = createClient({
      job_sources: {
        data: [{ ...sourceRow, provider: "unexpected" }],
        error: null,
      },
    });

    await expect(
      createSupabaseAdminRepository(client).listSources(),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AdminRepositoryError>>({
        code: "unavailable",
        message: "Administrator data is unavailable",
      }),
    );
  });
});
