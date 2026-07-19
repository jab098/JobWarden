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
 * explanation the user reads, so the three cases stay distinct: a fictional
 * preview, an administrator who has not opened uploads, and a build with no
 * session to upload under.
 */
export type ProfileUploadCapability =
  | Readonly<{ enabled: true }>
  | Readonly<{
      enabled: false;
      reason:
        | "fictional_preview"
        | "uploads_disabled"
        | "live_auth_and_storage_verification_required";
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
