import { getResolvedPDFJS } from "unpdf";

import {
  CvFileValidationError,
  cvFileLimits,
  type CvFileErrorCode,
} from "./file-gate.ts";
import type { ExtractedCvText } from "./docx.ts";

type ResolvedPdfJs = Awaited<ReturnType<typeof getResolvedPDFJS>>;
type PdfLoadingTask = ReturnType<ResolvedPdfJs["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;

interface PdfTextItem {
  hasEOL?: unknown;
  height?: unknown;
  str?: unknown;
  transform?: unknown;
  width?: unknown;
}

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

function discardCancellation(operation: () => unknown): void {
  try {
    const result = operation();
    if (result instanceof Promise) void result.catch(() => undefined);
  } catch {
    // Cancellation details are deliberately discarded.
  }
}

export function runWithExtractionDeadline<T>(
  operation: Promise<T>,
  startedAt: number,
  onTimeout: () => void = () => undefined,
): Promise<T> {
  const remaining = cvFileLimits.timeoutMilliseconds - (Date.now() - startedAt);
  if (remaining <= 0) {
    discardCancellation(onTimeout);
    return Promise.reject(new CvFileValidationError("extraction_timeout"));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      discardCancellation(onTimeout);
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

function pageContainsInvisibleText(
  operatorList: { argsArray?: unknown; fnArray?: unknown },
  setTextRenderingModeOperator: number,
): boolean {
  if (
    !Array.isArray(operatorList.fnArray) ||
    !Array.isArray(operatorList.argsArray) ||
    operatorList.fnArray.length !== operatorList.argsArray.length
  ) {
    fail("invalid_file");
  }
  const fnArray = operatorList.fnArray as unknown[];
  const argsArray = operatorList.argsArray as unknown[];

  return fnArray.some((operator, index) => {
    if (operator !== setTextRenderingModeOperator) return false;
    const argumentsForOperator = argsArray[index];
    if (!Array.isArray(argumentsForOperator)) fail("invalid_file");
    const mode = argumentsForOperator[0];
    if (!Number.isInteger(mode) || mode < 0 || mode > 7) fail("invalid_file");
    return (mode & 3) === 3;
  });
}

function visibleTextFromItem(
  item: PdfTextItem,
  pageView: readonly number[],
): string | undefined {
  if (typeof item.str !== "string" || item.str.length === 0) return undefined;
  if (
    !Array.isArray(item.transform) ||
    item.transform.length !== 6 ||
    !item.transform.every((value) => Number.isFinite(value)) ||
    !Number.isFinite(item.width) ||
    !Number.isFinite(item.height) ||
    (item.width as number) <= 0 ||
    (item.height as number) <= 0
  ) {
    return undefined;
  }

  const [minimumX, minimumY, maximumX, maximumY] = pageView;
  if (
    ![minimumX, minimumY, maximumX, maximumY].every((value) =>
      Number.isFinite(value),
    ) ||
    maximumX! <= minimumX! ||
    maximumY! <= minimumY!
  ) {
    fail("invalid_file");
  }
  const x = item.transform[4] as number;
  const y = item.transform[5] as number;
  const width = item.width as number;
  const height = item.height as number;
  const horizontalX = item.transform[0] as number;
  const horizontalY = item.transform[1] as number;
  const verticalX = item.transform[2] as number;
  const verticalY = item.transform[3] as number;
  const horizontalScale = Math.hypot(horizontalX, horizontalY);
  const verticalScale = Math.hypot(verticalX, verticalY);
  if (horizontalScale === 0 || verticalScale === 0) return undefined;

  const widthX = (horizontalX / horizontalScale) * width;
  const widthY = (horizontalY / horizontalScale) * width;
  const heightX = (verticalX / verticalScale) * height;
  const heightY = (verticalY / verticalScale) * height;
  const cornerXs = [x, x + widthX, x + heightX, x + widthX + heightX];
  const cornerYs = [y, y + widthY, y + heightY, y + widthY + heightY];
  if (![...cornerXs, ...cornerYs].every(Number.isFinite)) return undefined;
  const itemMinimumX = Math.min(...cornerXs);
  const itemMaximumX = Math.max(...cornerXs);
  const itemMinimumY = Math.min(...cornerYs);
  const itemMaximumY = Math.max(...cornerYs);
  if (
    itemMinimumX >= maximumX! ||
    itemMaximumX <= minimumX! ||
    itemMinimumY >= maximumY! ||
    itemMaximumY <= minimumY!
  ) {
    return undefined;
  }
  return `${item.str}${item.hasEOL === true ? "\n" : ""}`;
}

async function settleWithinExtractionDeadline(
  operation: () => unknown,
  startedAt: number,
): Promise<void> {
  let result: Promise<unknown>;
  try {
    result = Promise.resolve(operation());
  } catch {
    return;
  }
  await runWithExtractionDeadline(result, startedAt).catch(() => undefined);
}

async function destroyPdfResources(
  loadingTask: PdfLoadingTask | undefined,
  pdf: PdfDocument | undefined,
  startedAt: number,
): Promise<void> {
  await Promise.all([
    pdf
      ? settleWithinExtractionDeadline(() => pdf.destroy(), startedAt)
      : Promise.resolve(),
    loadingTask
      ? settleWithinExtractionDeadline(() => loadingTask.destroy(), startedAt)
      : Promise.resolve(),
  ]);
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

  let loadingTask: PdfLoadingTask | undefined;
  let pdf: PdfDocument | undefined;
  try {
    const pdfJs = await runWithExtractionDeadline(
      getResolvedPDFJS(),
      startedAt,
    );
    loadingTask = pdfJs.getDocument({
      data: bytes.slice(),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    pdf = await runWithExtractionDeadline(
      loadingTask.promise,
      startedAt,
      () => {
        discardCancellation(() => loadingTask?.destroy());
      },
    );
    if (!Number.isInteger(pdf.numPages) || pdf.numPages <= 0) {
      fail("invalid_file");
    }
    if (pdf.numPages > cvFileLimits.pdfPages) fail("page_limit");

    const textParts: string[] = [];
    let textLength = 0;
    let truncated = false;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const currentPdf = pdf;
      const page = await runWithExtractionDeadline(
        currentPdf.getPage(pageNumber),
        startedAt,
        () => discardCancellation(() => currentPdf.destroy()),
      );
      try {
        const operatorList = await runWithExtractionDeadline(
          page.getOperatorList(),
          startedAt,
          () => discardCancellation(() => currentPdf.destroy()),
        );
        if (
          pageContainsInvisibleText(
            operatorList,
            pdfJs.OPS.setTextRenderingMode,
          )
        ) {
          fail("invalid_file");
        }

        if (!Array.isArray(page.view) || page.view.length !== 4) {
          fail("invalid_file");
        }
        const pageParts: string[] = [];
        let pageLength = 0;
        const pageBudget =
          cvFileLimits.extractedCharacters -
          textLength -
          (textLength === 0 ? 0 : 1);
        if (pageBudget <= 0) {
          truncated = true;
          break;
        }

        const reader = page.streamTextContent().getReader();
        let cancelled = false;
        const cancelReader = async (): Promise<void> => {
          if (cancelled) return;
          cancelled = true;
          await settleWithinExtractionDeadline(
            () => reader.cancel(new CvFileValidationError("invalid_file")),
            startedAt,
          );
        };
        try {
          while (!truncated) {
            const chunk = await runWithExtractionDeadline(
              reader.read(),
              startedAt,
              () => {
                discardCancellation(cancelReader);
                discardCancellation(() => currentPdf.destroy());
              },
            );
            if (chunk.done) break;
            if (
              !chunk.value ||
              typeof chunk.value !== "object" ||
              !Array.isArray((chunk.value as { items?: unknown }).items)
            ) {
              fail("invalid_file");
            }
            const items = (chunk.value as { items: PdfTextItem[] }).items;
            for (const item of items) {
              const visible = visibleTextFromItem(item, page.view);
              if (visible === undefined) continue;
              const remaining = pageBudget - pageLength;
              if (remaining <= 0) {
                truncated = true;
                await cancelReader();
                break;
              }
              const accepted = visible.slice(0, remaining);
              pageParts.push(accepted);
              pageLength += accepted.length;
              if (
                accepted.length < visible.length ||
                pageLength === pageBudget
              ) {
                truncated = true;
                await cancelReader();
                break;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        const pageText = pageParts.join("").trim();
        if (pageText.length > 0) {
          if (textLength > 0) {
            textParts.push("\n");
            textLength += 1;
          }
          textParts.push(pageText);
          textLength += pageText.length;
        }
        if (truncated) break;
      } finally {
        page.cleanup();
      }
    }

    const text = textParts.join("");
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
    await destroyPdfResources(loadingTask, pdf, startedAt);
  }
}
