import { getDocumentProxy } from "unpdf";

import {
  CvFileValidationError,
  cvFileLimits,
  type CvFileErrorCode,
} from "./file-gate.ts";
import type { ExtractedCvText } from "./docx.ts";

function fail(code: CvFileErrorCode): never {
  throw new CvFileValidationError(code);
}

function isPasswordError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.name === "PasswordException" ||
    candidate.code === 1 ||
    candidate.code === 2
  );
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function declaresEncryption(bytes: Uint8Array): boolean {
  const trailerWindow = bytes.subarray(Math.max(0, bytes.length - 131_072));
  const trailer = new TextDecoder("latin1").decode(trailerWindow);
  return /\/Encrypt\b/u.test(trailer);
}

export function runWithExtractionDeadline<T>(
  operation: Promise<T>,
  startedAt: number,
  onTimeout: () => void = () => undefined,
): Promise<T> {
  const remaining = cvFileLimits.timeoutMilliseconds - (Date.now() - startedAt);
  if (remaining <= 0) {
    try {
      onTimeout();
    } catch {
      // Cancellation details are deliberately discarded.
    }
    return Promise.reject(new CvFileValidationError("extraction_timeout"));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout();
      } catch {
        // Cancellation details are deliberately discarded.
      }
      reject(new CvFileValidationError("extraction_timeout"));
    }, remaining);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<ExtractedCvText> {
  const startedAt = Date.now();
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length === 0 ||
    bytes.length > cvFileLimits.inputBytes ||
    !hasPdfHeader(bytes)
  ) {
    fail("invalid_file");
  }
  if (declaresEncryption(bytes)) fail("encrypted_pdf");

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await runWithExtractionDeadline(
      getDocumentProxy(bytes, {
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: true,
      }),
      startedAt,
    );
    if (!Number.isInteger(pdf.numPages) || pdf.numPages <= 0) {
      fail("invalid_file");
    }
    if (pdf.numPages > cvFileLimits.pdfPages) fail("page_limit");

    let text = "";
    let truncated = false;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const currentPdf = pdf;
      const page = await runWithExtractionDeadline(
        currentPdf.getPage(pageNumber),
        startedAt,
        () => void currentPdf.destroy().catch(() => undefined),
      );
      try {
        const content = await runWithExtractionDeadline(
          page.getTextContent(),
          startedAt,
          () => void currentPdf.destroy().catch(() => undefined),
        );
        const pageText = content.items
          .flatMap((item) => {
            if (!("str" in item) || typeof item.str !== "string") return [];
            return `${item.str}${item.hasEOL ? "\n" : ""}`;
          })
          .join("")
          .trim();
        if (pageText.length === 0) continue;

        const separator = text.length === 0 ? "" : "\n";
        const remaining =
          cvFileLimits.extractedCharacters - text.length - separator.length;
        if (remaining <= 0) {
          truncated = true;
          break;
        }

        text += separator + pageText.slice(0, remaining);
        if (pageText.length > remaining) {
          truncated = true;
          break;
        }
      } finally {
        page.cleanup();
      }
    }

    if (text.length === 0) fail("invalid_file");
    return {
      kind: "pdf",
      text,
      truncated,
      pageCount: pdf.numPages,
    };
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    if (isPasswordError(error)) fail("encrypted_pdf");
    fail("invalid_file");
  } finally {
    if (pdf) await pdf.destroy().catch(() => undefined);
  }

  fail("internal_error");
}
