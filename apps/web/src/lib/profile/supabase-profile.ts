import "server-only";

import {
  careerEvidenceItemSchema,
  careerProfileDraftSchema,
  namedSearchProfileDraftSchema,
  profileSuggestionSchema,
  type CareerProfileDraft,
  type NamedSearchProfileDraft,
} from "@jobwarden/domain";
import { z } from "zod";

import type { ProfileRepository } from "./repository";
import { ProfileRepositoryError } from "./repository";
import type {
  CvDocumentView,
  ProfileSnapshot,
  SavedSearchProfile,
} from "./types";

type QueryResponse = { data: unknown; error: unknown };
type ProfileQuery = PromiseLike<QueryResponse> & {
  order(column: string, options: { ascending: boolean }): ProfileQuery;
};
type StorageBucket = {
  list(
    prefix: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: "name"; order: "asc" };
    },
  ): Promise<QueryResponse>;
  remove(paths: string[]): Promise<QueryResponse>;
};
type ProfileClient = {
  from(table: string): {
    select(columns: string): ProfileQuery;
  };
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  storage: {
    from(bucket: string): StorageBucket;
  };
};

const storagePageSize = 100;
const maximumStoragePages = 100;

const conceptSchema = z.object({
  normalizedConcept: z.string(),
  label: z.string(),
});
const profileRowSchema = z.object({
  current_seniority: z.string(),
  target_seniority: z.string(),
  target_role_families: z.array(conceptSchema),
  industries: z.array(conceptSchema),
  domains: z.array(conceptSchema),
  keywords: z.array(z.string()),
});
const evidenceRowSchema = z.object({
  id: z.string().uuid(),
  normalized_concept: z.string(),
  label: z.string(),
  category: z.string(),
  origin: z.string(),
  confidence: z.coerce.number(),
  evidence_reference: z.string().nullable(),
  evidence_excerpt: z.string().nullable(),
  proficiency_signal: z.string(),
  last_used_at: z.string().nullable(),
  confirmation_state: z.string(),
});
const suggestionRowSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  normalized_concept: z.string(),
  label: z.string(),
  confidence: z.coerce.number(),
  evidence_item_ids: z.array(z.string()),
  state: z.string(),
  proposed_at: z.string(),
});
const cvRowSchema = z.object({
  id: z.string().uuid(),
  storage_path: z.string(),
  original_file_name: z.string(),
  file_kind: z.enum(["docx", "pdf"]),
  lifecycle_status: z.enum([
    "uploaded",
    "processing",
    "ready",
    "failed",
    "deleted",
  ]),
  is_current: z.boolean(),
  uploaded_at: z.string(),
});
const searchRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  enabled: z.boolean(),
  role_families: z.array(conceptSchema),
  include_terms: z.array(z.string()),
  exclude_terms: z.array(z.string()),
  industries: z.array(conceptSchema),
  domains: z.array(conceptSchema),
  skill_concepts: z.array(z.string()),
  responsibility_concepts: z.array(z.string()),
  current_seniority: z.string(),
  target_seniority: z.string(),
  employment_types: z.array(z.string()),
  working_times: z.array(z.string()),
  workplace_types: z.array(z.string()),
  uk_locations: z.array(z.string()),
  ir35_statuses: z.array(z.string()),
  compensation_minimum: z.number().nullable(),
  compensation_maximum: z.number().nullable(),
  compensation_period: z.string(),
  allow_unknown_compensation: z.boolean(),
  recency_days: z.number(),
  notifications_enabled: z.boolean(),
});
const storageObjectSchema = z.object({
  name: z.string().min(1).max(500),
  id: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});
const snapshotRowSchema = z.object({
  generation: z.coerce.number().int().nonnegative(),
  profile: profileRowSchema.nullable(),
  evidence: z.array(evidenceRowSchema),
  suggestions: z.array(suggestionRowSchema),
  searches: z.array(searchRowSchema),
  cvs: z.array(cvRowSchema),
});

const columns = {
  cv: "id,storage_path,original_file_name,file_kind,lifecycle_status,is_current,uploaded_at",
} as const;

const disabledUpload = Object.freeze({
  enabled: false as const,
  reason: "live_auth_and_storage_verification_required" as const,
});

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new ProfileRepositoryError("unavailable");
  }
  return response.data;
}

