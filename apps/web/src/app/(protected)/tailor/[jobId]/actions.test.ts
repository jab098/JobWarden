// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getTailoringRepository: vi.fn(),
  getTailoringMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/tailoring/get-repository", () => ({
  getTailoringRepository: mocks.getTailoringRepository,
}));
vi.mock("./action-context", () => ({
  getTailoringMutationContext: mocks.getTailoringMutationContext,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { PreviewTailoringUnavailableError } from "@/lib/tailoring/development-tailoring";

import {
  deleteVariantAction,
  promoteVariantAction,
  saveVariantAction,
} from "./actions";

const trustedContext = {
  requestOrigin: "https://jobwarden.example",
  requestHost: "jobwarden.example",
  forwardedHost: null,
  forwardedProto: null,
  siteOrigin: "https://jobwarden.example",
};
const jobId = "0d74a055-d0e6-4f50-a77a-9c8fd8543af3";
const variantId = "c2000000-0000-4000-8000-000000000001";

const workspace = {
  job: { id: jobId, title: "Measurement Lead", employer: "Fictionex Ltd" },
  source: { available: true, documentId: "doc", fileName: "cv.docx" },
  paragraphs: [
    {
      index: 0,
      text: "Built analytics implementation for 12 product teams.",
      uniformFormatting: true,
    },
  ],
  cvText: "Built analytics implementation for 12 product teams.",
  jobText: "We need analytics implementation and measurement across squads.",
  focus: { relevant: [], omissionCandidates: [] },
  variant: null,
  dataMode: "supabase" as const,
};

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("tailoring server actions", () => {
  const saveVariant = vi.fn();
  const promoteVariant = vi.fn();
  const deleteVariant = vi.fn();
  const getWorkspace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTailoringMutationContext.mockResolvedValue(trustedContext);
    getWorkspace.mockResolvedValue(workspace);
    saveVariant.mockResolvedValue(variantId);
    mocks.getTailoringRepository.mockResolvedValue({
      getWorkspace,
      saveVariant,
      promoteVariant,
      deleteVariant,
      renderVariant: vi.fn(),
    });
  });

  it("rejects an untrusted mutation origin before repository access", async () => {
    mocks.getTailoringMutationContext.mockResolvedValue({
      ...trustedContext,
      requestOrigin: "https://attacker.test",
    });

    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({ jobId, name: "Draft", operations: "[]" }),
      ),
    ).resolves.toMatchObject({ kind: "forbidden" });
    expect(mocks.getTailoringRepository).not.toHaveBeenCalled();
  });

  it("saves a supported rewording", async () => {
    const operations = [
      {
        paragraphIndex: 0,
        kind: "replace",
        text: "Delivered analytics implementation for 12 squads.",
      },
    ];

    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({
          jobId,
          name: "Tailored",
          operations: JSON.stringify(operations),
        }),
      ),
    ).resolves.toMatchObject({ kind: "success", resourceId: variantId });
    expect(saveVariant).toHaveBeenCalledWith({
      jobId,
      name: "Tailored",
      operations,
    });
  });

  it("re-runs the evidence check on the server and refuses a fabricated claim", async () => {
    // A client that skipped its own review, or was modified to, still cannot
    // store an unsupported claim.
    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({
          jobId,
          name: "Tailored",
          operations: JSON.stringify([
            {
              paragraphIndex: 0,
              kind: "replace",
              text: "Built analytics implementation for 400 product teams.",
            },
          ]),
        }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveVariant).not.toHaveBeenCalled();
  });

  it("refuses an invented tool even when the client accepted it", async () => {
    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({
          jobId,
          name: "Tailored",
          operations: JSON.stringify([
            {
              paragraphIndex: 0,
              kind: "replace",
              text: "Built analytics implementation with Terraform.",
            },
          ]),
        }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveVariant).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed operation payload", "not json"],
    ["an unknown operation kind", '[{"paragraphIndex":0,"kind":"reorder"}]'],
    ["a negative paragraph index", '[{"paragraphIndex":-1,"kind":"omit"}]'],
    [
      "an omission carrying text",
      '[{"paragraphIndex":0,"kind":"omit","text":"x"}]',
    ],
  ])("rejects %s", async (_label, operations) => {
    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({ jobId, name: "n", operations }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(saveVariant).not.toHaveBeenCalled();
  });

  it("rejects an empty variant name", async () => {
    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({ jobId, name: "   ", operations: "[]" }),
      ),
    ).resolves.toMatchObject({ kind: "invalid" });
  });

  it("promotes and deletes a variant by id", async () => {
    await expect(
      promoteVariantAction({ kind: "idle" }, form({ variantId })),
    ).resolves.toMatchObject({ kind: "success" });
    expect(promoteVariant).toHaveBeenCalledWith(variantId);

    await expect(
      deleteVariantAction({ kind: "idle" }, form({ variantId })),
    ).resolves.toMatchObject({ kind: "success" });
    expect(deleteVariant).toHaveBeenCalledWith(variantId);
  });

  it("rejects a variant id that is not a UUID", async () => {
    await expect(
      promoteVariantAction({ kind: "idle" }, form({ variantId: "nope" })),
    ).resolves.toMatchObject({ kind: "invalid" });
    expect(promoteVariant).not.toHaveBeenCalled();
  });

  it("reports the preview refusal honestly", async () => {
    saveVariant.mockRejectedValue(new PreviewTailoringUnavailableError());

    await expect(
      saveVariantAction(
        { kind: "idle" },
        form({
          jobId,
          name: "Tailored",
          operations: JSON.stringify([{ paragraphIndex: 0, kind: "omit" }]),
        }),
      ),
    ).resolves.toMatchObject({
      kind: "unavailable",
      message: "Tailoring changes are unavailable in this preview.",
    });
  });

  it("does not leak an underlying failure", async () => {
    saveVariant.mockRejectedValue(new Error("connection to 10.0.0.5 refused"));

    const result = await saveVariantAction(
      { kind: "idle" },
      form({
        jobId,
        name: "Tailored",
        operations: JSON.stringify([{ paragraphIndex: 0, kind: "omit" }]),
      }),
    );

    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
  });
});
