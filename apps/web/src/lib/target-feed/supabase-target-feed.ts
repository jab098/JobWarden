import "server-only";

import {
  applyEligibilityGate,
  compensationPeriods,
  compensationProvenances,
  employmentTypes,
  ir35Statuses,
  scoreJobForProfile,
  workingTimes,
  workplaceTypes,
  type CareerEvidenceItem,
  type NamedSearchProfileDraft,
  type TargetFeedExplanation,
  type TargetFeedJobInput,
} from "@jobwarden/domain";
import { z } from "zod";

import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";
import type { JobListItem } from "@/lib/jobs/types";

import type { TargetFeedRepository } from "./repository";
import type { JobDecision, TargetFeedItem, TargetFeedResult } from "./types";

const candidateCap = 200;

export type TargetFeedCandidate = JobListItem & { descriptionText: string };

const locationSchema = z.object({
  raw_location: z.string().min(1).max(1_000),
});

const candidateRowSchema = z.object({
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
  posted_at: z.iso.datetime({ offset: true }).nullable(),
  closes_at: z.iso.datetime({ offset: true }).nullable(),
  description_text: z.string().max(100_000),
  job_locations: z.array(locationSchema).nullable(),
});

const decisionRowSchema = z.object({
  job_id: z.string().uuid(),
  decision: z.enum(["saved", "dismissed", "considering"]),
});

const candidateColumns = [
  "id",
  "title",
  "employer",
  "employment_type",
  "working_time",
  "workplace_type",
  "ir35_status",
  "compensation_minimum",
  "compensation_maximum",
  "compensation_currency",
  "compensation_period",
  "compensation_provenance",
  "posted_at",
  "closes_at",
  "description_text",
  "job_locations(raw_location)",
].join(",");

type CandidateRow = z.infer<typeof candidateRowSchema>;

type QueryResponse = { data: unknown; error: unknown };

type CandidateQuery = {
  select(columns: string): CandidateQuery;
  eq(column: string, value: string): CandidateQuery;
  in(column: string, values: readonly string[]): CandidateQuery;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ): CandidateQuery;
  limit(count: number): Promise<QueryResponse>;
};

type DecisionQuery = { select(columns: string): Promise<QueryResponse> };

type TargetFeedClient = {
  from(table: "jobs"): CandidateQuery;
  from(table: "career_job_decisions"): DecisionQuery;
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
};

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

function toCandidate(row: CandidateRow): TargetFeedCandidate {
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
    descriptionText: row.description_text,
  };
}

function toJobInput(candidate: TargetFeedCandidate): TargetFeedJobInput {
  return {
    id: candidate.id,
    title: candidate.title,
    employer: candidate.employer,
    descriptionText: candidate.descriptionText,
    location: candidate.location,
    employmentType: candidate.employmentType,
    workingTime: candidate.workingTime,
    workplaceType: candidate.workplaceType,
    ir35Status: candidate.ir35Status,
    compensationMinimum: candidate.compensationMinimum,
    compensationMaximum: candidate.compensationMaximum,
    compensationPeriod: candidate.compensationPeriod,
    compensationProvenance: candidate.compensationProvenance,
    postedAt: candidate.postedAt,
  };
}

function toListItem(candidate: TargetFeedCandidate): JobListItem {
  const { descriptionText, ...listItem } = candidate;
  void descriptionText;
  return listItem;
}

function compareItems(left: TargetFeedItem, right: TargetFeedItem): number {
  if (left.explanation.score !== right.explanation.score) {
    return right.explanation.score - left.explanation.score;
  }
  if (left.job.postedAt !== right.job.postedAt) {
    if (left.job.postedAt === null) return 1;
    if (right.job.postedAt === null) return -1;
    const postedAtOrder = right.job.postedAt.localeCompare(left.job.postedAt);
    if (postedAtOrder !== 0) return postedAtOrder;
  }
  return right.job.id.localeCompare(left.job.id);
}

/**
 * Pure, side-effect-free feed builder shared by every data source. Gating and
 * scoring always run here via the real domain module — data sources only
 * supply candidate jobs, enabled profiles, confirmed evidence, and decisions.
 */
