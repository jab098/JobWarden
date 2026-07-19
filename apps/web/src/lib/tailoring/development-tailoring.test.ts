// @vitest-environment node

import { readDocxParagraphs } from "@jobwarden/profile";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { developmentJobs } from "@/lib/jobs/development-jobs";

import {
  createDevelopmentTailoringRepository,
  PreviewTailoringUnavailableError,
} from "./development-tailoring";
import { buildFictionalCvDocx, fictionalCvText } from "./fictional-cv";
import { TailoringUnavailableError } from "./repository";

const repository = createDevelopmentTailoringRepository();
const jobId = developmentJobs[0]!.id;

describe("fictional CV source", () => {
  it("builds a readable DOCX without committing a document", () => {
    const paragraphs = readDocxParagraphs(buildFictionalCvDocx());

    expect(paragraphs.length).toBeGreaterThan(5);
    expect(paragraphs[0]?.text).toContain("Fictionperson");
  });

  it("keeps the extracted text and the document in step", () => {
    const paragraphs = readDocxParagraphs(buildFictionalCvDocx());

    expect(fictionalCvText.split("\n")).toEqual(
      paragraphs.map((paragraph) => paragraph.text),
    );
  });

  it("includes a paragraph with mixed formatting so the warning is reachable", () => {
    const paragraphs = readDocxParagraphs(buildFictionalCvDocx());

    expect(paragraphs.some((paragraph) => !paragraph.uniformFormatting)).toBe(
      true,
    );
  });
});

describe("development tailoring repository", () => {
  it("returns a workspace for a fictional job", async () => {
    const workspace = await repository.getWorkspace(jobId);

    expect(workspace.dataMode).toBe("fixtures");
    expect(workspace.source.available).toBe(true);
    expect(workspace.paragraphs.length).toBeGreaterThan(0);
    expect(workspace.job.id).toBe(jobId);
  });

  it("reports an unknown job rather than inventing one", async () => {
    await expect(
      repository.getWorkspace("00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toBeInstanceOf(TailoringUnavailableError);
  });

  it("offers a deterministic focus assist without proposing wording", async () => {
    const workspace = await repository.getWorkspace(jobId);

    expect(Object.keys(workspace.focus).toSorted()).toEqual([
      "omissionCandidates",
      "relevant",
    ]);
  });

  it.each([
    [
      "saveVariant",
      () => repository.saveVariant({ jobId, name: "n", operations: [] }),
    ],
    ["promoteVariant", () => repository.promoteVariant("id")],
    ["deleteVariant", () => repository.deleteVariant("id")],
  ])("refuses %s in the preview", async (_label, call) => {
    await expect(call()).rejects.toBeInstanceOf(
      PreviewTailoringUnavailableError,
    );
  });

  it("still renders a real archive for download", async () => {
    const workspace = await repository.getWorkspace(jobId);
    const rendered = await repository.renderVariant(workspace.variant!.id);

    expect(rendered.fileName).toMatch(/\.docx$/u);
    const tailored = readDocxParagraphs(rendered.bytes);
    expect(tailored.map((paragraph) => paragraph.text)).toContain(
      "Delivered analytics implementation and event instrumentation for 12 product teams.",
    );
    expect(tailored.map((paragraph) => paragraph.text)).not.toContain(
      "Interests: long-distance cycling and amateur radio.",
    );
  });

  it("refuses to render an unknown variant", async () => {
    await expect(
      repository.renderVariant("00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toBeInstanceOf(TailoringUnavailableError);
  });
});
