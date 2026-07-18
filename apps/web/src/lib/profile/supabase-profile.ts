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
type ProfileClient = {
  from(table: string): {
    select(columns: string): Promise<QueryResponse>;
  };
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<QueryResponse>;
    };
  };
};

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

const columns = {
  profile:
    "current_seniority,target_seniority,target_role_families,industries,domains,keywords",
  evidence:
    "id,normalized_concept,label,category,origin,confidence,evidence_reference,evidence_excerpt,proficiency_signal,last_used_at,confirmation_state",
  suggestions:
    "id,kind,normalized_concept,label,confidence,evidence_item_ids,state,proposed_at",
  searches:
    "id,name,enabled,role_families,include_terms,exclude_terms,industries,domains,skill_concepts,responsibility_concepts,current_seniority,target_seniority,employment_types,working_times,workplace_types,uk_locations,ir35_statuses,compensation_minimum,compensation_maximum,compensation_period,allow_unknown_compensation,recency_days,notifications_enabled",
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
        const [
          profileResponse,
          evidenceResponse,
          suggestionResponse,
          searchResponse,
          cvResponse,
        ] = await Promise.all([
          supabase.from("career_profiles").select(columns.profile),
          supabase.from("career_evidence_items").select(columns.evidence),
          supabase.from("profile_suggestions").select(columns.suggestions),
          supabase.from("search_profiles").select(columns.searches),
          supabase.from("cv_documents").select(columns.cv),
        ]);
        const profiles = z
          .array(profileRowSchema)
          .max(1)
          .parse(data(profileResponse));
        const evidence = mapEvidence(data(evidenceResponse));
        const cvs = z.array(cvRowSchema).parse(data(cvResponse));
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
        const profile = profiles[0];
        const draft = profile
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
          draft,
          currentCv,
          suggestions: mapSuggestions(data(suggestionResponse)),
          searches: mapSearches(data(searchResponse)),
          uploadCapability: disabledUpload,
          dataMode: "supabase",
        };
      } catch (error) {
        if (error instanceof ProfileRepositoryError) throw error;
        throw new ProfileRepositoryError("unavailable");
      }
    },

    async saveDraft(input: CareerProfileDraft) {
      const draft = careerProfileDraftSchema.parse(input);
      await call(supabase, "save_career_profile_draft", { draft_value: draft });
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

    async saveSearch(input: NamedSearchProfileDraft) {
      const draft = namedSearchProfileDraftSchema.parse(input);
      return z
        .string()
        .uuid()
        .parse(
          await call(supabase, "save_search_profile", { draft_value: draft }),
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
      const response = await supabase.from("cv_documents").select(columns.cv);
      const paths = z
        .array(cvRowSchema)
        .parse(data(response))
        .filter((row) => row.lifecycle_status !== "deleted")
        .map((row) => row.storage_path);
      if (paths.length > 0) {
        data(await supabase.storage.from("career-documents").remove(paths));
      }
      await call(supabase, "delete_career_profile_data");
    },
  };
}
