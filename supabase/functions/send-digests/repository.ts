import {
  careerEvidenceCategories,
  careerEvidenceOrigins,
  careerEvidenceConfirmationStates,
  compensationPeriods,
  compensationProvenances,
  employmentTypes,
  ir35Statuses,
  proficiencySignals,
  seniorityLevels,
  workingTimes,
  workplaceTypes,
  type CareerEvidenceItem,
  type NamedSearchProfileDraft,
  type NotificationSearchProfile,
  type TargetFeedJobInput,
} from "@jobwarden/domain";
import { z } from "zod";

import type { IngestionRpcClient } from "../_shared/supabase.ts";
import {
  MAX_EVIDENCE_PER_OWNER,
  MAX_SEARCHES_PER_OWNER,
  type DigestRecipient,
  type NotificationRepository,
  type SlotClaim,
} from "./contracts.ts";

export type NotificationRepositoryErrorCode =
  | "recipients_failed"
  | "invalid_recipients_response"
  | "candidates_failed"
  | "invalid_candidates_response"
  | "announcements_failed"
  | "invalid_announcements_response"
  | "begin_failed"
  | "invalid_begin_response"
  | "finish_failed";

export class NotificationRepositoryError extends Error {
  override readonly name = "NotificationRepositoryError";

  constructor(readonly code: NotificationRepositoryErrorCode) {
    super("Notification database operation failed.");
  }
}

function databaseFailure(
  error: unknown,
  code: NotificationRepositoryErrorCode,
): void {
  if (error !== null && error !== undefined) {
    throw new NotificationRepositoryError(code);
  }
}

const conceptSchema = z.object({
  normalizedConcept: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
});

const searchRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  role_families: z.array(conceptSchema).max(20),
  include_terms: z.array(z.string().min(1).max(120)).max(30),
  exclude_terms: z.array(z.string().min(1).max(120)).max(30),
  industries: z.array(conceptSchema).max(20),
  domains: z.array(conceptSchema).max(20),
  skill_concepts: z.array(z.string().min(1).max(120)).max(50),
  responsibility_concepts: z.array(z.string().min(1).max(120)).max(50),
  current_seniority: z.enum(seniorityLevels),
  target_seniority: z.enum(seniorityLevels),
  employment_types: z.array(z.enum(employmentTypes)),
  working_times: z.array(z.enum(workingTimes)),
  workplace_types: z.array(z.enum(workplaceTypes)),
  uk_locations: z.array(z.string().min(1).max(120)).max(30),
  ir35_statuses: z.array(z.enum(ir35Statuses)),
  compensation_minimum: z.number().int().nonnegative().nullable(),
  compensation_maximum: z.number().int().nonnegative().nullable(),
  compensation_period: z.enum(compensationPeriods),
  allow_unknown_compensation: z.boolean(),
  recency_days: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(7),
    z.literal(14),
    z.literal(30),
  ]),
  notifications_enabled: z.boolean(),
});

// The excerpt column is deliberately absent: the digest runtime is never given
// CV prose, so it cannot leak it into an email, a log, or an error.
const evidenceRowSchema = z.object({
  id: z.string().uuid(),
  normalized_concept: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  category: z.enum(careerEvidenceCategories),
  origin: z.enum(careerEvidenceOrigins),
  confidence: z.coerce.number().min(0).max(1),
  evidence_reference: z.string().min(1).max(200).nullable(),
  proficiency_signal: z.enum(proficiencySignals),
  last_used_at: z.iso.date().nullable(),
  confirmation_state: z.enum(careerEvidenceConfirmationStates),
});

const recipientRowSchema = z.object({
  owner_id: z.string().uuid(),
  email: z.string().min(3).max(320),
  unsubscribe_token: z.string().uuid(),
  searches: z.array(searchRowSchema).max(MAX_SEARCHES_PER_OWNER),
  evidence: z.array(evidenceRowSchema).max(MAX_EVIDENCE_PER_OWNER),
});

const candidateRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  description_text: z.string().max(100_000),
  location: z.string().min(1).max(1_000),
  employment_type: z.enum(employmentTypes),
  working_time: z.enum(workingTimes),
  workplace_type: z.enum(workplaceTypes),
  ir35_status: z.enum(ir35Statuses),
  compensation_minimum: z.number().int().nonnegative().nullable(),
  compensation_maximum: z.number().int().nonnegative().nullable(),
  compensation_period: z.enum(compensationPeriods),
  compensation_provenance: z.enum(compensationProvenances),
  posted_at: z.iso.datetime({ offset: true }).nullable(),
});

const claimRowSchema = z
  .array(
    z.object({
      delivery_id: z.string().uuid().nullable(),
      outcome: z.enum([
        "claimed",
        "already_recorded",
        "suppressed_no_matches",
        "suppressed_daily_cap",
        "suppressed_monthly_cap",
      ]),
    }),
  )
  .length(1);

