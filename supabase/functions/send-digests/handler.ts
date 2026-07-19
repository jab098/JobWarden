import {
  buildDigestMessage,
  londonSlotKey,
  selectNewMatches,
  type TargetFeedJobInput,
} from "@jobwarden/domain";

import {
  MAX_CANDIDATE_JOBS,
  MAX_LISTED_JOBS_PER_DIGEST,
  MAX_OWNERS_PER_INVOCATION,
  type DigestRecipient,
  type DigestSender,
  type NotificationEnvironment,
  type NotificationHandlerDependencies,
  type NotificationRepository,
} from "./contracts.ts";

const MAX_REQUEST_BYTES = 2_048;
const MAX_INVOCATION_MS = 120_000;
const MIN_OWNER_BUDGET_MS = 15_000;

type Aggregate = {
  recipientCount: number;
  sentCount: number;
  suppressedCount: number;
  failedCount: number;
};

function response(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function unauthorised(): Response {
  const result = response({ error: "unauthorised" }, 401);
  result.headers.set("www-authenticate", "Bearer");
  return result;
}

function bearerToken(header: string | null): string {
  if (header === null) return "";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? "";
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
}

async function secretsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([
    digest(provided),
    digest(expected),
  ]);

  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0 && provided.length > 0;
}

function declaredRequestTooLarge(request: Request): boolean {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) return false;
  if (!/^\d+$/.test(rawLength)) return true;
  return Number(rawLength) > MAX_REQUEST_BYTES;
}