export function buildTargetFeedResult(input: {
  candidates: readonly TargetFeedCandidate[];
  enabledSearches: readonly NamedSearchProfileDraft[];
  confirmedEvidence: readonly CareerEvidenceItem[];
  decisions: ReadonlyMap<string, JobDecision>;
  includeDismissed: boolean;
  now: Date;
  dataMode: "supabase" | "fixtures";
}): TargetFeedResult {
  const items: TargetFeedItem[] = [];

  for (const candidate of input.candidates) {
    const decision = input.decisions.get(candidate.id) ?? null;
    if (decision === "dismissed" && !input.includeDismissed) continue;

    const jobInput = toJobInput(candidate);
    let best: TargetFeedExplanation | null = null;
    for (const profile of input.enabledSearches) {
      const gate = applyEligibilityGate(jobInput, profile, input.now);
      if (!gate.eligible) continue;
      const explanation = scoreJobForProfile(
        jobInput,
        profile,
        input.confirmedEvidence,
        input.now,
      );
      if (best === null || explanation.score > best.score) best = explanation;
    }
    if (best === null) continue;

    items.push({ job: toListItem(candidate), explanation: best, decision });
  }

  items.sort(compareItems);

  return {
    items,
    enabledProfileNames: input.enabledSearches.map((profile) => profile.name),
    candidateCap,
    dataMode: input.dataMode,
  };
}

const pushdownFields: readonly [
  string,
  (profile: NamedSearchProfileDraft) => readonly string[],
][] = [
  ["employment_type", (profile) => profile.employmentTypes],
  ["working_time", (profile) => profile.workingTimes],
  ["workplace_type", (profile) => profile.workplaceTypes],
  ["ir35_status", (profile) => profile.ir35Statuses],
];

function pushdownValues(
  profiles: readonly NamedSearchProfileDraft[],
  selector: (profile: NamedSearchProfileDraft) => readonly string[],
): readonly string[] | null {
  if (profiles.length === 0) return null;
  const sets = profiles.map((profile) => [...selector(profile)].sort());
  const [first] = sets;
  if (!first || first.length === 0) return null;
  const allIdentical = sets.every(
    (set) =>
      set.length === first.length &&
      set.every((value, i) => value === first[i]),
  );
  if (!allIdentical) return null;
  return [...new Set([...first, "unknown"])];
}

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new Error("query failed");
  }
  return response.data;
}

export function createSupabaseTargetFeedRepository(
  client: object,
): TargetFeedRepository {
  const supabaseClient = client as TargetFeedClient;
  const profileRepository = createSupabaseProfileRepository(client);

  return {
    async getFeed({ includeDismissed }) {
      try {
        const snapshot = await profileRepository.getSnapshot();
        const enabledSearches = snapshot.searches.filter(
          (search) => search.enabled,
        );
        if (enabledSearches.length === 0) {
          return {
            items: [],
            enabledProfileNames: [],
            candidateCap,
            dataMode: snapshot.dataMode,
          };
        }
        const confirmedEvidence = snapshot.evidence.filter(
          (item) => item.confirmationState === "confirmed",
        );

        let query = supabaseClient
          .from("jobs")
          .select(candidateColumns)
          .eq("lifecycle_status", "active");
        for (const [column, selector] of pushdownFields) {
          const values = pushdownValues(enabledSearches, selector);
          if (values) query = query.in(column, values);
        }
        const jobsResponse = await query
          .order("posted_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .limit(candidateCap);
        const candidateRows = z
          .array(candidateRowSchema)
          .parse(data(jobsResponse));
        const candidates = candidateRows.map(toCandidate);

        const decisionsResponse = await supabaseClient
          .from("career_job_decisions")
          .select("job_id,decision");
        const decisionRows = z
          .array(decisionRowSchema)
          .parse(data(decisionsResponse));
        const decisions = new Map<string, JobDecision>(
          decisionRows.map((row) => [row.job_id, row.decision]),
        );

        return buildTargetFeedResult({
          candidates,
          enabledSearches,
          confirmedEvidence,
          decisions,
          includeDismissed,
          now: new Date(),
          dataMode: snapshot.dataMode,
        });
      } catch {
        throw new Error("Unable to load target feed");
      }
    },

    async decide(jobId, decision) {
      const targetJobId = z.string().uuid().parse(jobId);
      const targetDecision = z
        .enum(["saved", "dismissed", "considering", "clear"])
        .parse(decision);
      try {
        data(
          await supabaseClient.rpc("decide_career_job", {
            target_job_id: targetJobId,
            target_decision: targetDecision,
          }),
        );
      } catch {
        throw new Error("Unable to update job decision");
      }
    },

    async getDecisions() {
      try {
        // Row-level security scopes this to the caller, so no owner predicate
        // is added here — the boundary is the database's, not this query's.
        const response = await supabaseClient
          .from("career_job_decisions")
          .select("job_id,decision");
        const rows = z.array(decisionRowSchema).parse(data(response));
        return new Map<string, JobDecision>(
          rows.map((row) => [row.job_id, row.decision]),
        );
      } catch {
        throw new Error("Unable to load job decisions");
      }
    },
  };
}