async function call(
  client: ProfileClient,
  name: string,
  parameters?: Record<string, unknown>,
): Promise<unknown> {
  const response = await client.rpc(name, parameters);
  return data(response);
}

async function authenticatedOwnerId(client: ProfileClient): Promise<string> {
  const response = await client.auth.getUser();
  if (response.error !== null && response.error !== undefined) {
    throw new ProfileRepositoryError("unavailable");
  }
  const user = z
    .object({ id: z.string().uuid() })
    .nullable()
    .parse(response.data.user);
  if (!user) throw new ProfileRepositoryError("unavailable");
  return user.id;
}

async function listOwnerStoragePaths(
  bucket: StorageBucket,
  ownerId: string,
): Promise<string[]> {
  const paths: string[] = [];
  const prefixes = [ownerId];
  let pagesRead = 0;
  for (let prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
    const prefix = prefixes[prefixIndex];
    if (!prefix) throw new ProfileRepositoryError("unavailable");
    for (let offset = 0; ; offset += storagePageSize) {
      if (pagesRead >= maximumStoragePages) {
        throw new ProfileRepositoryError("unavailable");
      }
      const objects = z.array(storageObjectSchema).parse(
        data(
          await bucket.list(prefix, {
            limit: storagePageSize,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        ),
      );
      pagesRead += 1;
      for (const object of objects) {
        const path = `${prefix}/${object.name}`;
        if (object.id === null && object.metadata === null) {
          prefixes.push(path);
        } else {
          paths.push(path);
        }
      }
      if (objects.length < storagePageSize) break;
    }
  }
  return paths;
}

async function removeStoragePaths(
  bucket: StorageBucket,
  paths: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < paths.length; offset += storagePageSize) {
    data(await bucket.remove(paths.slice(offset, offset + storagePageSize)));
  }
}

function mapEvidence(input: unknown) {
  return z
    .array(evidenceRowSchema)
    .parse(input)
    .map((row) =>
      careerEvidenceItemSchema.parse({
        id: row.id,
        normalizedConcept: row.normalized_concept,
        label: row.label,
        category: row.category,
        origin: row.origin,
        confidence: row.confidence,
        evidenceReference: row.evidence_reference,
        evidenceExcerpt: row.evidence_excerpt,
        proficiencySignal: row.proficiency_signal,
        lastUsedAt: row.last_used_at,
        confirmationState: row.confirmation_state,
      }),
    );
}

function mapSuggestions(input: unknown) {
  return z
    .array(suggestionRowSchema)
    .parse(input)
    .map((row) =>
      profileSuggestionSchema.parse({
        id: row.id,
        kind: row.kind,
        normalizedConcept: row.normalized_concept,
        label: row.label,
        confidence: row.confidence,
        evidenceItemIds: row.evidence_item_ids,
        state: row.state,
        proposedAt: row.proposed_at,
      }),
    );
}

function mapSearches(input: unknown): SavedSearchProfile[] {
  return z
    .array(searchRowSchema)
    .parse(input)
    .map((row) => ({
      id: row.id,
      ...namedSearchProfileDraftSchema.parse({
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
      }),
    }));
}

export function createSupabaseProfileRepository(
  client: object,
): ProfileRepository {
  const supabase = client as ProfileClient;
  return {
    uploadCapability: disabledUpload,

    async getSnapshot(): Promise<ProfileSnapshot> {
      try {
        const snapshot = snapshotRowSchema.parse(
          await call(supabase, "get_career_profile_snapshot"),
        );
        const evidence = mapEvidence(snapshot.evidence);
        const cvs = snapshot.cvs;
        const currentCvRow = cvs.find(
          (item) => item.is_current && item.lifecycle_status !== "deleted",
        );
        const currentCv: CvDocumentView | null = currentCvRow
          ? {
              id: currentCvRow.id,
              fileName: currentCvRow.original_file_name,
              kind: currentCvRow.file_kind,
              lifecycleStatus: z
                .enum(["uploaded", "processing", "ready", "failed"])
                .parse(currentCvRow.lifecycle_status),
              uploadedAt: currentCvRow.uploaded_at,
            }
          : null;
        const profile = snapshot.profile;
        const hasProfileSignal =
          currentCv !== null ||
          evidence.length > 0 ||
          (profile?.target_role_families.length ?? 0) > 0 ||
          (profile?.industries.length ?? 0) > 0 ||
          (profile?.domains.length ?? 0) > 0 ||
          (profile?.keywords.length ?? 0) > 0;
        const draft =
          profile && hasProfileSignal
            ? careerProfileDraftSchema.parse({
                cvDocumentId: currentCv?.id ?? null,
                currentSeniority: profile.current_seniority,
                targetSeniority: profile.target_seniority,
                evidence,
                targetRoleFamilies: profile.target_role_families,
                industries: profile.industries,
                domains: profile.domains,
                keywords: profile.keywords,
              })
            : null;
        return {
          generation: snapshot.generation,
          draft,
          currentCv,
          suggestions: mapSuggestions(snapshot.suggestions),
          searches: mapSearches(snapshot.searches),
          uploadCapability: disabledUpload,
          dataMode: "supabase",
        };
      } catch (error) {
        if (error instanceof ProfileRepositoryError) throw error;
        throw new ProfileRepositoryError("unavailable");
      }
    },

    async saveDraft(generation: number, input: CareerProfileDraft) {
      const draft = careerProfileDraftSchema.parse(input);
      await call(supabase, "save_career_profile_draft", {
        expected_generation: z.number().int().nonnegative().parse(generation),
        draft_value: draft,
      });
    },

    async acceptEvidence(evidenceId) {
      await call(supabase, "decide_career_evidence", {
        target_evidence_id: z.string().uuid().parse(evidenceId),
        target_state: "confirmed",
      });
    },

    async rejectEvidence(evidenceId) {
      await call(supabase, "decide_career_evidence", {
        target_evidence_id: z.string().uuid().parse(evidenceId),
        target_state: "rejected",
      });
    },

    async acceptSuggestion(suggestionId) {
      await call(supabase, "decide_profile_suggestion", {
        target_suggestion_id: z.string().uuid().parse(suggestionId),
        target_state: "accepted",
      });
    },

    async rejectSuggestion(suggestionId) {
      await call(supabase, "decide_profile_suggestion", {
        target_suggestion_id: z.string().uuid().parse(suggestionId),
        target_state: "rejected",
      });
    },

    async saveSearch(
      generation: number,
      searchId: string | null,
      input: NamedSearchProfileDraft,
    ) {
      const draft = namedSearchProfileDraftSchema.parse(input);
      const targetSearchId = searchId
        ? z.string().uuid().parse(searchId)
        : null;
      return z
        .string()
        .uuid()
        .parse(
          await call(supabase, "save_search_profile", {
            expected_generation: z
              .number()
              .int()
              .nonnegative()
              .parse(generation),
            target_search_id: targetSearchId,
            draft_value: draft,
          }),
        );
    },

    async deleteCv() {
      const response = await supabase.from("cv_documents").select(columns.cv);
      const current = z
        .array(cvRowSchema)
        .parse(data(response))
        .find((row) => row.is_current && row.lifecycle_status !== "deleted");
      if (!current) throw new ProfileRepositoryError("not_found");
      const storageResponse = await supabase.storage
        .from("career-documents")
        .remove([current.storage_path]);
      data(storageResponse);
      await call(supabase, "delete_current_cv", {
        target_document_id: current.id,
        expected_storage_path: current.storage_path,
      });
    },

    async deleteProfileData() {
      const ownerId = await authenticatedOwnerId(supabase);
      const bucket = supabase.storage.from("career-documents");
      const listedPaths = await listOwnerStoragePaths(bucket, ownerId);
      const response = await supabase.from("cv_documents").select(columns.cv);
      const registeredPaths = z
        .array(cvRowSchema)
        .parse(data(response))
        .map((row) => row.storage_path);
      const paths = [...new Set([...listedPaths, ...registeredPaths])];
      if (paths.length > 0) {
        await removeStoragePaths(bucket, paths);
        if ((await listOwnerStoragePaths(bucket, ownerId)).length > 0) {
          throw new ProfileRepositoryError("unavailable");
        }
      }
      await call(supabase, "delete_career_profile_data");
    },
  };
}