async function requestBodyTooLarge(request: Request): Promise<boolean> {
  if (declaredRequestTooLarge(request)) return true;
  if (request.body === null) return false;

  const reader = request.body.getReader();
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return false;

      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return true;
      }
    }
  } catch {
    return true;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Processes one recipient. Every exit records an auditable slot outcome before
 * anything is sent, and a provider failure is recorded rather than thrown, so
 * one owner's bad address cannot stop the batch.
 */
async function processRecipient(options: {
  dependencies: NotificationHandlerDependencies;
  repository: NotificationRepository;
  sender: DigestSender;
  environment: NotificationEnvironment;
  recipient: DigestRecipient;
  candidates: readonly TargetFeedJobInput[];
  candidateIds: readonly string[];
  slotKey: string;
  invocationCorrelationId: string;
  signal: AbortSignal;
}): Promise<"sent" | "suppressed" | "failed"> {
  const {
    dependencies,
    repository,
    recipient,
    environment,
    slotKey,
    invocationCorrelationId,
  } = options;

  const announced = await repository.listAnnouncedKeys(
    recipient.ownerId,
    options.candidateIds,
  );
  const selection = selectNewMatches({
    candidates: options.candidates,
    searches: recipient.searches,
    confirmedEvidence: recipient.confirmedEvidence,
    announced,
    now: dependencies.now(),
  });

  const claim = await repository.beginDigest({
    ownerId: recipient.ownerId,
    slotKey,
    matchCount: selection.jobs.length,
    dailyLimit: environment.dailyLimit,
    monthlyLimit: environment.monthlyLimit,
  });

  if (claim.outcome !== "claimed") {
    dependencies.log({
      event: "notifications.slot_suppressed",
      invocationCorrelationId,
      slotKey,
      status: claim.outcome,
      matchCount: selection.jobs.length,
    });
    return "suppressed";
  }

  const message = buildDigestMessage({
    jobs: selection.jobs,
    siteUrl: environment.siteUrl,
    unsubscribeUrl: `${environment.siteUrl}/unsubscribe?token=${encodeURIComponent(
      recipient.unsubscribeToken,
    )}`,
    maxListed: MAX_LISTED_JOBS_PER_DIGEST,
  });

  const outcome = await options.sender.send({
    to: recipient.email,
    from: environment.senderAddress,
    message,
    signal: options.signal,
  });

  await repository.finishDigest({
    deliveryId: claim.deliveryId,
    status: outcome.status,
    providerMessageId:
      outcome.status === "sent" ? outcome.providerMessageId : null,
    errorCode: outcome.status === "failed" ? outcome.errorCode : null,
    // Announcements are recorded only on success, so a failed send cannot
    // suppress the next slot's digest.
    announcements: outcome.status === "sent" ? selection.announcements : [],
  });

  dependencies.log({
    event: "notifications.slot_completed",
    invocationCorrelationId,
    slotKey,
    status: outcome.status,
    matchCount: selection.jobs.length,
    ...(outcome.status === "failed" ? { errorCode: outcome.errorCode } : {}),
  });

  return outcome.status === "sent" ? "sent" : "failed";
}

export function createNotificationHandler(
  dependencies: NotificationHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      const result = response({ error: "method_not_allowed" }, 405);
      result.headers.set("allow", "POST");
      return result;
    }

    let environment;
    try {
      environment = dependencies.readEnvironment();
    } catch {
      return response({ error: "runtime_unavailable" }, 503);
    }

    if (
      !(await secretsMatch(
        bearerToken(request.headers.get("authorization")),
        environment.cronSecret,
      ))
    ) {
      return unauthorised();
    }

    if (await requestBodyTooLarge(request)) {
      return response({ error: "request_too_large" }, 413);
    }

    const invocationCorrelationId = dependencies.randomUuid();
    const invocationStartedAt = dependencies.now();
    const invocationDeadlineAt =
      invocationStartedAt.getTime() + MAX_INVOCATION_MS;
    const slotKey = londonSlotKey(invocationStartedAt);

    if (slotKey === null) {
      dependencies.log({
        event: "notifications.invocation_completed",
        invocationCorrelationId,
        status: "outside_schedule",
      });
      return response(
        { correlationId: invocationCorrelationId, status: "outside_schedule" },
        200,
      );
    }

    // Without a credential the runtime stays inert: it reports its state and
    // records nothing, rather than claiming slots it cannot deliver.
    const sender = dependencies.createSender(environment);
    if (sender === null) {
      dependencies.log({
        event: "notifications.invocation_completed",
        invocationCorrelationId,
        slotKey,
        status: "delivery_unconfigured",
      });
      return response(
        {
          correlationId: invocationCorrelationId,
          slotKey,
          status: "delivery_unconfigured",
        },
        200,
      );
    }

    const repository = dependencies.createRepository(environment);
    const aggregate: Aggregate = {
      recipientCount: 0,
      sentCount: 0,
      suppressedCount: 0,
      failedCount: 0,
    };

    let recipients: readonly DigestRecipient[];
    let candidates: readonly TargetFeedJobInput[];
    try {
      recipients = await repository.listRecipients(
        slotKey,
        MAX_OWNERS_PER_INVOCATION,
      );
      // Read once, scored for every recipient below.
      candidates =
        recipients.length === 0
          ? []
          : await repository.listCandidateJobs(MAX_CANDIDATE_JOBS);
    } catch {
      dependencies.log({
        event: "notifications.read_failed",
        invocationCorrelationId,
        slotKey,
        status: "failed",
        errorCode: "notification_source_unavailable",
      });
      return response(
        {
          correlationId: invocationCorrelationId,
          slotKey,
          status: "unavailable",
        },
        503,
      );
    }

    const candidateIds = candidates.map((candidate) => candidate.id);

    for (const recipient of recipients) {
      if (
        invocationDeadlineAt - dependencies.now().getTime() <
        MIN_OWNER_BUDGET_MS
      ) {
        dependencies.log({
          event: "notifications.deadline_reached",
          invocationCorrelationId,
          slotKey,
          status: "partial",
        });
        break;
      }

      aggregate.recipientCount += 1;
      try {
        const result = await processRecipient({
          dependencies,
          repository,
          sender,
          environment,
          recipient,
          candidates,
          candidateIds,
          slotKey,
          invocationCorrelationId,
          // A send started near the deadline is cut off rather than allowed to
          // run past the invocation budget.
          signal: AbortSignal.timeout(
            Math.max(1, invocationDeadlineAt - dependencies.now().getTime()),
          ),
        });
        if (result === "sent") aggregate.sentCount += 1;
        else if (result === "suppressed") aggregate.suppressedCount += 1;
        else aggregate.failedCount += 1;
      } catch {
        // One owner's database or provider trouble must not abort the batch.
        aggregate.failedCount += 1;
        dependencies.log({
          event: "notifications.recipient_failed",
          invocationCorrelationId,
          slotKey,
          status: "failed",
          errorCode: "recipient_processing_failed",
        });
      }
    }

    const status =
      aggregate.recipientCount === 0
        ? "idle"
        : aggregate.failedCount > 0
          ? "partial_failure"
          : "succeeded";
    dependencies.log({
      event: "notifications.invocation_completed",
      invocationCorrelationId,
      slotKey,
      status,
      recipientCount: aggregate.recipientCount,
      sentCount: aggregate.sentCount,
      suppressedCount: aggregate.suppressedCount,
      failedCount: aggregate.failedCount,
    });

    return response(
      {
        correlationId: invocationCorrelationId,
        slotKey,
        status,
        ...aggregate,
      },
      200,
    );
  };
}
