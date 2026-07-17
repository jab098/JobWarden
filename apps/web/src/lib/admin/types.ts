import type {
  AccessStatus,
  ComplianceReviewState,
  SaveJobSourceInput,
} from "@jobwarden/domain";

export type AccessRequestView = {
  userId: string;
  displayName: string;
  status: AccessStatus;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
};

export type JobSourceView = SaveJobSourceInput & {
  sourceId: string;
  lastSuccessfulSyncAt: string | null;
  termsReviewState: ComplianceReviewState;
  robotsReviewState: ComplianceReviewState;
};

export type IngestionRunView = {
  id: string;
  runId: string;
  sourceId: string;
  employerName: string;
  provider: "greenhouse";
  triggerType: "scheduled" | "admin" | "manual";
  status: "running" | "succeeded" | "failed";
  responseComplete: boolean;
  receivedCount: number;
  eligibleCount: number;
  upsertedCount: number;
  unchangedCount: number;
  closedCount: number;
  durationMs: number | null;
  retryCount: number;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type IngestionRequestResult = {
  requestId: string;
  correlationId: string;
  state: "queued" | "coalesced";
  eligibleAfter: string;
};

export type IngestionRequestView = {
  id: string;
  correlationId: string;
  sourceId: string;
  employerName: string;
  provider: "greenhouse";
  status: "pending" | "claimed" | "completed" | "cancelled";
  requestedAt: string;
};

export type AdminActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string; correlationId?: string }
  | {
      kind: "invalid";
      message: string;
      fieldErrors?: Record<string, string[]>;
    }
  | { kind: "forbidden"; message: string }
  | {
      kind: "conflict" | "cooldown" | "unavailable";
      message: string;
    };
