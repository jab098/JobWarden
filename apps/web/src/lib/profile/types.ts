import type {
  CareerEvidenceItem,
  CareerProfileDraft,
  NamedSearchProfileDraft,
  ProfileSuggestion,
} from "@jobwarden/domain";

export type ProfileDataMode = "fixtures" | "supabase";

export type CvDocumentView = {
  id: string;
  fileName: string;
  kind: "docx" | "pdf";
  lifecycleStatus: "uploaded" | "processing" | "ready" | "failed";
  uploadedAt: string;
};

export type SavedSearchProfile = NamedSearchProfileDraft & { id: string };

/**
 * Whether the CV upload control is live, and if not, why. The reason drives the
 * explanation the user reads.
 *
 * There is deliberately no "no session" reason. A sessionless caller never
 * reaches capability derivation at all: `get_career_profile_snapshot` raises
 * 42501 when `auth.uid()` is null, which becomes a thrown repository error, so
 * no snapshot — and therefore no capability — is ever produced down that path.
 * A branch for it would be a state the code cannot reach.
 */
export type ProfileUploadCapability =
  | Readonly<{ enabled: true }>
  | Readonly<{
      enabled: false;
      reason: "fictional_preview" | "uploads_disabled";
    }>;

export type ProfileSnapshot = Readonly<{
  generation: number;
  draft: CareerProfileDraft | null;
  /** All evidence items, present even when no profile draft exists yet. */
  evidence: readonly CareerEvidenceItem[];
  currentCv: CvDocumentView | null;
  suggestions: readonly ProfileSuggestion[];
  searches: readonly SavedSearchProfile[];
  uploadCapability: ProfileUploadCapability;
  dataMode: ProfileDataMode;
}>;

export type ProfileActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string; resourceId?: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
