import { getResolvedPDFJS } from "unpdf";

import {
  CvFileValidationError,
  cvFileLimits,
  ensureCvExtractionWithinDeadline,
  type CvFileErrorCode,
} from "./file-gate.ts";
import type { ExtractedCvText } from "./docx.ts";

type ResolvedPdfJs = Awaited<ReturnType<typeof getResolvedPDFJS>>;
type PdfLoadingTask = ReturnType<ResolvedPdfJs["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;
type PdfOptionalContentConfig = Awaited<
  ReturnType<PdfDocument["getOptionalContentConfig"]>
>;

interface PdfTextItem {
  hasEOL?: unknown;
  height?: unknown;
  str?: unknown;
  transform?: unknown;
  width?: unknown;
}

interface PdfOperatorIds {
  beginMarkedContent: number;
  beginMarkedContentProps: number;
  endMarkedContent: number;
  nextLineSetSpacingShowText: number;
  nextLineShowText: number;
  setFillTransparent: number;
  setGState: number;
  setStrokeTransparent: number;
  setTextRenderingMode: number;
  showSpacedText: number;
  showText: number;
}

const unsupportedPdfNames = new Set([
  "AA",
  "AF",
  "GoToE",
  "GoToR",
  "Hide",
  "ImportData",
  "Launch",
  "Movie",
  "Named",
  "ObjStm",
  "OpenAction",
  "Rendition",
  "ResetForm",
  "SetOCGState",
  "Sound",
  "SubmitForm",
  "URI",
  "XFA",
]);
const longestUnsupportedPdfName = Math.max(
  ...Array.from(unsupportedPdfNames, (name) => name.length),
);
const pdfLexicalDeadlineInterval = 16_384;
const pdfMaxContainerDepth = 128;
const pdfIntegerPattern = /^[+-]?\d+$/u;
const pdfNumberPattern = /^[+-]?(?:\d+|\d+\.\d*|\.\d+)$/u;

interface PdfLexicalState {
  bytes: Uint8Array;
  containerDepth: number;
  nextDeadlineOffset: number;
  offset: number;
  startedAt: number;
}

interface PdfDictionarySummary {
  directStreamLength?: number;
}

type PdfValueSummary =
  | { integer?: number; kind: "integer" }
  | { kind: "other" }
  | { kind: "reference" };

class PdfLexicalSyntaxError extends Error {}

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

function isPdfWhitespace(byte: number): boolean {
  return (
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function isPdfDelimiter(byte: number): boolean {
  return (
    byte === 0x25 ||
    byte === 0x28 ||
    byte === 0x29 ||
    byte === 0x2f ||
    byte === 0x3c ||
    byte === 0x3e ||
    byte === 0x5b ||
    byte === 0x5d ||
    byte === 0x7b ||
    byte === 0x7d
  );
}

function isPdfTokenBoundary(byte: number): boolean {
  return isPdfWhitespace(byte) || isPdfDelimiter(byte);
}

function hexadecimalValue(byte: number): number | undefined {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return undefined;
}

function rejectPdfLexicalSyntax(): never {
  throw new PdfLexicalSyntaxError();
}

function checkPdfLexicalDeadline(state: PdfLexicalState): void {
  if (state.offset < state.nextDeadlineOffset) return;
  ensureCvExtractionWithinDeadline(state.startedAt);
  state.nextDeadlineOffset = state.offset + pdfLexicalDeadlineInterval;
}

function skipPdfWhitespaceAndComments(state: PdfLexicalState): void {
  while (state.offset < state.bytes.length) {
    checkPdfLexicalDeadline(state);
    const byte = state.bytes[state.offset]!;
    if (isPdfWhitespace(byte)) {
      state.offset += 1;
      continue;
    }
    if (byte !== 0x25) return;
    state.offset += 1;
    while (state.offset < state.bytes.length) {
      const commentByte = state.bytes[state.offset]!;
      if (commentByte === 0x0a || commentByte === 0x0d) break;
      state.offset += 1;
      checkPdfLexicalDeadline(state);
    }
  }
}

function scanPdfLiteralString(state: PdfLexicalState): void {
  if (state.bytes[state.offset] !== 0x28) rejectPdfLexicalSyntax();
  state.offset += 1;
  let depth = 1;
  while (state.offset < state.bytes.length) {
    checkPdfLexicalDeadline(state);
    const byte = state.bytes[state.offset]!;
    if (byte === 0x5c) {
      state.offset += 1;
      if (state.offset >= state.bytes.length) rejectPdfLexicalSyntax();
      const escaped = state.bytes[state.offset]!;
      if (escaped === 0x0d) {
        state.offset += 1;
        if (state.bytes[state.offset] === 0x0a) state.offset += 1;
        continue;
      }
      if (escaped === 0x0a) {
        state.offset += 1;
        continue;
      }
      if (escaped >= 0x30 && escaped <= 0x37) {
        state.offset += 1;
        for (let digit = 1; digit < 3; digit += 1) {
          const octal = state.bytes[state.offset];
          if (octal === undefined || octal < 0x30 || octal > 0x37) break;
          state.offset += 1;
        }
        continue;
      }
      state.offset += 1;
      continue;
    }
    state.offset += 1;
    if (byte === 0x28) depth += 1;
    if (byte === 0x29) depth -= 1;
    if (depth === 0) return;
  }
  rejectPdfLexicalSyntax();
}

function scanPdfHexadecimalString(state: PdfLexicalState): void {
  if (state.bytes[state.offset] !== 0x3c) rejectPdfLexicalSyntax();
  state.offset += 1;
  while (state.offset < state.bytes.length) {
    checkPdfLexicalDeadline(state);
    const byte = state.bytes[state.offset]!;
    if (byte === 0x3e) {
      state.offset += 1;
      return;
    }
    if (!isPdfWhitespace(byte) && hexadecimalValue(byte) === undefined) {
      rejectPdfLexicalSyntax();
    }
    state.offset += 1;
  }
  rejectPdfLexicalSyntax();
}

function scanPdfName(state: PdfLexicalState): string | undefined {
  if (state.bytes[state.offset] !== 0x2f) rejectPdfLexicalSyntax();
  state.offset += 1;
  let decodedName = "";
  let canMatchUnsupportedName = true;
  while (state.offset < state.bytes.length) {
    checkPdfLexicalDeadline(state);
    let byte = state.bytes[state.offset]!;
    if (isPdfTokenBoundary(byte)) break;
    state.offset += 1;
    if (byte === 0x23) {
      const high = hexadecimalValue(state.bytes[state.offset] ?? -1);
      const low = hexadecimalValue(state.bytes[state.offset + 1] ?? -1);
      if (high === undefined || low === undefined) rejectPdfLexicalSyntax();
      byte = high * 16 + low;
      state.offset += 2;
    }
    if (byte === 0x00) rejectPdfLexicalSyntax();
    if (canMatchUnsupportedName) {
      if (decodedName.length >= longestUnsupportedPdfName) {
        canMatchUnsupportedName = false;
      } else {
        decodedName += String.fromCharCode(byte);
      }
    }
  }
  if (canMatchUnsupportedName && unsupportedPdfNames.has(decodedName)) {
    rejectPdfLexicalSyntax();
  }
  return canMatchUnsupportedName ? decodedName : undefined;
}

function scanPdfRegularToken(state: PdfLexicalState): string {
  const start = state.offset;
  while (
    state.offset < state.bytes.length &&
    !isPdfTokenBoundary(state.bytes[state.offset]!)
  ) {
    state.offset += 1;
    checkPdfLexicalDeadline(state);
    if (state.offset - start > 64) rejectPdfLexicalSyntax();
  }
  if (state.offset === start) rejectPdfLexicalSyntax();
  return String.fromCharCode(...state.bytes.subarray(start, state.offset));
}

function regularPdfTokenStartsAtCurrentOffset(state: PdfLexicalState): boolean {
  const byte = state.bytes[state.offset];
  return byte !== undefined && !isPdfTokenBoundary(byte);
}

function pdfKeywordStartsAtCurrentOffset(
  state: PdfLexicalState,
  keyword: string,
): boolean {
  if (state.offset + keyword.length > state.bytes.length) return false;
  for (let index = 0; index < keyword.length; index += 1) {
    if (state.bytes[state.offset + index] !== keyword.charCodeAt(index)) {
      return false;
    }
  }
  const following = state.bytes[state.offset + keyword.length];
  return following === undefined || isPdfTokenBoundary(following);
}

function enterPdfContainer(state: PdfLexicalState): void {
  state.containerDepth += 1;
  if (state.containerDepth > pdfMaxContainerDepth) rejectPdfLexicalSyntax();
}

function scanPdfArray(state: PdfLexicalState): void {
  if (state.bytes[state.offset] !== 0x5b) rejectPdfLexicalSyntax();
  state.offset += 1;
  enterPdfContainer(state);
  while (true) {
    skipPdfWhitespaceAndComments(state);
    if (state.offset >= state.bytes.length) rejectPdfLexicalSyntax();
    if (state.bytes[state.offset] === 0x5d) {
      state.offset += 1;
      state.containerDepth -= 1;
      return;
    }
    scanPdfValue(state);
  }
}

function scanPdfNumberOrReference(
  state: PdfLexicalState,
  token: string,
): PdfValueSummary {
  if (!pdfNumberPattern.test(token)) rejectPdfLexicalSyntax();
  if (!pdfIntegerPattern.test(token)) return { kind: "other" };

  const integer = Number(token);
  const afterFirstInteger = state.offset;
  skipPdfWhitespaceAndComments(state);
  if (!regularPdfTokenStartsAtCurrentOffset(state)) {
    state.offset = afterFirstInteger;
    return {
      integer: Number.isSafeInteger(integer) ? integer : undefined,
      kind: "integer",
    };
  }

  const secondToken = scanPdfRegularToken(state);
  if (!pdfIntegerPattern.test(secondToken)) {
    state.offset = afterFirstInteger;
    return {
      integer: Number.isSafeInteger(integer) ? integer : undefined,
      kind: "integer",
    };
  }
  const secondInteger = Number(secondToken);
  skipPdfWhitespaceAndComments(state);
  if (
    !pdfKeywordStartsAtCurrentOffset(state, "R") ||
    !Number.isSafeInteger(integer) ||
    integer <= 0 ||
    !Number.isSafeInteger(secondInteger) ||
    secondInteger < 0
  ) {
    state.offset = afterFirstInteger;
    return {
      integer: Number.isSafeInteger(integer) ? integer : undefined,
      kind: "integer",
    };
  }
  state.offset += 1;
  return { kind: "reference" };
}

function scanPdfValue(state: PdfLexicalState): PdfValueSummary {
  skipPdfWhitespaceAndComments(state);
  const byte = state.bytes[state.offset];
  if (byte === undefined) rejectPdfLexicalSyntax();
  if (byte === 0x28) {
    scanPdfLiteralString(state);
    return { kind: "other" };
  }
  if (byte === 0x3c) {
    if (state.bytes[state.offset + 1] === 0x3c) {
      scanPdfDictionary(state);
    } else {
      scanPdfHexadecimalString(state);
    }
    return { kind: "other" };
  }
  if (byte === 0x5b) {
    scanPdfArray(state);
    return { kind: "other" };
  }
  if (byte === 0x2f) {
    scanPdfName(state);
    return { kind: "other" };
  }
  if (!regularPdfTokenStartsAtCurrentOffset(state)) {
    rejectPdfLexicalSyntax();
  }
  const token = scanPdfRegularToken(state);
  if (token === "true" || token === "false" || token === "null") {
    return { kind: "other" };
  }
  return scanPdfNumberOrReference(state, token);
}

function scanPdfDictionary(state: PdfLexicalState): PdfDictionarySummary {
  if (
    state.bytes[state.offset] !== 0x3c ||
    state.bytes[state.offset + 1] !== 0x3c
  ) {
    rejectPdfLexicalSyntax();
  }
  state.offset += 2;
  enterPdfContainer(state);
  let directStreamLength: number | undefined;
  let sawLength = false;
  while (true) {
    skipPdfWhitespaceAndComments(state);
    if (state.offset >= state.bytes.length) rejectPdfLexicalSyntax();
    if (
      state.bytes[state.offset] === 0x3e &&
      state.bytes[state.offset + 1] === 0x3e
    ) {
      state.offset += 2;
      state.containerDepth -= 1;
      return { directStreamLength };
    }
    if (state.bytes[state.offset] !== 0x2f) rejectPdfLexicalSyntax();
    const key = scanPdfName(state);
    const value = scanPdfValue(state);
    if (key !== "Length") continue;
    if (sawLength) rejectPdfLexicalSyntax();
    sawLength = true;
    if (
      value.kind === "integer" &&
      value.integer !== undefined &&
      value.integer >= 0
    ) {
      directStreamLength = value.integer;
    }
  }
}

function consumePdfEndOfLine(state: PdfLexicalState): void {
  const byte = state.bytes[state.offset];
  if (byte === 0x0a) {
    state.offset += 1;
    return;
  }
  if (byte !== 0x0d) rejectPdfLexicalSyntax();
  state.offset += 1;
  if (state.bytes[state.offset] === 0x0a) state.offset += 1;
}

function scanPdfStream(
  state: PdfLexicalState,
  directStreamLength: number | undefined,
): void {
  if (
    directStreamLength === undefined ||
    !pdfKeywordStartsAtCurrentOffset(state, "stream")
  ) {
    rejectPdfLexicalSyntax();
  }
  state.offset += "stream".length;
  consumePdfEndOfLine(state);
  const dataEnd = state.offset + directStreamLength;
  if (!Number.isSafeInteger(dataEnd) || dataEnd > state.bytes.length) {
    rejectPdfLexicalSyntax();
  }
  state.offset = dataEnd;
  checkPdfLexicalDeadline(state);
  consumePdfEndOfLine(state);
  if (!pdfKeywordStartsAtCurrentOffset(state, "endstream")) {
    rejectPdfLexicalSyntax();
  }
  state.offset += "endstream".length;
}

function containsUnsafePdfLexicalSyntax(
  bytes: Uint8Array,
  startedAt: number,
): boolean {
  const state: PdfLexicalState = {
    bytes,
    containerDepth: 0,
    nextDeadlineOffset: 0,
    offset: 0,
    startedAt,
  };
  try {
    while (state.offset < bytes.length) {
      skipPdfWhitespaceAndComments(state);
      if (state.offset >= bytes.length) break;
      const byte = bytes[state.offset]!;
      if (byte === 0x28) {
        scanPdfLiteralString(state);
        continue;
      }
      if (byte === 0x3c) {
        if (bytes[state.offset + 1] === 0x3c) {
          const dictionary = scanPdfDictionary(state);
          skipPdfWhitespaceAndComments(state);
          if (pdfKeywordStartsAtCurrentOffset(state, "stream")) {
            scanPdfStream(state, dictionary.directStreamLength);
          }
        } else {
          scanPdfHexadecimalString(state);
        }
        continue;
      }
      if (byte === 0x5b) {
        scanPdfArray(state);
        continue;
      }
      if (byte === 0x2f) {
        scanPdfName(state);
        continue;
      }
      if (!regularPdfTokenStartsAtCurrentOffset(state)) {
        rejectPdfLexicalSyntax();
      }
      const token = scanPdfRegularToken(state);
      if (token === "stream" || token === "endstream") {
        rejectPdfLexicalSyntax();
      }
    }
    return false;
  } catch (error) {
    if (error instanceof PdfLexicalSyntaxError) return true;
    throw error;
  }
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

function hasSecuritySurface(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Reflect.ownKeys(value).length > 0;
  return true;
}

function pageContainsInvisibleText(
  operatorList: { argsArray?: unknown; fnArray?: unknown },
  operators: PdfOperatorIds,
  optionalContentConfig: PdfOptionalContentConfig,
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
  const markedContentStack: Array<
    "ordinary" | "optional-hidden" | "optional-visible"
  > = [];
  let containsHiddenOptionalContent = false;

  const containsInvisibleText = fnArray.some((operator, index) => {
    const argumentsForOperator = argsArray[index];
    if (operator === operators.beginMarkedContent) {
      if (
        !Array.isArray(argumentsForOperator) ||
        typeof argumentsForOperator[0] !== "string"
      ) {
        fail("invalid_file");
      }
      markedContentStack.push("ordinary");
      return false;
    }
    if (operator === operators.beginMarkedContentProps) {
      if (
        !Array.isArray(argumentsForOperator) ||
        typeof argumentsForOperator[0] !== "string"
      ) {
        fail("invalid_file");
      }
      if (argumentsForOperator[0] !== "OC") {
        markedContentStack.push("ordinary");
        return false;
      }
      const properties = argumentsForOperator[1];
      if (
        !properties ||
        typeof properties !== "object" ||
        Array.isArray(properties)
      ) {
        fail("invalid_file");
      }
      const optionalContent = properties as {
        id?: unknown;
        type?: unknown;
      };
      if (
        optionalContent.type !== "OCG" ||
        typeof optionalContent.id !== "string" ||
        optionalContent.id.length === 0 ||
        !optionalContentConfig.getGroup(optionalContent.id)
      ) {
        fail("invalid_file");
      }
      const visible = optionalContentConfig.isVisible(properties);
      if (typeof visible !== "boolean") fail("invalid_file");
      markedContentStack.push(visible ? "optional-visible" : "optional-hidden");
      if (!visible) containsHiddenOptionalContent = true;
      return false;
    }
    if (operator === operators.endMarkedContent) {
      if (
        argumentsForOperator !== null &&
        (!Array.isArray(argumentsForOperator) ||
          argumentsForOperator.length !== 0)
      ) {
        fail("invalid_file");
      }
      if (markedContentStack.pop() === undefined) fail("invalid_file");
      return false;
    }
    if (
      (operator === operators.showText ||
        operator === operators.showSpacedText ||
        operator === operators.nextLineShowText ||
        operator === operators.nextLineSetSpacingShowText) &&
      markedContentStack.includes("optional-hidden")
    ) {
      return true;
    }
    if (
      operator === operators.setFillTransparent ||
      operator === operators.setStrokeTransparent
    ) {
      return true;
    }
    if (operator === operators.setTextRenderingMode) {
      if (!Array.isArray(argumentsForOperator)) fail("invalid_file");
      const mode = argumentsForOperator[0];
      if (!Number.isInteger(mode) || mode < 0 || mode > 7) {
        fail("invalid_file");
      }
      return (mode & 3) === 3;
    }
    if (operator !== operators.setGState) return false;
    if (!Array.isArray(argumentsForOperator)) fail("invalid_file");
    const state = argumentsForOperator[0];
    if (!Array.isArray(state)) fail("invalid_file");
    return state.some((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) fail("invalid_file");
      const [name, value] = entry;
      if (typeof name !== "string") fail("invalid_file");
      if (name === "ca" || name === "CA") {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1
        ) {
          fail("invalid_file");
        }
        return value === 0;
      }
      if (name === "SMask") {
        return value !== false && value !== null && value !== "None";
      }
      return false;
    });
  });
  if (markedContentStack.length !== 0) fail("invalid_file");
  return containsInvisibleText || containsHiddenOptionalContent;
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
  if (containsUnsafePdfLexicalSyntax(bytes, startedAt)) fail("invalid_file");

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

    const currentPdf = pdf;
    const [attachments, documentActions, openAction, optionalContentConfig] =
      await Promise.all([
        runWithExtractionDeadline(currentPdf.getAttachments(), startedAt, () =>
          discardCancellation(() => currentPdf.destroy()),
        ),
        runWithExtractionDeadline(currentPdf.getJSActions(), startedAt, () =>
          discardCancellation(() => currentPdf.destroy()),
        ),
        runWithExtractionDeadline(currentPdf.getOpenAction(), startedAt, () =>
          discardCancellation(() => currentPdf.destroy()),
        ),
        runWithExtractionDeadline(
          currentPdf.getOptionalContentConfig({ intent: "display" }),
          startedAt,
          () => discardCancellation(() => currentPdf.destroy()),
        ),
      ]);
    if (
      hasSecuritySurface(attachments) ||
      hasSecuritySurface(documentActions) ||
      hasSecuritySurface(openAction)
    ) {
      fail("invalid_file");
    }

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
        const [annotations, pageActions, operatorList] = await Promise.all([
          runWithExtractionDeadline(page.getAnnotations(), startedAt, () =>
            discardCancellation(() => currentPdf.destroy()),
          ),
          runWithExtractionDeadline(page.getJSActions(), startedAt, () =>
            discardCancellation(() => currentPdf.destroy()),
          ),
          runWithExtractionDeadline(page.getOperatorList(), startedAt, () =>
            discardCancellation(() => currentPdf.destroy()),
          ),
        ]);
        if (!Array.isArray(annotations) || annotations.length > 0) {
          fail("invalid_file");
        }
        if (hasSecuritySurface(pageActions)) fail("invalid_file");
        if (
          pageContainsInvisibleText(
            operatorList,
            {
              beginMarkedContent: pdfJs.OPS.beginMarkedContent,
              beginMarkedContentProps: pdfJs.OPS.beginMarkedContentProps,
              endMarkedContent: pdfJs.OPS.endMarkedContent,
              nextLineSetSpacingShowText: pdfJs.OPS.nextLineSetSpacingShowText,
              nextLineShowText: pdfJs.OPS.nextLineShowText,
              setFillTransparent: pdfJs.OPS.setFillTransparent,
              setGState: pdfJs.OPS.setGState,
              setStrokeTransparent: pdfJs.OPS.setStrokeTransparent,
              setTextRenderingMode: pdfJs.OPS.setTextRenderingMode,
              showSpacedText: pdfJs.OPS.showSpacedText,
              showText: pdfJs.OPS.showText,
            },
            optionalContentConfig,
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
