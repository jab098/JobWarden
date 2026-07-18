import { describe, expect, it, vi } from "vitest";

import type {
  CareerExtractionDependencies,
  CareerExtractionRepository,
  CareerRuntimeLog,
  ExtractionClaim,
} from "./contracts";
import { CareerExtractionError } from "./errors";
import { createCareerExtractionHandler } from "./handler";

const documentId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const correlationId = "40000000-0000-4000-8000-000000000001";

function fictionalDocx(): Uint8Array {
  const fixture =
    "UEsDBBQAAAAIAOI+8ly6d6ScywAAAFMBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQvVLDQAyEX+XmWiYnQ0HB2E4BtEDBC2jOsn3D/c1JCeHtkRNIQUcp7Wq/HfX7U4rmSI1DyYO9dZ3dj/37VyU2qmQe7CpSHwDYr5SQXamUVZlLSyg6tgUq+g9cCO667h58yUJZdrJl2LF/ohkPUczzSdcXSqPI1jxejBtrsFhrDB5FdTjm6Q9l90Nwenn28Boq36jBwti/av0WJjJv2OQFk8bBZ2kTTMUfkiLcZvwXr8xz8HS939JqK56YQ15SdFclYci/PeD8tvEbUEsDBBQAAAAIAOI+8lxfM5VSlQAAAAcBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRD5A3TIwoKZdWLoiLhAlbhPRPOSE1+3JwEARA6N///os9+PDr+JGnF0MErqmhXHoT7SqUoNsXcqiNkKWYEtJB8SsLXmVm5go1M0c2atSR14wKX1RC+GubffInwZsTTEZCTyZDsT5megfO86z03SM+uoplB8nvhpVVrxQkXCPbNC846aygEOPmxeHF1BLAwQUAAAACADiPvJcoGlo+LkAAAADAQAAEQAAAHdvcmQvZG9jdW1lbnQueG1sNY89bsMwDIWvQvgAltuhg+E4W6cuRU/AiqwtVH+QmLq5fcgEWZ4kfIS+x+X8nyL8ceuh5NPwMk7DeV2OmYq/JM4CinOfj9Owi9TZue53TtjHUjkr+yktoeizbe4ojWornnsPeUvRvU7Tm0sY8mBffhe62lktmoWs78GLijGCx0yBUBiIY9BCTIAKrhJ8h5BqZOuDNq6AoAv+8l4icYOkk9udw8Xc8PX5MS7ODJYq01Sv5qOFXp4brjdQSwECFAAUAAAACADiPvJcuneknMsAAABTAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAOI+8lxfM5VSlQAAAAcBAAALAAAAAAAAAAAAAAAAAPwAAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAOI+8lygaWj4uQAAAAMBAAARAAAAAAAAAAAAAAAAALoBAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAACiAgAAAAA=";
  return Uint8Array.from(atob(fixture), (character) => character.charCodeAt(0));
}

function claimed(aiAllowed = false): ExtractionClaim {
  const bytes = fictionalDocx();
  return {
    disposition: "claimed",
    runId,
    userId,
    cvDocumentId: documentId,
    storagePath: `${userId}/fictional.docx`,
    originalFileName: "fictional.docx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: bytes.length,
    aiAllowed,
    status: "running",
    proposal: null,
    errorCode: null,
  };
}

