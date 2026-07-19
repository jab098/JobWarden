// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseApplicationsRepository } from "./supabase-applications";

type QueryResponse = { data: unknown; error: unknown };

const applicationId = "91000000-0000-4000-8000-000000000001";
const jobId = "0d74a055-d0e6-4f50-a77a-9c8fd8543af3";

function jobRow() {
  return {
    id: jobId,
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
    job_locations: [{ raw_location: "Remote within the United Kingdom" }],
  };
}

function applicationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: applicationId,
    stage: "screening",
    next_action: "Prepare fictional call notes",
    next_action_due_on: "2026-07-21",
    notes: null,
    updated_at: "2026-07-18T09:00:00.000Z",
    jobs: jobRow(),
    ...overrides,
  };
}

function createFakeClient(
  options: {
    applications?: unknown[];
    events?: unknown[];
    rpcError?: unknown;
  } = {},
) {
  const applicationsBuilder = {
    select: vi.fn().mockResolvedValue({
      data: options.applications ?? [applicationRow()],
      error: null,
    } satisfies QueryResponse),
  };
  const eventsBuilder = {
    select: vi.fn().mockResolvedValue({
      data: options.events ?? [
        {
          application_id: applicationId,
          to_stage: "applied",
          occurred_at: "2026-07-10T09:00:00.000Z",
        },
        {
          application_id: applicationId,
          to_stage: "screening",
          occurred_at: "2026-07-18T09:00:00.000Z",
        },
      ],
      error: null,
    } satisfies QueryResponse),
  };

  const from = vi.fn((table: string) => {
    if (table === "career_applications") return applicationsBuilder;
    if (table === "career_application_events") return eventsBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  const rpc = vi.fn(
    async (name: string, _parameters?: Record<string, unknown>) => {
      void _parameters;
      if (options.rpcError) return { data: null, error: options.rpcError };
      if (name === "track_career_application") {
        return { data: applicationId, error: null };
      }
      if (name === "transition_career_application") {
        return { data: "interviewing", error: null };
      }
      if (name === "update_career_application_plan") {
        return { data: null, error: null };
      }
      if (name === "delete_career_application") {
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  );

  return { client: { from, rpc }, from, rpc, applicationsBuilder };
}

describe("Supabase applications repository", () => {
  it("builds items with audited reach, last transition, and insights", async () => {
    const fake = createFakeClient();

    const result = await createSupabaseApplicationsRepository(
      fake.client,
    ).getApplications();

    expect(result.dataMode).toBe("supabase");
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item?.stage).toBe("screening");
    expect(item?.job?.location).toBe("Remote within the United Kingdom");
    expect(item?.lastTransitionAt).toBe("2026-07-18T09:00:00.000Z");
    expect(result.insights.totalTracked).toBe(1);
    expect(result.insights.funnel).toEqual([
      { stage: "applied", reached: 1 },
      { stage: "screening", reached: 1 },
      { stage: "interviewing", reached: 0 },
      { stage: "offer", reached: 0 },
      { stage: "accepted", reached: 0 },
    ]);
  });

  it("keeps rendering an application whose job is no longer visible", async () => {
    const fake = createFakeClient({
      applications: [applicationRow({ jobs: null })],
    });

    const result = await createSupabaseApplicationsRepository(
      fake.client,
    ).getApplications();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.job).toBeNull();
    expect(result.items[0]?.stage).toBe("screening");
    expect(result.insights.totalTracked).toBe(1);
  });

  it("tracks a job through the owner-fenced RPC", async () => {
    const fake = createFakeClient();

    await createSupabaseApplicationsRepository(fake.client).track(jobId);

    expect(fake.rpc).toHaveBeenCalledWith("track_career_application", {
      target_job_id: jobId,
    });
  });

  it("transitions through the audited RPC", async () => {
    const fake = createFakeClient();

    await createSupabaseApplicationsRepository(fake.client).transition(
      applicationId,
      "interviewing",
    );

    expect(fake.rpc).toHaveBeenCalledWith("transition_career_application", {
      target_application_id: applicationId,
      target_stage: "interviewing",
    });
  });

  it("rejects unknown stages before any RPC", async () => {
    const fake = createFakeClient();

    await expect(
      createSupabaseApplicationsRepository(fake.client).transition(
        applicationId,
        "ghosted" as never,
      ),
    ).rejects.toThrow();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("updates the plan and deletes through their RPCs", async () => {
    const fake = createFakeClient();
    const repository = createSupabaseApplicationsRepository(fake.client);

    await repository.updatePlan(applicationId, {
      nextAction: "Chase fictional referral",
      nextActionDueOn: "2026-07-25",
      notes: null,
    });
    await repository.remove(applicationId);

    expect(fake.rpc).toHaveBeenCalledWith("update_career_application_plan", {
      target_application_id: applicationId,
      target_next_action: "Chase fictional referral",
      target_due_on: "2026-07-25",
      target_notes: null,
    });
    expect(fake.rpc).toHaveBeenCalledWith("delete_career_application", {
      target_application_id: applicationId,
    });
  });

  it("sanitises repository failures", async () => {
    const fake = createFakeClient({ rpcError: { message: "boom" } });

    await expect(
      createSupabaseApplicationsRepository(fake.client).transition(
        applicationId,
        "interviewing",
      ),
    ).rejects.toThrow("Unable to update application stage");
  });
});
