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
  signal: AbortSignal,
): Promise<z.infer<typeof requestSchema>> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > careerExtractionLimits.requestBytes)
  ) {
    throw new CareerExtractionError("bad_request");
  }
  if (request.body === null) throw new CareerExtractionError("bad_request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";
  let cancellationStarted = false;
  const cancelReader = (): void => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // Cancellation details are deliberately discarded.
    }
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      const { done, value } = await withinDeadline(reader.read(), signal);
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > careerExtractionLimits.requestBytes) {
        cancelReader();
        throw new CareerExtractionError("bad_request");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancelReader);
    if (signal.aborted) cancelReader();
    try {
      reader.releaseLock();
    } catch {
      // A raced read may still be settling after best-effort cancellation.
    }
  }
  try {
    return requestSchema.parse(JSON.parse(text));
  } catch {
    throw new CareerExtractionError("bad_request");
  }
}

async function withinDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new CareerExtractionError("extraction_timeout");
  return await new Promise<T>((resolve, reject) => {
    const timeout = () =>
      reject(new CareerExtractionError("extraction_timeout"));
    signal.addEventListener("abort", timeout, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", timeout);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", timeout);
        reject(error);
      },
    );
  });
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

/** Codes only — never a model response, a prompt, or any CV-derived text. */
const aiOutcomeCodePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function sanitiseAiCode(value: string): string {
  return value.length >= 3 &&
    value.length <= 100 &&
    aiOutcomeCodePattern.test(value)
    ? value
    : "unknown";
}

/**
 * Why an optional AI proposal produced nothing.
 *
 * The AI path is metered and fails open by design: any problem falls back to
 * deterministic extraction. That is correct behaviour and must not change. What
 * was wrong is that it failed *silently* — an unreachable model, a rejected
 * model name and output the schema refused all looked identical from outside,
 * so the only evidence was a consumed allowance and `suggestion_count = 0`.
 *
 * This records the shape of the outcome and never its content. `AGENTS.md`
 * keeps CV text out of logs, so nothing here carries the prompt, the response,
 * or any extracted value — only a code, a count and a field path.
 */
function recordAiOutcome(
  outcome: "accepted" | "rejected_schema" | "call_failed",
  detail: Record<string, string | number>,
): void {
  console.info(JSON.stringify({ event: "ai_suggestions", outcome, ...detail }));
}

async function optionalAiSuggestions(options: {
  dependencies: CareerExtractionDependencies;
  environment: CareerRuntimeEnvironment;
  allowed: boolean;
  text: string;
  evidence: readonly Record<string, unknown>[];
  signal: AbortSignal;
}): Promise<unknown[]> {
  if (!options.allowed || options.environment.aiDailyAllowance <= 0) return [];
  try {
    const result = await options.dependencies.generateSuggestions(
      options.text.slice(0, careerExtractionLimits.aiInputCharacters),
      options.evidence,
      {
        environment: options.environment,
        signal: AbortSignal.any([
          options.signal,
          AbortSignal.timeout(careerExtractionLimits.aiTimeoutMilliseconds),
        ]),
        maximumOutputTokens: careerExtractionLimits.aiOutputTokens,
      },
    );
    const parsed = aiSuggestionsSchema.safeParse(result);
    if (!parsed.success) {
      // The shape, never the content. A rejected proposal is the likeliest
      // outcome with a small model, and without this a run is indistinguishable
      // from one where the model was never reachable at all.
      recordAiOutcome("rejected_schema", {
        issueCount: parsed.error.issues.length,
        firstPath: parsed.error.issues[0]?.path.join(".") ?? "",
        returnedType: Array.isArray(result) ? "array" : typeof result,
      });
      return [];
    }
    recordAiOutcome("accepted", { suggestionCount: parsed.data.length });
    return parsed.data;
  } catch (error) {
    if (options.signal.aborted) {
      throw new CareerExtractionError("extraction_timeout");
    }
    recordAiOutcome("call_failed", {
      reason: sanitiseAiCode(
        error instanceof Error ? error.message : "unknown",
      ),
    });
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

    const correlationId = dependencies.randomUuid();
    const startedAt = dependencies.now().getTime();
    const overallController = new AbortController();
    const overallTimeout = setTimeout(
      () => overallController.abort(),
      careerExtractionLimits.requestTimeoutMilliseconds,
    );
    const overallSignal = overallController.signal;
    let environment: CareerRuntimeEnvironment;
    let input: z.infer<typeof requestSchema>;
    try {
      environment = dependencies.readEnvironment();
      input = await readBody(request, overallSignal);
    } catch (error) {
      clearTimeout(overallTimeout);
      const code =
        error instanceof CareerExtractionError
          ? error.code
          : "runtime_unavailable";
      return response(
        { correlationId, error: code },
        statusForCareerError(code),
      );
    }

    const repository = dependencies.createRepository(environment, accessToken);
    let runId: string | null = null;
    let claimToken: string | null = null;
    let claimedByThisRequest = false;
    try {
      const verifiedUserId = await withinDeadline(
        repository.verifyUser(),
        overallSignal,
      );
      const claim = await withinDeadline(
        repository.claim(
          verifiedUserId,
          input.cvDocumentId,
          input.idempotencyKey,
        ),
        overallSignal,
      );
      runId = claim.runId;
      if (claim.disposition === "existing") {
        if (claim.status !== "succeeded") {
          throw new CareerExtractionError(
            claim.status === "running"
              ? "already_running"
              : completionErrorCode(claim.errorCode ?? "internal_error"),
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
      if (claim.claimToken === null) {
        throw new CareerExtractionError("persistence_failed");
      }
      claimToken = claim.claimToken;
      claimedByThisRequest = true;

      await withinDeadline(
        repository.renew(claim.runId, claim.claimToken),
        overallSignal,
      );
      const bytes = await withinDeadline(
        repository.download(claim),
        overallSignal,
      );
      await withinDeadline(
        repository.renew(claim.runId, claim.claimToken),
        overallSignal,
      );
      const validated = validateCvFile({
        fileName: claim.originalFileName,
        mediaType: claim.mediaType,
        bytes,
      });
      const extracted = await withinDeadline(
        extractCvText(validated),
        overallSignal,
      );
      if (extracted.truncated) {
        throw new CareerExtractionError("file_too_large");
      }
      const deterministic = createDeterministicProfileProposal(extracted.text);
      const evidence = await Promise.all(
        deterministic.evidence.map(async (item) => ({
          id: await evidenceId(claim.runId, item.evidenceReference),
          ...item,
        })),
      );
      await withinDeadline(
        repository.renew(claim.runId, claim.claimToken),
        overallSignal,
      );
      const aiSuggestions = await optionalAiSuggestions({
        dependencies,
        environment,
        allowed: claim.aiAllowed,
        text: extracted.text,
        evidence,
        signal: overallSignal,
      });
      const proposal = { ...deterministic, evidence, aiSuggestions };
      const suggestionCount =
        deterministic.suggestions.length + aiSuggestions.length;
      await withinDeadline(
        repository.succeed(
          claim.runId,
          claim.claimToken,
          proposal,
          deterministic.inputCharacterCount,
          evidence.length,
          suggestionCount,
        ),
        overallSignal,
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
      if (
        runId !== null &&
        claimToken !== null &&
        claimedByThisRequest &&
        !overallSignal.aborted
      ) {
        try {
          await withinDeadline(
            repository.fail(runId, claimToken, completionErrorCode(code)),
            overallSignal,
          );
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
    } finally {
      clearTimeout(overallTimeout);
    }
  };
}
