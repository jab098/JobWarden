import "server-only";

import {
  createSaveJobSourceInputSchema,
  decideAccessInputSchema,
  markEarlyAccessInvitedInputSchema,
  requestSourceIngestionInputSchema,
  type SaveJobSourceInput,
} from "@jobwarden/domain";

import { isTrustedMutationOrigin, type MutationOriginInput } from "./origin";
import type {
  AccessRequestView,
  AdminActionState,
  IngestionRequestResult,
  IngestionRequestView,
  IngestionRunView,
  JobSourceView,
  SourceHealthView,
  AuditLogEntry,
  EarlyAccessSignup,
  OperationalHealth,
} from "./types";

export type MutationContext = MutationOriginInput;

export type AdminRepositoryErrorCode =
  "conflict" | "cooldown" | "not_found" | "unavailable";

export class AdminRepositoryError extends Error {
  constructor(
    readonly code: AdminRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminRepositoryError";
  }
}

export interface AdminRepository {
  listAccessRequests(): Promise<AccessRequestView[]>;
  getAccessRequestsEnabled(): Promise<boolean>;
  listSources(): Promise<JobSourceView[]>;
  listSourceHealth(): Promise<SourceHealthView[]>;
  listIngestionRuns(limit: number): Promise<IngestionRunView[]>;
  listIngestionRequests(limit: number): Promise<IngestionRequestView[]>;
  decideAccess(input: {
    userId: string;
    nextStatus: "pending" | "approved" | "rejected" | "suspended";
    reason: string;
  }): Promise<void>;
  setAccessRequestsEnabled(enabled: boolean): Promise<void>;
  saveSource(input: SaveJobSourceInput): Promise<{ sourceId: string }>;
  requestSourceIngestion(sourceId: string): Promise<IngestionRequestResult>;
  listAuditLog(input: {
    limit: number;
    before: string | null;
  }): Promise<AuditLogEntry[]>;
  listEarlyAccessSignups(input: {
    limit: number;
  }): Promise<{ signups: EarlyAccessSignup[]; pending: number }>;
  markEarlyAccessInvited(signupId: string): Promise<boolean>;
  getOperationalHealth(): Promise<OperationalHealth>;
}

const forbiddenState: AdminActionState = {
  kind: "forbidden",
  message: "This administrator request could not be verified.",
};

const unavailableState: AdminActionState = {
  kind: "unavailable",
  message: "The administrator operation is temporarily unavailable.",
};

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function invalidState(
  fieldErrors?: Record<string, string[] | undefined>,
): AdminActionState {
  return {
    kind: "invalid",
    message: "Check the highlighted fields and try again.",
    fieldErrors: fieldErrors
      ? Object.fromEntries(
          Object.entries(fieldErrors).filter(
            (entry): entry is [string, string[]] => entry[1] !== undefined,
          ),
        )
      : undefined,
  };
}

function mapRepositoryError(error: unknown): AdminActionState {
  if (!(error instanceof AdminRepositoryError)) return unavailableState;

  if (error.code === "cooldown") {
    return {
      kind: "cooldown",
      message: "This source is still inside its minimum sync interval.",
    };
  }

  if (error.code === "conflict" || error.code === "not_found") {
    return {
      kind: "conflict",
      message:
        "The record changed before this operation completed. Refresh and try again.",
    };
  }

  return unavailableState;
}

function trusted(context: MutationContext): boolean {
  return isTrustedMutationOrigin(context);
}

export async function decideAccessRequest(
  repository: AdminRepository,
  context: MutationContext,
  formData: FormData,
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  const parsed = decideAccessInputSchema.safeParse({
    userId: value(formData, "userId"),
    nextStatus: value(formData, "nextStatus"),
    reason: value(formData, "reason"),
  });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);

  try {
    await repository.decideAccess(parsed.data);
    return { kind: "success", message: "Access decision recorded." };
  } catch (error) {
    return mapRepositoryError(error);
  }
}

/**
 * Marking an early-access signup invited.
 *
 * Keyed on the row id, never an email — the database function has no argument
 * that could ask "is this address on the list?", and this surface does not
 * supply one either.
 *
 * The database is idempotent here: a signup that was already invited, or an id
 * that does not exist, both return `false` without raising. Those are reported
 * identically on purpose, so a repeated click is quiet and no caller learns
 * anything from the difference.
 */
