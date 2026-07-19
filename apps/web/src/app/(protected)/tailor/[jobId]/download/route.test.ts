// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getTailoringRepository: vi.fn(),
  requireProtectedAccess: vi.fn(),
  resolveDevelopmentAccessMode: vi.fn(),
}));
vi.mock("@/lib/tailoring/get-repository", () => ({
  getTailoringRepository: mocks.getTailoringRepository,
}));
vi.mock("@/lib/auth/access-server", () => ({
  requireProtectedAccess: mocks.requireProtectedAccess,
}));
vi.mock("@/lib/development/access-mode", () => ({
  resolveDevelopmentAccessMode: mocks.resolveDevelopmentAccessMode,
}));

import { GET } from "./route";

const variantId = "c2000000-0000-4000-8000-000000000001";
const renderVariant = vi.fn();

function request(query: string): Request {
  return new Request(`https://jobwarden.example/tailor/job/download${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveDevelopmentAccessMode.mockReturnValue({ enabled: false });
  mocks.requireProtectedAccess.mockResolvedValue({ kind: "allow" });
  renderVariant.mockResolvedValue({
    fileName: "cv-tailored.docx",
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  });
  mocks.getTailoringRepository.mockResolvedValue({ renderVariant });
});

describe("tailored variant download", () => {
  it("applies the protected access gate before rendering", async () => {
    await GET(request(`?variantId=${variantId}`));

    expect(mocks.requireProtectedAccess).toHaveBeenCalled();
  });

  it("refuses to render when the access gate rejects the caller", async () => {
    mocks.requireProtectedAccess.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(GET(request(`?variantId=${variantId}`))).rejects.toBeTruthy();
    expect(renderVariant).not.toHaveBeenCalled();
  });

  it("skips the gate only in the exact local development bypass", async () => {
    mocks.resolveDevelopmentAccessMode.mockReturnValue({ enabled: true });

    await GET(request(`?variantId=${variantId}`));

    expect(mocks.requireProtectedAccess).not.toHaveBeenCalled();
  });

  it("streams the archive as an attachment that is never cached", async () => {
    const response = await GET(request(`?variantId=${variantId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="cv-tailored.docx"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a variant id that is not a UUID", async () => {
    const response = await GET(request("?variantId=not-a-uuid"));

    expect(response.status).toBe(400);
    expect(renderVariant).not.toHaveBeenCalled();
  });

  it("rejects a missing variant id", async () => {
    const response = await GET(request(""));

    expect(response.status).toBe(400);
  });

  it("reports an unknown variant as not found without detail", async () => {
    renderVariant.mockRejectedValue(
      new Error("connection to 10.0.0.5 refused"),
    );

    const response = await GET(request(`?variantId=${variantId}`));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain("10.0.0.5");
  });

  it("sanitises a filename so it cannot split the header", async () => {
    renderVariant.mockResolvedValue({
      fileName: 'evil"\r\nSet-Cookie: a=b.docx',
      bytes: new Uint8Array([0x50, 0x4b]),
    });

    const response = await GET(request(`?variantId=${variantId}`));

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toBe('attachment; filename="evil-Set-Cookie-a-b.docx"');
  });
});
