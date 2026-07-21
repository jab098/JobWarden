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

export type JobSourceView = Omit<SaveJobSourceInput, "provider"> & {
  provider:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "workable"
    | "reed"
    | "teaching_vacancies";
  coverageMode: "complete" | "incremental";
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
  provider:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "workable"
    | "reed"
    | "teaching_vacancies";
  triggerType: "scheduled" | "admin" | "manual";
  status: "running" | "succeeded" | "failed";
  responseComplete: boolean;
  receivedCount: number;
  eligibleCount: number;
  upsertedCount: number;
  unchangedCount: number;
  closedCount: number;
  excludedNonUkCount: number;
  quarantinedAmbiguousCount: number;
  quarantinedInvalidUrlCount: number;
  /** Distinct advert locations recognition did not know, so the gap is nameable. */
  unrecognisedLocations: readonly string[];
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
  provider:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "workable"
    | "reed"
    | "teaching_vacancies";
  status: "pending" | "claimed" | "completed" | "cancelled";
  requestedAt: string;
};

export type SourceHealthView = {
  sourceId: string;
  employerName: string;
  provider:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "workable"
    | "reed"
    | "teaching_vacancies";
  coverageMode: "complete" | "incremental";
  enabled: boolean;
  freshnessState: "fresh" | "stale" | "failed" | "never" | "disabled";
  lastSuccessfulSyncAt: string | null;
  latestRunStatus: "running" | "succeeded" | "failed" | null;
  latestErrorCode: string | null;
  activeOccurrences: number;
  advertisedCompensation: number;
  estimatedCompensation: number;
  unknownCompensation: number;
  permanentRoles: number;
  contractRoles: number;
  temporaryRoles: number;
  fullTimeRoles: number;
  partTimeRoles: number;
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

export type AdminFormAction = (
  previousState: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/**
 * One waiting early-access signup.
 *
 * `hopingFor` is free text a stranger wrote. It is carried as a plain string
 * and rendered as text, never as markup.
 */
export type EarlyAccessSignup = {
  id: string;
  email: string;
  name: string | null;
  hopingFor: string | null;
  heardFrom: string | null;
  createdAt: string;
};

export type OperationalHealth = {
  deliveries: {
    sentToday: number;
    sentThisMonth: number;
    dailyLimit: number;
    monthlyLimit: number;
    dailyHeadroom: number;
    monthlyHeadroom: number;
    failed: number;
    suppressedNoMatches: number;
    suppressedByCap: number;
  };
  ai: { dailyAllowance: number; usedToday: number };
};