export async function markEarlyAccessInvited(
  repository: AdminRepository,
  context: MutationContext,
  formData: FormData,
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  // A uuid schema rather than a length-and-charset regex: the regex it
  // replaced accepted thirty-six hyphens, which reached the database as an
  // invalid cast.
  const parsed = markEarlyAccessInvitedInputSchema.safeParse({
    signupId: value(formData, "signupId"),
  });
  if (!parsed.success) {
    return invalidState({ signupId: ["Choose a signup to mark invited."] });
  }

  try {
    const changed = await repository.markEarlyAccessInvited(
      parsed.data.signupId,
    );
    return {
      kind: "success",
      message: changed
        ? "Marked as invited."
        : "That signup was already marked as invited.",
    };
  } catch (error) {
    return mapRepositoryError(error);
  }
}

export async function changeAccessRequestSetting(
  repository: AdminRepository,
  context: MutationContext,
  formData: FormData,
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  const rawEnabled = value(formData, "enabled");
  if (!new Set(["true", "false"]).has(rawEnabled)) {
    return invalidState({ enabled: ["Choose an access-request state."] });
  }

  try {
    await repository.setAccessRequestsEnabled(rawEnabled === "true");
    return {
      kind: "success",
      message: "Access-request availability updated.",
    };
  } catch (error) {
    return mapRepositoryError(error);
  }
}

export async function saveJobSource(
  repository: AdminRepository,
  context: MutationContext,
  formData: FormData,
  today = new Date().toISOString().slice(0, 10),
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  const minimumSyncMinutes = Number(value(formData, "minimumSyncMinutes"));
  const parsed = createSaveJobSourceInputSchema(today).safeParse({
    sourceId: value(formData, "sourceId") || null,
    provider: value(formData, "provider"),
    boardToken: value(formData, "boardToken"),
    employerName: value(formData, "employerName"),
    enabled: value(formData, "enabled") === "true",
    minimumSyncMinutes,
    termsReviewedAt: value(formData, "termsReviewedAt"),
    robotsReviewedAt: value(formData, "robotsReviewedAt"),
    complianceNotes: value(formData, "complianceNotes"),
    allowedHosts: value(formData, "allowedHosts")
      .split(/[\n,]/)
      .map((host) => host.trim())
      .filter(Boolean),
  });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);

  try {
    await repository.saveSource(parsed.data);
    return { kind: "success", message: "Source configuration saved." };
  } catch (error) {
    return mapRepositoryError(error);
  }
}

export async function queueSourceIngestion(
  repository: AdminRepository,
  context: MutationContext,
  formData: FormData,
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  const parsed = requestSourceIngestionInputSchema.safeParse({
    sourceId: value(formData, "sourceId"),
  });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);

  try {
    const result = await repository.requestSourceIngestion(
      parsed.data.sourceId,
    );
    return {
      kind: "success",
      message:
        result.state === "queued"
          ? "Ingestion request queued."
          : "An active ingestion request already exists.",
      correlationId: result.correlationId,
    };
  } catch (error) {
    return mapRepositoryError(error);
  }
}

/**
 * Queues a coalesced ingestion request for every enabled source in one action,
 * so an administrator does not have to click each source in turn. Each request
 * goes through the same per-source path — coalesced and interval-bound — so a
 * source already syncing, or inside its minimum interval, is not double-run; it
 * is reported as already active rather than failing the batch. A single source
 * error never aborts the rest.
 */
export async function queueAllSourceIngestion(
  repository: AdminRepository,
  context: MutationContext,
): Promise<AdminActionState> {
  if (!trusted(context)) return forbiddenState;

  let enabledSources: JobSourceView[];
  try {
    enabledSources = (await repository.listSources()).filter(
      (source) => source.enabled,
    );
  } catch (error) {
    return mapRepositoryError(error);
  }
  if (enabledSources.length === 0) {
    return { kind: "success", message: "No enabled source to refresh." };
  }

  const results = await Promise.allSettled(
    enabledSources.map((source) =>
      repository.requestSourceIngestion(source.sourceId),
    ),
  );

  let queued = 0;
  let active = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") failed += 1;
    else if (result.value.state === "queued") queued += 1;
    else active += 1;
  }

  const parts = [`${queued} queued`];
  if (active > 0) parts.push(`${active} already active`);
  if (failed > 0) parts.push(`${failed} failed`);
  const message = `Refresh requested across ${enabledSources.length} sources: ${parts.join(", ")}.`;
  // Only an outright failure of every source is an error; a mix still did work.
  if (queued === 0 && active === 0) return { kind: "unavailable", message };
  return { kind: "success", message };
}
