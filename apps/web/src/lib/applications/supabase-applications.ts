import "server-only";

import {
  applicationStages,
  buildApplicationInsights,
  classifyNextAction,
  londonIsoDate,
  type ApplicationSnapshotInput,
  type ApplicationStage,
  type DashboardApplicationInput,
} from "@jobwarden/domain";
import { z } from "zod";

import {
  compensationPeriods,
  compensationProvenances,
  employmentTypes,
  ir35Statuses,
  workingTimes,
  workplaceTypes,
  type JobListItem,
} from "@/lib/jobs/types";

import type { ApplicationsRepository } from "./repository";
import type { ApplicationItem, ApplicationsResult } from "./types";

const locationSchema = z.object({
  raw_location: z.string().min(1).max(1_000),
});

const jobRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  employment_type: z.enum(employmentTypes),
  working_time: z.enum(workingTimes),
  workplace_type: z.enum(workplaceTypes),
  ir35_status: z.enum(ir35Statuses),
  compensation_minimum: z.number().int().nonnegative().nullable(),
  compensation_maximum: z.number().int().nonnegative().nullable(),
  compensation_currency: z.literal("GBP").nullable(),
  compensation_period: z.enum(compensationPeriods),
  compensation_provenance: z.enum(compensationProvenances),
  posted_at: z.iso.datetime().nullable(),
  closes_at: z.iso.datetime().nullable(),
  job_locations: z.array(locationSchema).nullable(),
});

const applicationRowSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(applicationStages),
  next_action: z.string().min(1).max(200).nullable(),
  next_action_due_on: z.iso.date().nullable(),
  notes: z.string().min(1).max(2_000).nullable(),
  updated_at: z.iso.datetime({ offset: true }),
  // Left-joined embed: RLS hides the job row once the listing stops being
  // active, but the user's tracked application must keep rendering.
  jobs: jobRowSchema.nullable(),
});

const eventRowSchema = z.object({
  application_id: z.string().uuid(),
  to_stage: z.enum(applicationStages),
  occurred_at: z.iso.datetime({ offset: true }),
});

export const applicationColumns = [
  "id",
  "stage",
  "next_action",
  "next_action_due_on",
  "notes",
  "updated_at",
  [
    "jobs(id,title,employer,employment_type,working_time,workplace_type",
    "ir35_status,compensation_minimum,compensation_maximum",
    "compensation_currency,compensation_period,compensation_provenance",
    "posted_at,closes_at,job_locations(raw_location))",
  ].join(","),
].join(",");

