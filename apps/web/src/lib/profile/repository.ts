import "server-only";

import type {
  CareerProfileDraft,
  NamedSearchProfileDraft,
} from "@jobwarden/domain";

import type { ProfileSnapshot, ProfileUploadCapability } from "./types";

export type ProfileRepositoryErrorCode =
  "invalid" | "not_found" | "read_only" | "unavailable";

export class ProfileRepositoryError extends Error {
  override readonly name = "ProfileRepositoryError";

  constructor(readonly code: ProfileRepositoryErrorCode) {
    super("Career profile operation could not be completed.");
  }
}

export interface ProfileRepository {
  readonly uploadCapability: ProfileUploadCapability;
  getSnapshot(): Promise<ProfileSnapshot>;
  saveDraft(generation: number, draft: CareerProfileDraft): Promise<void>;
  acceptEvidence(evidenceId: string): Promise<void>;
  rejectEvidence(evidenceId: string): Promise<void>;
  acceptSuggestion(suggestionId: string): Promise<void>;
  rejectSuggestion(suggestionId: string): Promise<void>;
  saveSearch(
    generation: number,
    searchId: string | null,
    draft: NamedSearchProfileDraft,
  ): Promise<string>;
  deleteCv(): Promise<void>;
  deleteProfileData(): Promise<void>;
}
