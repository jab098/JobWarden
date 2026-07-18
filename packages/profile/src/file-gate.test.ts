import { describe, expect, it } from "vitest";

import {
  CvFileValidationError,
  cvFileLimits,
  validateCvFile,
} from "./file-gate.ts";

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n% fictional fixture");
const docxBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe("CV file gate", () => {
  it("accepts a bounded PDF only when extension, MIME, and magic agree", () => {
    expect(
      validateCvFile({
        fileName: "fictional-profile.pdf",
        mediaType: "application/pdf",
        bytes: pdfBytes,
      }),
    ).toMatchObject({
      fileName: "fictional-profile.pdf",
      mediaType: "application/pdf",
      kind: "pdf",
    });
  });

  it("accepts DOCX ZIP magic with the exact non-macro MIME", () => {
    expect(
      validateCvFile({
        fileName: "fictional-profile.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: docxBytes,
      }).kind,
    ).toBe("docx");
  });

  it.each([
    {
      fileName: "fictional-profile.docm",
      mediaType: "application/vnd.ms-word.document.macroEnabled.12",
      bytes: docxBytes,
    },
    {
      fileName: "fictional-profile.doc",
      mediaType: "application/msword",
      bytes: Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]),
    },
    {
      fileName: "fictional-profile.txt",
      mediaType: "text/plain",
      bytes: new TextEncoder().encode("fictional text"),
    },
  ])("rejects unsupported document type $fileName", (input) => {
    expect(() => validateCvFile(input)).toThrowError(
      expect.objectContaining({ code: "unsupported_type" }),
    );
  });

  it.each([
    {
      fileName: "fictional-profile.pdf",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: pdfBytes,
    },
    {
      fileName: "fictional-profile.docx",
      mediaType: "application/pdf",
      bytes: docxBytes,
    },
    {
      fileName: "fictional-profile.pdf",
      mediaType: "application/pdf",
      bytes: docxBytes,
    },
    {
      fileName: "fictional-profile.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: pdfBytes,
    },
  ])("rejects extension, MIME, or magic disagreement", (input) => {
    expect(() => validateCvFile(input)).toThrowError(
      expect.objectContaining({ code: "invalid_file" }),
    );
  });

  it.each([
    "../fictional-profile.pdf",
    "folder/fictional-profile.pdf",
    "folder\\fictional-profile.pdf",
    "fictional\u0000profile.pdf",
    "   ",
  ])("rejects unsafe or empty display file name %#", (fileName) => {
    expect(() =>
      validateCvFile({
        fileName,
        mediaType: "application/pdf",
        bytes: pdfBytes,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_file" }));
  });

  it("rejects empty input and input over the 5 MiB ceiling", () => {
    expect(() =>
      validateCvFile({
        fileName: "empty.pdf",
        mediaType: "application/pdf",
        bytes: new Uint8Array(),
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_file" }));

    expect(() =>
      validateCvFile({
        fileName: "oversized.pdf",
        mediaType: "application/pdf",
        bytes: new Uint8Array(cvFileLimits.inputBytes + 1),
      }),
    ).toThrowError(expect.objectContaining({ code: "file_too_large" }));
  });

  it("does not retain a mutable reference to caller-owned bytes", () => {
    const source = pdfBytes.slice();
    const validated = validateCvFile({
      fileName: "fictional-profile.pdf",
      mediaType: "application/pdf",
      bytes: source,
    });

    source[0] = 0;

    expect(validated.bytes[0]).toBe(0x25);
  });

  it("uses sanitised bounded errors without including the file name", () => {
    try {
      validateCvFile({
        fileName: "private-name.docm",
        mediaType: "application/vnd.ms-word.document.macroEnabled.12",
        bytes: docxBytes,
      });
      expect.unreachable("validation should reject DOCM");
    } catch (error) {
      expect(error).toBeInstanceOf(CvFileValidationError);
      expect(error).toMatchObject({ code: "unsupported_type" });
      expect((error as Error).message).not.toContain("private-name");
    }
  });
});
