// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getExportRepository: vi.fn(),
  requireProtectedAccess: vi.fn(),
  resolveDevelopmentAccessMode: vi.fn(),
}));
vi.mock("@/lib/profile/export-repository", () => ({
  getExportRepository: mocks.getExportRepository,
}));
vi.mock("@/lib/auth/access-server", () => ({
  requireProtectedAccess: mocks.requireProtectedAccess,
}));
vi.mock("@/lib/development/access-mode", () => ({
  resolveDevelopmentAccessMode: mocks.resolveDevelopmentAccessMode,
}));

import { GET } from "./route";

const exportOwnData = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveDevelopmentAccessMode.mockReturnValue({ enabled: false });
  mocks.requireProtectedAccess.mockResolvedValue({ kind: "allow" });
  exportOwnData.mockResolvedValue({ schemaVersion: 1, evidence: [] });
  mocks.getExportRepository.mockResolvedValue({ exportOwnData });
});

describe("data export route", () => {
  it("applies the protected access gate before reading anything", async () => {
    await GET();

    expect(mocks.requireProtectedAccess).toHaveBeenCalled();
  });

  it("refuses to export when the access gate rejects the caller", async () => {
    mocks.requireProtectedAccess.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(GET()).rejects.toBeTruthy();
    expect(exportOwnData).not.toHaveBeenCalled();
  });

  it("streams the bundle as an attachment that is never cached", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="jobwarden-export.json"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it("reports an unavailable export without leaking detail", async () => {
    exportOwnData.mockRejectedValue(
      new Error("connection to 10.0.0.5 refused"),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.not.toContain("10.0.0.5");
  });
});
