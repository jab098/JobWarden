// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AdminRepositoryError,
  changeAccessRequestSetting,
  decideAccessRequest,
  queueSourceIngestion,
  saveJobSource,
  type AdminRepository,
  type MutationContext,
} from "./repository";

const userId = "8ef843bb-75d7-4cca-b3d6-ab51dfa28bf2";
const sourceId = "ae2e5258-afd0-48a4-bd0e-a42cb84bbc56";

const context: MutationContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};

function createRepository(): AdminRepository {
  return {
    listAccessRequests: vi.fn(async () => []),
    getAccessRequestsEnabled: vi.fn(async () => true),
    listSources: vi.fn(async () => []),
    listSourceHealth: vi.fn(async () => []),
    listIngestionRuns: vi.fn(async () => []),
    listIngestionRequests: vi.fn(async () => []),
    decideAccess: vi.fn(async () => undefined),
    setAccessRequestsEnabled: vi.fn(async () => undefined),
    saveSource: vi.fn(async () => ({ sourceId })),
    listAuditLog: vi.fn(async () => []),
    listEarlyAccessSignups: vi.fn(async () => ({ signups: [], pending: 0 })),
    markEarlyAccessInvited: vi.fn(async () => true),
    getOperationalHealth: vi.fn(async () => ({
      deliveries: {
        sentToday: 12,
        sentThisMonth: 240,
        dailyLimit: 80,
        monthlyLimit: 2500,
        dailyHeadroom: 68,
        monthlyHeadroom: 2260,
        failed: 1,
        suppressedNoMatches: 31,
        suppressedByCap: 0,
      },
      ai: { dailyAllowance: 0, usedToday: 0 },
    })),
    requestSourceIngestion: vi.fn(async () => ({
      requestId: "8b62cdf3-dc0f-4127-888d-083d5dad0a9f",
      correlationId: "f3229a26-c019-42cd-a4ef-a3a7010e974e",
      state: "queued" as const,
      eligibleAfter: "2026-07-18T09:00:00.000Z",
    })),
  };
}

describe("administrator actions", () => {
  it("passes only the parsed target decision to the repository", async () => {
    const repository = createRepository();
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("nextStatus", "approved");
    formData.set("reason", " Verified private-beta applicant. ");
    formData.set("actorId", "attacker-controlled");
    formData.set("isAdmin", "true");

    await expect(
      decideAccessRequest(repository, context, formData),
    ).resolves.toEqual({
      kind: "success",
      message: "Access decision recorded.",
    });
    expect(repository.decideAccess).toHaveBeenCalledWith({
      userId,
      nextStatus: "approved",
      reason: "Verified private-beta applicant.",
    });
  });

  it("rejects malformed data without calling a repository", async () => {
    const repository = createRepository();
    const formData = new FormData();
    formData.set("userId", "not-a-user");
    formData.set("nextStatus", "approved");
    formData.set("reason", "no");

    const result = await decideAccessRequest(repository, context, formData);

    expect(result.kind).toBe("invalid");
    expect(repository.decideAccess).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin mutation before parsing or persistence", async () => {
    const repository = createRepository();

    const result = await changeAccessRequestSetting(
      repository,
      { ...context, requestOrigin: "https://attacker.test" },
      new FormData(),
    );

    expect(result).toEqual({
      kind: "forbidden",
      message: "This administrator request could not be verified.",
    });
    expect(repository.setAccessRequestsEnabled).not.toHaveBeenCalled();
  });

  it("parses source fields without reading submitted authority", async () => {
    const repository = createRepository();
    const formData = new FormData();
    formData.set("sourceId", "");
    formData.set("provider", "greenhouse");
    formData.set("boardToken", "fictional-board");
    formData.set("employerName", " Fictional Board Ltd ");
    formData.set("enabled", "true");
    formData.set("minimumSyncMinutes", "60");
    formData.set("termsReviewedAt", "2026-07-17");
    formData.set("robotsReviewedAt", "2026-07-17");
    formData.set("complianceNotes", " Reviewed public GET endpoint. ");
    formData.set(
      "allowedHosts",
      "boards.greenhouse.io\nfictional.example.test",
    );
    formData.set("actorId", "attacker-controlled");

    const result = await saveJobSource(
      repository,
      context,
      formData,
      "2026-07-18",
    );

    expect(result).toEqual({
      kind: "success",
      message: "Source configuration saved.",
    });
    expect(repository.saveSource).toHaveBeenCalledWith({
      sourceId: null,
      provider: "greenhouse",
      boardToken: "fictional-board",
      employerName: "Fictional Board Ltd",
      enabled: true,
      minimumSyncMinutes: 60,
      termsReviewedAt: "2026-07-17",
      robotsReviewedAt: "2026-07-17",
      complianceNotes: "Reviewed public GET endpoint.",
      allowedHosts: ["boards.greenhouse.io", "fictional.example.test"],
    });
  });

  it("maps a typed cooldown without exposing its raw cause", async () => {
    const repository = createRepository();
    vi.mocked(repository.requestSourceIngestion).mockRejectedValue(
      new AdminRepositoryError("cooldown", "raw database cooldown detail"),
    );
    const formData = new FormData();
    formData.set("sourceId", sourceId);

    const result = await queueSourceIngestion(repository, context, formData);

    expect(result).toEqual({
      kind: "cooldown",
      message: "This source is still inside its minimum sync interval.",
    });
    expect(JSON.stringify(result)).not.toContain("raw database");
  });

  it("maps unknown errors to a fixed unavailable state", async () => {
    const repository = createRepository();
    vi.mocked(repository.decideAccess).mockRejectedValue(
      new Error("sensitive database message"),
    );
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("nextStatus", "approved");
    formData.set("reason", "Verified applicant");

    const result = await decideAccessRequest(repository, context, formData);

    expect(result).toEqual({
      kind: "unavailable",
      message: "The administrator operation is temporarily unavailable.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive database");
  });
});