function harness(
  options: {
    claim?: ExtractionClaim | Error;
    bytes?: Uint8Array | Error;
    aiResult?: unknown | Error;
    logs?: CareerRuntimeLog[];
    allowance?: number;
  } = {},
) {
  const claimResult = options.claim ?? claimed();
  const bytesResult = options.bytes ?? fictionalDocx();
  const repository: CareerExtractionRepository = {
    claim: vi.fn(async () => {
      if (claimResult instanceof Error) throw claimResult;
      return claimResult;
    }),
    download: vi.fn(async () => {
      if (bytesResult instanceof Error) throw bytesResult;
      return bytesResult;
    }),
    succeed: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
  const dependencies: CareerExtractionDependencies = {
    readEnvironment: () => ({
      supabaseUrl: "https://fixture.supabase.co",
      anonKey: "fixture-anon-key-with-sufficient-length",
      serviceRoleKey: "fixture-service-role-key-with-sufficient-length",
      aiDailyAllowance: options.allowance ?? 0,
      aiModel: "fixture-model",
    }),
    createRepository: () => repository,
    generateSuggestions: vi.fn(async () => {
      if (options.aiResult instanceof Error) throw options.aiResult;
      return options.aiResult ?? [];
    }),
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    randomUuid: () => correlationId,
    log: (record) => options.logs?.push(record),
  };
  return { dependencies, repository };
}

function request(
  options: {
    token?: string;
    body?: unknown;
    method?: string;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.token !== undefined) {
    headers.set("authorization", `Bearer ${options.token}`);
  }
  return new Request(
    "https://example.test/functions/v1/extract-career-profile",
    {
      method: options.method ?? "POST",
      headers,
      body:
        options.method === "GET"
          ? undefined
          : JSON.stringify(
              options.body ?? {
                cvDocumentId: documentId,
                idempotencyKey: "a".repeat(64),
              },
            ),
    },
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("career extraction handler", () => {
  it("rejects unauthenticated requests before repository access", async () => {
    const { dependencies, repository } = harness();
    const response =
      await createCareerExtractionHandler(dependencies)(request());

    expect(response.status).toBe(401);
    expect(repository.claim).not.toHaveBeenCalled();
    expect(await json(response)).toEqual({ error: "unauthorised" });
  });

  it("maps wrong-owner claims to one safe forbidden response", async () => {
    const { dependencies } = harness({
      claim: new CareerExtractionError("forbidden"),
    });
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ correlationId, error: "forbidden" });
  });

  it("persists a deterministic proposal from the private object", async () => {
    const { dependencies, repository } = harness();
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      correlationId,
      status: "succeeded",
      evidenceCount: 3,
      aiSuggestionCount: 0,
    });
    expect(repository.succeed).toHaveBeenCalledOnce();
  });

  it("persists a safe failure code for an unsafe file", async () => {
    const { dependencies, repository } = harness({
      bytes: new Uint8Array([0x4d, 0x5a, 0x00]),
    });
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(422);
    expect(await json(response)).toEqual({
      correlationId,
      error: "invalid_file",
    });
    expect(repository.fail).toHaveBeenCalledWith(runId, "invalid_file");
  });

  it("returns an existing successful result idempotently", async () => {
    const existing = {
      ...claimed(),
      disposition: "existing" as const,
      status: "succeeded" as const,
      proposal: {
        version: "deterministic-v1",
        evidence: [{ normalizedConcept: "sql" }],
        suggestions: [],
        aiSuggestions: [],
      },
    };
    const { dependencies, repository } = harness({ claim: existing });
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "succeeded",
      idempotent: true,
      evidenceCount: 1,
    });
    expect(repository.download).not.toHaveBeenCalled();
  });

  it("does not call AI when disabled or quota-denied", async () => {
    const { dependencies } = harness({ claim: claimed(false), allowance: 5 });
    await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );
    expect(dependencies.generateSuggestions).not.toHaveBeenCalled();
  });

  it("discards invalid AI output without discarding deterministic evidence", async () => {
    const { dependencies, repository } = harness({
      claim: claimed(true),
      allowance: 1,
      aiResult: [{ untrusted: "private text must not escape" }],
    });
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "succeeded",
      evidenceCount: 3,
      aiSuggestionCount: 0,
    });
    expect(repository.succeed).toHaveBeenCalledOnce();
  });

  it("keeps deterministic success when the bounded AI call times out", async () => {
    const { dependencies, repository } = harness({
      claim: claimed(true),
      allowance: 1,
      aiResult: new DOMException("timed out with private text", "AbortError"),
    });
    const response = await createCareerExtractionHandler(dependencies)(
      request({ token: "valid-user-token" }),
    );

    expect(response.status).toBe(200);
    expect(repository.succeed).toHaveBeenCalledOnce();
  });

  it("logs only approved metadata and never request, path, bytes, or extracted text", async () => {
    const logs: CareerRuntimeLog[] = [];
    const { dependencies } = harness({ logs });
    await createCareerExtractionHandler(dependencies)(
      request({ token: "private-token-value" }),
    );

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      event: "career_extraction.completed",
      correlationId,
      status: "succeeded",
      inputCharacterCount: 92,
      evidenceCount: 3,
      suggestionCount: 1,
      aiSuggestionCount: 0,
      durationMs: 0,
      modelIdentifier: "disabled",
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("private-token-value");
    expect(serialized).not.toContain("fictional.docx");
    expect(serialized).not.toContain("stakeholder management");
  });
});
