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
  };
}

export function createSupabaseCareerExtractionRepository(
  callerClient: CareerRpcClient,
  serviceClient: CareerServiceClient,
): CareerExtractionRepository {
  return {
    async claim(cvDocumentId, idempotencyKey, aiDailyAllowance) {
      const { data, error } = await callerClient.rpc(
        "claim_career_profile_extraction",
        {
          target_document_id: cvDocumentId,
          idempotency_key_value: idempotencyKey,
          ai_daily_allowance: aiDailyAllowance,
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
      if (bytes.length !== claim.byteSize) {
        throw new CareerExtractionError("storage_missing");
      }
      return bytes;
    },

    async succeed(
      runId,
      proposal,
      inputCharacterCount,
      evidenceCount,
      suggestionCount,
    ) {
      const { error } = await serviceClient.rpc(
        "complete_career_profile_extraction",
        {
          target_run_id: runId,
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

    async fail(runId, errorCode) {
      const { error } = await serviceClient.rpc(
        "complete_career_profile_extraction",
        {
          target_run_id: runId,
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
