import "server-only";

import type {
  AccessRequestView,
  IngestionRequestView,
  IngestionRunView,
  JobSourceView,
} from "./types";

export type DevelopmentAdminSnapshot = {
  accessRequestsEnabled: boolean;
  accessRequests: AccessRequestView[];
  sources: JobSourceView[];
  runs: IngestionRunView[];
  ingestionRequests: IngestionRequestView[];
};

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const snapshot = deepFreeze<DevelopmentAdminSnapshot>({
  accessRequestsEnabled: true,
  accessRequests: [
    {
      userId: "51000000-0000-4000-8000-000000000001",
      displayName: "Fictional Rowan",
      status: "pending",
      requestedAt: "2026-07-18T08:42:00.000Z",
      decidedAt: null,
      decisionReason: null,
    },
    {
      userId: "51000000-0000-4000-8000-000000000002",
      displayName: "Fictional Morgan",
      status: "approved",
      requestedAt: "2026-07-16T10:00:00.000Z",
      decidedAt: "2026-07-16T12:30:00.000Z",
      decisionReason: "Fictional private-beta review completed.",
    },
    {
      userId: "51000000-0000-4000-8000-000000000003",
      displayName: "Fictional Casey",
      status: "suspended",
      requestedAt: "2026-07-12T09:10:00.000Z",
      decidedAt: "2026-07-17T15:00:00.000Z",
      decisionReason: "Fictional access review required.",
    },
  ],
  sources: [
    {
      sourceId: "52000000-0000-4000-8000-000000000001",
      provider: "greenhouse",
      boardToken: "fictional-northstar",
      employerName: "Fictional Northstar UK Ltd",
      enabled: true,
      minimumSyncMinutes: 60,
      lastSuccessfulSyncAt: "2026-07-18T08:03:00.000Z",
      termsReviewedAt: "2026-07-01",
      robotsReviewedAt: "2026-07-01",
      termsReviewState: "current",
      robotsReviewState: "current",
      complianceNotes: "Fictional documented public GET endpoint review.",
      allowedHosts: ["boards.fictional.example.test", "fictional.example.test"],
    },
    {
      sourceId: "52000000-0000-4000-8000-000000000002",
      provider: "greenhouse",
      boardToken: "fictional-civic",
      employerName: "Fictional Civic Evidence Ltd",
      enabled: false,
      minimumSyncMinutes: 180,
      lastSuccessfulSyncAt: null,
      termsReviewedAt: "2025-06-01",
      robotsReviewedAt: "2025-06-01",
      termsReviewState: "overdue",
      robotsReviewState: "overdue",
      complianceNotes: "Fictional source disabled pending compliance review.",
      allowedHosts: ["fictional.example.test"],
    },
  ],
  runs: [
    {
      id: "53000000-0000-4000-8000-000000000001",
      runId: "53100000-0000-4000-8000-000000000001",
      sourceId: "52000000-0000-4000-8000-000000000001",
      employerName: "Fictional Northstar UK Ltd",
      provider: "greenhouse",
      triggerType: "scheduled",
      status: "succeeded",
      responseComplete: true,
      receivedCount: 42,
      eligibleCount: 28,
      upsertedCount: 5,
      unchangedCount: 23,
      closedCount: 1,
      durationMs: 920,
      retryCount: 0,
      errorCode: null,
      startedAt: "2026-07-18T08:02:00.000Z",
      completedAt: "2026-07-18T08:02:00.920Z",
    },
    {
      id: "53000000-0000-4000-8000-000000000002",
      runId: "53100000-0000-4000-8000-000000000002",
      sourceId: "52000000-0000-4000-8000-000000000001",
      employerName: "Fictional Northstar UK Ltd",
      provider: "greenhouse",
      triggerType: "admin",
      status: "failed",
      responseComplete: false,
      receivedCount: 0,
      eligibleCount: 0,
      upsertedCount: 0,
      unchangedCount: 0,
      closedCount: 0,
      durationMs: 10_000,
      retryCount: 2,
      errorCode: "fictional_upstream_timeout",
      startedAt: "2026-07-17T15:00:00.000Z",
      completedAt: "2026-07-17T15:00:10.000Z",
    },
    {
      id: "53000000-0000-4000-8000-000000000003",
      runId: "53100000-0000-4000-8000-000000000003",
      sourceId: "52000000-0000-4000-8000-000000000001",
      employerName: "Fictional Northstar UK Ltd",
      provider: "greenhouse",
      triggerType: "admin",
      status: "running",
      responseComplete: false,
      receivedCount: 0,
      eligibleCount: 0,
      upsertedCount: 0,
      unchangedCount: 0,
      closedCount: 0,
      durationMs: null,
      retryCount: 0,
      errorCode: null,
      startedAt: "2026-07-18T11:58:00.000Z",
      completedAt: null,
    },
  ],
  ingestionRequests: [
    {
      id: "54000000-0000-4000-8000-000000000001",
      correlationId: "54100000-0000-4000-8000-000000000001",
      sourceId: "52000000-0000-4000-8000-000000000001",
      employerName: "Fictional Northstar UK Ltd",
      provider: "greenhouse",
      status: "pending",
      requestedAt: "2026-07-18T11:57:00.000Z",
    },
  ],
});

export function getDevelopmentAdminSnapshot(): Readonly<DevelopmentAdminSnapshot> {
  return snapshot;
}
