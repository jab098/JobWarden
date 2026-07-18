import { describe, expect, it, vi } from "vitest";

import { createSupabaseCareerExtractionRepository } from "./repository";

const documentId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";

function clients(options: {
  claimData?: unknown;
  claimError?: unknown;
  downloadData?: Blob | null;
  downloadError?: unknown;
  finishError?: unknown;
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_career_profile_extraction") {
      return {
        data: options.claimData ?? null,
        error: options.claimError ?? null,
      };
    }
    return { data: null, error: options.finishError ?? null };
  });
  const download = vi.fn(async () => ({
    data: options.downloadData ?? null,
    error: options.downloadError ?? null,
  }));

  return {
    rpc,
    download,
    caller: { rpc },
    service: {
      rpc,
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
};

describe("career extraction Supabase repository", () => {
  it("claims through a caller-bound RPC that derives the actor", async () => {
    const fake = clients({ claimData: [claimRow] });
    const repository = createSupabaseCareerExtractionRepository(
      fake.caller,
      fake.service,
    );

    await expect(
      repository.claim(documentId, "a".repeat(64), 0),
    ).resolves.toMatchObject({
      disposition: "claimed",
      runId,
      userId,
      cvDocumentId: documentId,
      aiAllowed: false,
    });
    expect(fake.rpc).toHaveBeenCalledWith("claim_career_profile_extraction", {
      target_document_id: documentId,
      idempotency_key_value: "a".repeat(64),
      ai_daily_allowance: 0,
    });
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
        documentId,
        "a".repeat(64),
        0,
      ),
    ).resolves.toMatchObject({ disposition: "existing", proposal });
  });

  it("maps owner denial without leaking database details", async () => {
    const fake = clients({
      claimError: { code: "42501", message: "contains private path" },
    });

    await expect(
      createSupabaseCareerExtractionRepository(fake.caller, fake.service).claim(
        documentId,
        "a".repeat(64),
        0,
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

    const claim = await repository.claim(documentId, "a".repeat(64), 0);
    await expect(repository.download(claim)).rejects.toMatchObject({
      code: "storage_missing",
      message: "Request failed.",
    });
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

    await repository.succeed(runId, proposal, 42, 0, 0);

    expect(fake.rpc).toHaveBeenLastCalledWith(
      "complete_career_profile_extraction",
      {
        target_run_id: runId,
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