type QueryResponse = { data: unknown; error: unknown };
type SelectQuery = { select(columns: string): Promise<QueryResponse> };
type ApplicationsClient = {
  from(table: "career_applications" | "career_application_events"): SelectQuery;
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

function selectLocation(
  locations: readonly z.infer<typeof locationSchema>[] | null,
): string {
  return (
    locations
      ?.map((location) => location.raw_location.trim())
      .filter((location) => location.length > 0)
      .toSorted((left, right) => left.localeCompare(right, "en-GB"))[0] ??
    "UK location not specified"
  );
}

function toJob(row: z.infer<typeof jobRowSchema>): JobListItem {
  return {
    id: row.id,
    title: row.title,
    employer: row.employer,
    location: selectLocation(row.job_locations),
    employmentType: row.employment_type,
    workingTime: row.working_time,
    workplaceType: row.workplace_type,
    ir35Status: row.ir35_status,
    compensationMinimum: row.compensation_minimum,
    compensationMaximum: row.compensation_maximum,
    compensationCurrency: row.compensation_currency,
    compensationPeriod: row.compensation_period,
    compensationProvenance: row.compensation_provenance,
    postedAt: row.posted_at,
    closesAt: row.closes_at,
  };
}

export type ApplicationRecordInput = {
  id: string;
  job: JobListItem | null;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null;
  notes: string | null;
  updatedAt: string;
  events: readonly { toStage: ApplicationStage; occurredAt: string }[];
};

/**
 * Pure builder shared by every data source: derives audited reach and the
 * last transition time from the event trail, orders by most recent audited
 * activity, and computes deterministic insights via the domain module.
 */
export function buildApplicationsResult(input: {
  records: readonly ApplicationRecordInput[];
  now: Date;
  dataMode: "supabase" | "fixtures";
}): ApplicationsResult {
  const today = londonIsoDate(input.now);

  const snapshots: ApplicationSnapshotInput[] = [];
  const items: ApplicationItem[] = [];
  for (const record of input.records) {
    const reachedStages = [
      ...new Set([
        ...record.events.map((event) => event.toStage),
        record.stage,
      ]),
    ];
    const lastTransitionAt = record.events.reduce(
      (latest, event) =>
        event.occurredAt > latest ? event.occurredAt : latest,
      record.events[0]?.occurredAt ?? record.updatedAt,
    );

    snapshots.push({
      id: record.id,
      stage: record.stage,
      nextAction: record.nextAction,
      nextActionDueOn: record.nextActionDueOn,
      lastTransitionAt,
      reachedStages,
    });
    items.push({
      id: record.id,
      job: record.job,
      stage: record.stage,
      nextAction: record.nextAction,
      nextActionDueOn: record.nextActionDueOn,
      nextActionState: classifyNextAction(record.nextActionDueOn, today),
      notes: record.notes,
      lastTransitionAt,
    });
  }

  items.sort(
    (left, right) =>
      right.lastTransitionAt.localeCompare(left.lastTransitionAt) ||
      right.id.localeCompare(left.id),
  );

  return {
    items,
    insights: buildApplicationInsights(snapshots, input.now),
    dataMode: input.dataMode,
  };
}

/**
 * The one read of applications and their audit trail. The dashboard shares it
 * so its funnel can never disagree with the tracker's.
 */
export async function readApplicationRecords(
  client: object,
): Promise<ApplicationRecordInput[]> {
  const supabaseClient = client as ApplicationsClient;
  const [applicationsResponse, eventsResponse] = await Promise.all([
    supabaseClient.from("career_applications").select(applicationColumns),
    supabaseClient
      .from("career_application_events")
      .select("application_id,to_stage,occurred_at"),
  ]);
  const applicationRows = z
    .array(applicationRowSchema)
    .parse(data(applicationsResponse));
  const eventRows = z.array(eventRowSchema).parse(data(eventsResponse));

  const eventsByApplication = new Map<
    string,
    { toStage: ApplicationStage; occurredAt: string }[]
  >();
  for (const event of eventRows) {
    const events = eventsByApplication.get(event.application_id) ?? [];
    events.push({ toStage: event.to_stage, occurredAt: event.occurred_at });
    eventsByApplication.set(event.application_id, events);
  }

  return applicationRows.map((row) => ({
    id: row.id,
    job: row.jobs ? toJob(row.jobs) : null,
    stage: row.stage,
    nextAction: row.next_action,
    nextActionDueOn: row.next_action_due_on,
    notes: row.notes,
    updatedAt: row.updated_at,
    events: eventsByApplication.get(row.id) ?? [],
  }));
}

/**
 * Projects records for the dashboard using the same audited derivation the
 * tracker uses. An application's creation time is its earliest audited event,
 * which the tracking RPC always writes, so no extra column is needed.
 */
export function toDashboardApplications(
  records: readonly ApplicationRecordInput[],
): DashboardApplicationInput[] {
  return records.map((record) => {
    const occurredAt = record.events
      .map((event) => event.occurredAt)
      .toSorted((left, right) => left.localeCompare(right));

    return {
      id: record.id,
      stage: record.stage,
      nextAction: record.nextAction,
      nextActionDueOn: record.nextActionDueOn,
      createdAt: occurredAt[0] ?? record.updatedAt,
      lastTransitionAt: occurredAt.at(-1) ?? record.updatedAt,
      reachedStages: [
        ...new Set([
          ...record.events.map((event) => event.toStage),
          record.stage,
        ]),
      ],
    };
  });
}

export function createSupabaseApplicationsRepository(
  client: object,
): ApplicationsRepository {
  const supabaseClient = client as ApplicationsClient;

  return {
    async getApplications() {
      try {
        return buildApplicationsResult({
          records: await readApplicationRecords(client),
          now: new Date(),
          dataMode: "supabase",
        });
      } catch {
        throw new Error("Unable to load applications");
      }
    },

    async track(jobId) {
      const targetJobId = z.string().uuid().parse(jobId);
      try {
        data(
          await supabaseClient.rpc("track_career_application", {
            target_job_id: targetJobId,
          }),
        );
      } catch {
        throw new Error("Unable to track application");
      }
    },

    async transition(applicationId, stage) {
      const targetApplicationId = z.string().uuid().parse(applicationId);
      const targetStage = z.enum(applicationStages).parse(stage);
      try {
        data(
          await supabaseClient.rpc("transition_career_application", {
            target_application_id: targetApplicationId,
            target_stage: targetStage,
          }),
        );
      } catch {
        throw new Error("Unable to update application stage");
      }
    },

    async updatePlan(applicationId, plan) {
      const targetApplicationId = z.string().uuid().parse(applicationId);
      const parsedPlan = z
        .object({
          nextAction: z.string().trim().min(1).max(200).nullable(),
          nextActionDueOn: z.iso.date().nullable(),
          notes: z.string().trim().min(1).max(2_000).nullable(),
        })
        .strict()
        .parse(plan);
      try {
        data(
          await supabaseClient.rpc("update_career_application_plan", {
            target_application_id: targetApplicationId,
            target_next_action: parsedPlan.nextAction,
            target_due_on: parsedPlan.nextActionDueOn,
            target_notes: parsedPlan.notes,
          }),
        );
      } catch {
        throw new Error("Unable to update application plan");
      }
    },

    async remove(applicationId) {
      const targetApplicationId = z.string().uuid().parse(applicationId);
      try {
        data(
          await supabaseClient.rpc("delete_career_application", {
            target_application_id: targetApplicationId,
          }),
        );
      } catch {
        throw new Error("Unable to delete application");
      }
    },
  };
}
