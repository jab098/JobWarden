import { profileSuggestionSchema } from "@jobwarden/domain";
import {
  createDeterministicProfileProposal,
  cvFileErrorCodes,
  extractCvText,
  type CvFileErrorCode,
  validateCvFile,
} from "@jobwarden/profile";
import { z } from "zod";

import {
  careerExtractionLimits,
  type CareerExtractionDependencies,
  type CareerRuntimeEnvironment,
} from "./contracts.ts";
import {
  CareerExtractionError,
  safeCareerErrorCode,
  statusForCareerError,
} from "./errors.ts";

const requestSchema = z
  .object({
    cvDocumentId: z.string().uuid(),
    idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
const aiSuggestionsSchema = z.array(profileSuggestionSchema).max(20);

function response(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(value);
  return match?.[1] ?? null;
}

function completionErrorCode(code: string): CvFileErrorCode {
  return cvFileErrorCodes.includes(code as CvFileErrorCode)
    ? (code as CvFileErrorCode)
    : "internal_error";
}

async function readBody(
  request: Request,
): Promise<z.infer<typeof requestSchema>> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > careerExtractionLimits.requestBytes)
  ) {
    throw new CareerExtractionError("bad_request");
  }
  const text = await request.text();
  if (
    new TextEncoder().encode(text).length > careerExtractionLimits.requestBytes
  ) {
    throw new CareerExtractionError("bad_request");
  }
  try {
    return requestSchema.parse(JSON.parse(text));
  } catch {
    throw new CareerExtractionError("bad_request");
  }
}

function existingCounts(proposal: unknown): {
  evidenceCount: number;
  suggestionCount: number;
  aiSuggestionCount: number;
} {
  if (!proposal || typeof proposal !== "object") {
    return { evidenceCount: 0, suggestionCount: 0, aiSuggestionCount: 0 };
  }
  const value = proposal as Record<string, unknown>;
  return {
    evidenceCount: Array.isArray(value.evidence) ? value.evidence.length : 0,
    suggestionCount: Array.isArray(value.suggestions)
      ? value.suggestions.length
      : 0,
    aiSuggestionCount: Array.isArray(value.aiSuggestions)
      ? value.aiSuggestions.length
      : 0,
  };
}

async function evidenceId(runId: string, reference: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${runId}:${reference}`),
    ),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function optionalAiSuggestions(options: {
  dependencies: CareerExtractionDependencies;
  environment: CareerRuntimeEnvironment;
  allowed: boolean;
  text: string;
  evidence: readonly Record<string, unknown>[];
}): Promise<unknown[]> {
  if (!options.allowed || options.environment.aiDailyAllowance <= 0) return [];
  try {
    const result = await options.dependencies.generateSuggestions(
      options.text.slice(0, careerExtractionLimits.aiInputCharacters),
      options.evidence,
      {
        environment: options.environment,
        signal: AbortSignal.timeout(
          careerExtractionLimits.aiTimeoutMilliseconds,
        ),
        maximumOutputTokens: careerExtractionLimits.aiOutputTokens,
      },
    );
    const parsed = aiSuggestionsSchema.safeParse(result);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function createCareerExtractionHandler(
  dependencies: CareerExtractionDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      const result = response({ error: "method_not_allowed" }, 405);
      result.headers.set("allow", "POST");
      return result;
    }
    const accessToken = bearerToken(request.headers.get("authorization"));
    if (accessToken === null) {
      const result = response({ error: "unauthorised" }, 401);
      result.headers.set("www-authenticate", "Bearer");
      return result;
    }

    let environment: CareerRuntimeEnvironment;
    let input: z.infer<typeof requestSchema>;
    try {
      environment = dependencies.readEnvironment();
      input = await readBody(request);
    } catch (error) {
      const code =
        error instanceof CareerExtractionError
          ? error.code
          : "runtime_unavailable";
      return response({ error: code }, statusForCareerError(code));
    }

    const correlationId = dependencies.randomUuid();
    const startedAt = dependencies.now().getTime();
    const repository = dependencies.createRepository(environment, accessToken);
    let runId: string | null = null;
    let claimedByThisRequest = false;
    try {
      const claim = await repository.claim(
        input.cvDocumentId,
        input.idempotencyKey,
        environment.aiDailyAllowance,
      );
      runId = claim.runId;
      if (claim.disposition === "existing") {
        if (claim.status !== "succeeded") {
          throw new CareerExtractionError(
            claim.status === "running" ? "already_running" : "bad_request",
          );
        }
        return response(
          {
            correlationId,
            status: "succeeded",
            idempotent: true,
            ...existingCounts(claim.proposal),
          },
          200,
        );
      }
      claimedByThisRequest = true;

      const bytes = await repository.download(claim);
      const validated = validateCvFile({
        fileName: claim.originalFileName,
        mediaType: claim.mediaType,
        bytes,
      });
      const extracted = await extractCvText(validated);
      const deterministic = createDeterministicProfileProposal(extracted.text);
      const evidence = await Promise.all(
        deterministic.evidence.map(async (item) => ({
          id: await evidenceId(claim.runId, item.evidenceReference),
          ...item,
        })),
      );
      const aiSuggestions = await optionalAiSuggestions({
        dependencies,
        environment,
        allowed: claim.aiAllowed,
        text: extracted.text,
        evidence,
      });
      const proposal = { ...deterministic, evidence, aiSuggestions };
      const suggestionCount =
        deterministic.suggestions.length + aiSuggestions.length;
      await repository.succeed(
        claim.runId,
        proposal,
        deterministic.inputCharacterCount,
        evidence.length,
        suggestionCount,
      );

      const durationMs = Math.max(0, dependencies.now().getTime() - startedAt);
      dependencies.log({
        event: "career_extraction.completed",
        correlationId,
        status: "succeeded",
        inputCharacterCount: deterministic.inputCharacterCount,
        evidenceCount: evidence.length,
        suggestionCount: deterministic.suggestions.length,
        aiSuggestionCount: aiSuggestions.length,
        durationMs,
        modelIdentifier:
          claim.aiAllowed && environment.aiDailyAllowance > 0
            ? environment.aiModel
            : "disabled",
      });
      return response(
        {
          correlationId,
          status: "succeeded",
          evidenceCount: evidence.length,
          suggestionCount: deterministic.suggestions.length,
          aiSuggestionCount: aiSuggestions.length,
        },
        200,
      );
    } catch (error) {
      const code = safeCareerErrorCode(error);
      if (runId !== null && claimedByThisRequest) {
        try {
          await repository.fail(runId, completionErrorCode(code));
        } catch {
          // The response and log remain sanitised if finalisation is unavailable.
        }
      }
      dependencies.log({
        event: "career_extraction.failed",
        correlationId,
        status: "failed",
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        modelIdentifier: "disabled",
        errorCode: code,
      });
      return response(
        { correlationId, error: code },
        statusForCareerError(code),
      );
    }
  };
}
