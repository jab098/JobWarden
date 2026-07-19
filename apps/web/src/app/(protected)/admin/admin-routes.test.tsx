import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminRepository } from "@/lib/admin/repository";
import { getDevelopmentAdminSnapshot } from "@/lib/admin/development-admin";

const mocks = vi.hoisted(() => ({
  getAdminRepository: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/get-repository", () => ({
  getAdminRepository: mocks.getAdminRepository,
}));
vi.mock("@/lib/auth/access-server", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SITE_URL: "https://jobwarden.example",
  }),
}));

import AccessPage from "./access/page";
import {
  decideAccessAction,
  setAccessRequestsEnabledAction,
} from "./access/actions";
import IngestionPage from "./ingestion/page";
import { requestIngestionAction } from "./ingestion/actions";
import AdminLayout from "./layout";
import AdminPage from "./page";
import SourcesPage from "./sources/page";
import { saveSourceAction } from "./sources/actions";

const snapshot = getDevelopmentAdminSnapshot();

function repository(): AdminRepository {
  return {
    listAccessRequests: vi.fn().mockResolvedValue(snapshot.accessRequests),
    getAccessRequestsEnabled: vi
      .fn()
      .mockResolvedValue(snapshot.accessRequestsEnabled),
    listSources: vi.fn().mockResolvedValue(snapshot.sources),
    listSourceHealth: vi.fn().mockResolvedValue(snapshot.sourceHealth),
    listIngestionRuns: vi.fn().mockResolvedValue(snapshot.runs),
    listIngestionRequests: vi
      .fn()
      .mockResolvedValue(snapshot.ingestionRequests),
    decideAccess: vi.fn().mockResolvedValue(undefined),
    setAccessRequestsEnabled: vi.fn().mockResolvedValue(undefined),
    saveSource: vi
      .fn()
      .mockResolvedValue({ sourceId: snapshot.sources[0].sourceId }),
    listAuditLog: vi.fn(async () => []),
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
    requestSourceIngestion: vi.fn().mockResolvedValue({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      correlationId: "660e8400-e29b-41d4-a716-446655440000",
      state: "queued",
      eligibleAfter: "2026-07-18T09:00:00.000Z",
    }),
  };
}

describe("administrator route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({
        host: "jobwarden.example",
        origin: "https://jobwarden.example",
      }),
    );
    mocks.getAdminRepository.mockResolvedValue(repository());
  });

  it("requires administrator access before composing the shared shell", async () => {
    render(
      await AdminLayout({
        children: <h1>Protected administrator content</h1>,
      }),
    );

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("navigation", { name: "Administrator primary" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Access" })[0]).toHaveAttribute(
      "href",
      "/admin/access",
    );
    expect(
      screen.getByText("Protected administrator content"),
    ).toBeInTheDocument();
  });

  it("redirects the administrator root to the access queue", () => {
    expect(() => AdminPage()).toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/access");
  });

  it("loads each operational page through the production repository", async () => {
    const adminRepository = repository();
    mocks.getAdminRepository.mockResolvedValue(adminRepository);

    const { rerender } = render(await AccessPage());
    expect(adminRepository.listAccessRequests).toHaveBeenCalledOnce();
    expect(adminRepository.getAccessRequestsEnabled).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { level: 1, name: "Access" }),
    ).toBeInTheDocument();

    rerender(await SourcesPage());
    expect(adminRepository.listSources).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sources" }),
    ).toBeInTheDocument();

    rerender(await IngestionPage());
    expect(adminRepository.listIngestionRuns).toHaveBeenCalledWith(50);
    expect(adminRepository.listIngestionRequests).toHaveBeenCalledWith(20);
    expect(
      screen.getByRole("heading", { level: 1, name: "Ingestion" }),
    ).toBeInTheDocument();
  });

  it("assembles trusted mutation context and narrowly revalidates successes", async () => {
    const accessDecision = new FormData();
    accessDecision.set("userId", snapshot.accessRequests[0].userId);
    accessDecision.set("nextStatus", "approved");
    accessDecision.set("reason", "Approved for the controlled private beta.");
    expect(
      (await decideAccessAction({ kind: "idle" }, accessDecision)).kind,
    ).toBe("success");

    const setting = new FormData();
    setting.set("enabled", "false");
    expect(
      (await setAccessRequestsEnabledAction({ kind: "idle" }, setting)).kind,
    ).toBe("success");

    const source = new FormData();
    source.set("provider", "greenhouse");
    source.set("boardToken", "fictional-northstar");
    source.set("employerName", "Fictional Northstar UK Ltd");
    source.set("enabled", "true");
    source.set("minimumSyncMinutes", "60");
    const today = new Date().toISOString().slice(0, 10);
    source.set("termsReviewedAt", today);
    source.set("robotsReviewedAt", today);
    source.set(
      "complianceNotes",
      "Public board reviewed for a fictional test.",
    );
    source.set("allowedHosts", "boards.greenhouse.io");
    expect((await saveSourceAction({ kind: "idle" }, source)).kind).toBe(
      "success",
    );

    const ingestion = new FormData();
    ingestion.set("sourceId", snapshot.sources[0].sourceId);
    expect(
      (await requestIngestionAction({ kind: "idle" }, ingestion)).kind,
    ).toBe("success");

    expect(mocks.headers).toHaveBeenCalledTimes(4);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/admin/access"],
      ["/admin/access"],
      ["/admin/sources"],
      ["/admin/ingestion"],
      ["/admin/ingestion"],
    ]);
  });
});