function toDraft(
  row: z.infer<typeof searchRowSchema>,
): NamedSearchProfileDraft {
  return {
    name: row.name,
    enabled: row.enabled,
    roleFamilies: row.role_families,
    includeTerms: row.include_terms,
    excludeTerms: row.exclude_terms,
    industries: row.industries,
    domains: row.domains,
    skillConcepts: row.skill_concepts,
    responsibilityConcepts: row.responsibility_concepts,
    currentSeniority: row.current_seniority,
    targetSeniority: row.target_seniority,
    employmentTypes: row.employment_types,
    workingTimes: row.working_times,
    workplaceTypes: row.workplace_types,
    ukLocations: row.uk_locations,
    ir35Statuses: row.ir35_statuses,
    compensation: {
      minimum: row.compensation_minimum,
      maximum: row.compensation_maximum,
      period: row.compensation_period,
      allowUnknown: row.allow_unknown_compensation,
    },
    recencyDays: row.recency_days,
    notificationsEnabled: row.notifications_enabled,
  };
}

function toEvidence(
  row: z.infer<typeof evidenceRowSchema>,
): CareerEvidenceItem {
  return {
    id: row.id,
    normalizedConcept: row.normalized_concept,
    label: row.label,
    category: row.category,
    origin: row.origin,
    confidence: row.confidence,
    evidenceReference: row.evidence_reference,
    evidenceExcerpt: null,
    proficiencySignal: row.proficiency_signal,
    lastUsedAt: row.last_used_at,
    confirmationState: row.confirmation_state,
  };
}

function toRecipient(row: z.infer<typeof recipientRowSchema>): DigestRecipient {
  const searches: NotificationSearchProfile[] = row.searches.map((search) => ({
    id: search.id,
    draft: toDraft(search),
  }));

  return {
    ownerId: row.owner_id,
    email: row.email,
    unsubscribeToken: row.unsubscribe_token,
    searches,
    confirmedEvidence: row.evidence.map(toEvidence),
  };
}

function toJobInput(
  row: z.infer<typeof candidateRowSchema>,
): TargetFeedJobInput {
  return {
    id: row.id,
    title: row.title,
    employer: row.employer,
    descriptionText: row.description_text,
    location: row.location,
    employmentType: row.employment_type,
    workingTime: row.working_time,
    workplaceType: row.workplace_type,
    ir35Status: row.ir35_status,
    compensationMinimum: row.compensation_minimum,
    compensationMaximum: row.compensation_maximum,
    compensationPeriod: row.compensation_period,
    compensationProvenance: row.compensation_provenance,
    postedAt: row.posted_at,
  };
}

export function createSupabaseNotificationRepository(
  client: IngestionRpcClient,
): NotificationRepository {
  return {
    async listRecipients(slotKey, maxOwners) {
      const { data, error } = await client.rpc(
        "list_pending_notification_digests",
        { target_slot: slotKey, max_owners: maxOwners },
      );
      databaseFailure(error, "recipients_failed");

      const result = z
        .array(recipientRowSchema)
        .max(maxOwners)
        .safeParse(data ?? []);
      if (!result.success) {
        throw new NotificationRepositoryError("invalid_recipients_response");
      }
      return result.data.map(toRecipient);
    },

    async listCandidateJobs(limit) {
      const { data, error } = await client.rpc(
        "list_notification_candidate_jobs",
        { max_jobs: limit },
      );
      databaseFailure(error, "candidates_failed");

      const result = z
        .array(candidateRowSchema)
        .max(limit)
        .safeParse(data ?? []);
      if (!result.success) {
        throw new NotificationRepositoryError("invalid_candidates_response");
      }
      return result.data.map(toJobInput);
    },

    async listAnnouncedKeys(ownerId, jobIds) {
      // Scoped to the candidate window the caller already holds, so the ledger
      // read cannot grow without bound as the install ages.
      const { data, error } = await client.rpc(
        "list_notification_announcements",
        { target_owner: ownerId, target_job_ids: [...jobIds] },
      );
      databaseFailure(error, "announcements_failed");

      const result = z.array(z.string().min(3).max(100)).safeParse(data ?? []);
      if (!result.success) {
        throw new NotificationRepositoryError("invalid_announcements_response");
      }
      return new Set(result.data);
    },

    async beginDigest({
      ownerId,
      slotKey,
      matchCount,
      dailyLimit,
      monthlyLimit,
    }) {
      const { data, error } = await client.rpc("begin_notification_digest", {
        target_owner: ownerId,
        target_slot: slotKey,
        target_match_count: matchCount,
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
      });
      databaseFailure(error, "begin_failed");

      const result = claimRowSchema.safeParse(data);
      if (!result.success) {
        throw new NotificationRepositoryError("invalid_begin_response");
      }
      const row = result.data[0];
      if (row.outcome === "claimed") {
        if (row.delivery_id === null) {
          throw new NotificationRepositoryError("invalid_begin_response");
        }
        return { outcome: "claimed", deliveryId: row.delivery_id };
      }
      return { outcome: row.outcome } as SlotClaim;
    },

    async finishDigest({
      deliveryId,
      status,
      providerMessageId,
      errorCode,
      announcements,
    }) {
      const { error } = await client.rpc("finish_notification_digest", {
        target_delivery_id: deliveryId,
        target_status: status,
        target_provider_message_id: providerMessageId,
        target_error_code: errorCode,
        target_announcements: announcements.map((announcement) => ({
          search_profile_id: announcement.searchProfileId,
          job_id: announcement.jobId,
        })),
      });
      databaseFailure(error, "finish_failed");
    },
  };
}
