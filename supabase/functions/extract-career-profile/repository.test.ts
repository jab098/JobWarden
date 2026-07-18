import { describe, expect, it, vi } from "vitest";

import { createSupabaseCareerExtractionRepository } from "./repository";

const documentId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const claimToken = "40000000-0000-4000-8000-000000000001";
const sha256Hex =
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

function clients(options: {
  claimData?: unknown;
  claimError?: unknown;
  downloadData?: Blob | null;
  downloadError?: unknown;
  finishError?: unknown;
  userError?: unknown;
  userId?: string | null;
}) {
  const callerRpc = vi.fn(async () => ({ data: null, error: null }));
  const serviceRpc = vi.fn(async (name: string) => {
    if (name === "claim_career_profile_extraction") {
      return {
        data: options.claimData ?? null,
        error: options.claimError ?? null,
      };
    }
    if (name === "renew_career_profile_extraction_lease") {
      return { data: "2026-07-18T12:01:00.000Z", error: null };
    }
    return { data: null, error: options.finishError ?? null };
  });
  const download = vi.fn(async () => ({
    data: options.downloadData ?? null,
    error: options.downloadError ?? null,
  }));

  return {
    callerRpc,
    serviceRpc,
    download,
    caller: {
      rpc: callerRpc,
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user:
              options.userId === null ? null : { id: options.userId ?? userId },
          },
          error: options.userError ?? null,
        })),
      },
    },
    service: {
      rpc: serviceRpc,
      storage: { from: vi.fn(() => ({ download })) },
    },
  };
}

const claimRow = {
  disposition: "claimed",
  run_id: runId,
  user_id: userId,
  cv_document_id: documentId,
  storage_path: `${userId}/fictional-cv.docx`,
  original_file_name: "fictional-cv.docx",
  media_type:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  byte_size: 512,
  ai_allowed: false,
  status: "running",
  proposal: null,
  error_code: null,
  claim_token: claimToken,
  lease_expires_at: "2026-07-18T12:01:00.000Z",
  sha256_hex: sha256Hex,
};

describe("career extraction Supabase repository", () => {
  it("derives the actor from the verified bearer client and claims through the service client", async () => {
    const fake = clients({ claimData: [claimRow] });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    const verifiedUserId = await repository.verifyUser();
    await expect(
      repository.claim(verifiedUserId, documentId, "a".repeat(64)),
    ).resolves.toMatchObject({
      disposition: "claimed",
      runId,
      userId,
      cvDocumentId: documentId,
      aiAllowed: false,
      claimToken,
      sha256Hex,
    });
    expect(fake.callerRpc).not.toHaveBeenCalled();
    expect(fake.serviceRpc).toHaveBeenCalledWith(
      "claim_career_profile_extraction",
      {
        target_user_id: userId,
        target_document_id: documentId,
        idempotency_key_value: "a".repeat(64),
      },
    );
  });

  it("rejects an unverifiable bearer identity before a service claim", async () => {
    const fake = clients({ claimData: [claimRow], userId: null });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    await expect(repository.verifyUser()).rejects.toMatchObject({
      code: "unauthorised",
      message: "Request failed.",
    });
    expect(fake.serviceRpc).not.toHaveBeenCalled();
  });

  it("returns an existing successful proposal without downloading again", async () => {
    const proposal = { version: "deterministic-v1", evidence: [] };
    const fake = clients({
      claimData: [
        {
          ...claimRow,
          disposition: "existing",
          status: "succeeded",
          proposal,
        },
      ],
    });

    await expect(
      createSupabaseCareerExtractionRepository(fake.caller, fake.service).claim(
        userId,
        documentId,
        "a".repeat(64),
      ),
    ).resolves.toMatchObject({ disposition: "existing", proposal });
  });

  it("maps owner denial without leaking database details", async () => {
    const fake = clients({
      claimError: { code: "42501", message: "contains private path" },
    });

    await expect(
      createSupabaseCareerExtractionRepository(fake.caller, fake.service).claim(
        userId,
        documentId,
        "a".repeat(64),
      ),
    ).rejects.toMatchObject({ code: "forbidden", message: "Request failed." });
  });

  it("downloads only the claimed private object and validates its byte count", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fake = clients({
      claimData: [claimRow],
      downloadData: new Blob([bytes]),
    });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    await expect(
      repository.download({
        disposition: "claimed",
        runId,
        userId,
        cvDocumentId: documentId,
        storagePath: claimRow.storage_path,
        originalFileName: claimRow.original_file_name,
        mediaType: claimRow.media_type,
        byteSize: bytes.length,
        aiAllowed: false,
        status: "running",
        proposal: null,
        errorCode: null,
        claimToken,
        leaseExpiresAt: "2026-07-18T12:01:00.000Z",
        sha256Hex,
      }),
    ).resolves.toEqual(bytes);
    expect(fake.service.storage.from).toHaveBeenCalledWith("career-documents");
    expect(fake.download).toHaveBeenCalledWith(claimRow.storage_path);
  });

  it("returns a safe storage error for missing or mismatched objects", async () => {
    const fake = clients({
      claimData: [claimRow],
      downloadData: new Blob(["x"]),
    });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    const claim = await repository.claim(userId, documentId, "a".repeat(64));
    await expect(repository.download(claim)).rejects.toMatchObject({
      code: "storage_missing",
      message: "Request failed.",
    });
  });

  it("rejects same-sized Storage bytes whose SHA-256 differs from registration", async () => {
    const bytes = new Uint8Array([3, 2, 1]);
    const fake = clients({
      claimData: [claimRow],
      downloadData: new Blob([bytes]),
    });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );
    const claim = await repository.claim(userId, documentId, "a".repeat(64));

    await expect(
      repository.download({ ...claim, byteSize: bytes.length }),
    ).rejects.toMatchObject({ code: "storage_missing" });
  });

  it("renews and finalises only with the matching claim token", async () => {
    const fake = clients({ claimData: [claimRow] });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    await repository.renew(runId, claimToken);
    expect(fake.serviceRpc).toHaveBeenLastCalledWith(
      "renew_career_profile_extraction_lease",
      { target_run_id: runId, target_claim_token: claimToken },
    );

    await repository.fail(runId, claimToken, "internal_error");
    expect(fake.serviceRpc).toHaveBeenLastCalledWith(
      "complete_career_profile_extraction",
      expect.objectContaining({
        target_run_id: runId,
        target_claim_token: claimToken,
        requested_status: "failed",
      }),
    );
  });

  it("finalises through the service-only narrow RPC", async () => {
    const fake = clients({ claimData: [claimRow] });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );
    const proposal = {
      version: "deterministic-v1",
      inputCharacterCount: 42,
      evidence: [],
      suggestions: [],
      aiSuggestions: [],
    };

    await repository.succeed(runId, claimToken, proposal, 42, 0, 0);

    expect(fake.serviceRpc).toHaveBeenLastCalledWith(
      "complete_career_profile_extraction",
      {
        target_run_id: runId,
        target_claim_token: claimToken,
        requested_status: "succeeded",
        proposal_value: proposal,
        sanitised_error_code: null,
        input_character_count_value: 42,
        evidence_count_value: 0,
        suggestion_count_value: 0,
      },
    );
  });
});
