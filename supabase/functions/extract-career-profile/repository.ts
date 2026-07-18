import { z } from "zod";

import type {
  CareerExtractionRepository,
  CareerRpcClient,
  CareerServiceClient,
  ExtractionClaim,
} from "./contracts.ts";
import { CareerExtractionError } from "./errors.ts";

const claimRowSchema = z
  .object({
    disposition: z.enum(["claimed", "existing"]),
    run_id: z.string().uuid(),
    user_id: z.string().uuid(),
    cv_document_id: z.string().uuid(),
    storage_path: z.string().min(3).max(1_024),
    original_file_name: z.string().min(1).max(255),
    media_type: z.enum([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
    ]),
    byte_size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    ai_allowed: z.boolean(),
    status: z.enum(["running", "succeeded", "failed"]),
    proposal: z.unknown().nullable(),
    error_code: z.string().min(3).max(100).nullable(),
    claim_token: z.string().uuid().nullable(),
    lease_expires_at: z.iso.datetime({ offset: true }).nullable(),
    sha256_hex: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .refine(
    (row) => row.storage_path.split("/")[0] === row.user_id,
    "Object path does not match the derived owner.",
  );

function repositoryFailure(error: unknown): never {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "42501") throw new CareerExtractionError("forbidden");
    if (code === "P0002") throw new CareerExtractionError("not_found");
    if (code === "55P03") throw new CareerExtractionError("already_running");
  }
  throw new CareerExtractionError("persistence_failed");
}

function mapClaim(input: unknown): ExtractionClaim {
  const result = z.array(claimRowSchema).length(1).safeParse(input);
  if (!result.success) throw new CareerExtractionError("persistence_failed");
  const [row] = result.data;
  return {
    disposition: row.disposition,
    runId: row.run_id,
    userId: row.user_id,
    cvDocumentId: row.cv_document_id,
    storagePath: row.storage_path,
    originalFileName: row.original_file_name,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    aiAllowed: row.ai_allowed,
    status: row.status,
    proposal: row.proposal,
    errorCode: row.error_code,
    claimToken: row.claim_token,
    leaseExpiresAt: row.lease_expires_at,
    sha256Hex: row.sha256_hex,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", source.buffer),
  );
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createSupabaseCareerExtractionRepository(
  callerClient: CareerRpcClient,
  serviceClient: CareerServiceClient,
): CareerExtractionRepository {
  return {
    async verifyUser() {
      const { data, error } = await callerClient.auth.getUser();
      const parsed = z.string().uuid().safeParse(data.user?.id);
      if ((error !== null && error !== undefined) || !parsed.success) {
        throw new CareerExtractionError("unauthorised");
      }
      return parsed.data;
    },

    async claim(userId, cvDocumentId, idempotencyKey) {
      const { data, error } = await serviceClient.rpc(
        "claim_career_profile_extraction",
        {
          target_user_id: userId,
          target_document_id: cvDocumentId,
          idempotency_key_value: idempotencyKey,
        },
      );
      if (error !== null && error !== undefined) repositoryFailure(error);
      return mapClaim(data);
    },

    async download(claim) {
      const { data, error } = await serviceClient.storage
        .from("career-documents")
        .download(claim.storagePath);
      if ((error !== null && error !== undefined) || data === null) {
        throw new CareerExtractionError("storage_missing");
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (
        bytes.length !== claim.byteSize ||
        (await sha256Hex(bytes)) !== claim.sha256Hex
      ) {
        throw new CareerExtractionError("storage_missing");
      }
      return bytes;
    },

    async renew(runId, claimToken) {
      const { data, error } = await serviceClient.rpc(
        "renew_career_profile_extraction_lease",
        {
          target_run_id: runId,
          target_claim_token: claimToken,
        },
      );
      if (error !== null && error !== undefined) repositoryFailure(error);
      const parsed = z.coerce.date().safeParse(data);
      if (!parsed.success)
        throw new CareerExtractionError("persistence_failed");
      return parsed.data;
    },

    async succeed(
      runId,
      claimToken,
      proposal,
      inputCharacterCount,
      evidenceCount,
      suggestionCount,
    ) {
      const { error } = await serviceClient.rpc(
        "complete_career_profile_extraction",
        {
          target_run_id: runId,
          target_claim_token: claimToken,
          requested_status: "succeeded",
          proposal_value: proposal,
          sanitised_error_code: null,
          input_character_count_value: inputCharacterCount,
          evidence_count_value: evidenceCount,
          suggestion_count_value: suggestionCount,
        },
      );
      if (error !== null && error !== undefined) repositoryFailure(error);
    },

    async fail(runId, claimToken, errorCode) {
      const { error } = await serviceClient.rpc(
        "complete_career_profile_extraction",
        {
          target_run_id: runId,
          target_claim_token: claimToken,
          requested_status: "failed",
          proposal_value: null,
          sanitised_error_code: errorCode,
          input_character_count_value: 0,
          evidence_count_value: 0,
          suggestion_count_value: 0,
        },
      );
      if (error !== null && error !== undefined) repositoryFailure(error);
    },
  };
}
