import "server-only";

import {
  createSaveJobSourceInputSchema,
  decideAccessInputSchema,
  requestSourceIngestionInputSchema,
  type SaveJobSourceInput,
} from "@jobwarden/domain";

import { isTrustedMutationOrigin, type MutationOriginInput } from "./origin";
import type {
  AccessRequestView,
  AdminActionState,
  IngestionRequestResult,
  IngestionRunView,
  JobSourceView,
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
  listIngestionRuns(limit: number): Promise<IngestionRunView[]>;
  decideAccess(input: {
    userId: string;
    nextStatus: "pending" | "approved" | "rejected" | "suspended";
    reason: string;
  }): Promise<void>;
  setAccessRequestsEnabled(enabled: boolean): Promise<void>;
  saveSource(input: SaveJobSourceInput): Promise<{ sourceId: string }>;
  requestSourceIngestion(sourceId: string): Promise<IngestionRequestResult>;
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
