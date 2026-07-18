export const cvFileLimits = {
  inputBytes: 5 * 1024 * 1024,
  uncompressedBytes: 20 * 1024 * 1024,
  archiveEntries: 2_000,
  pdfPages: 250,
  extractedCharacters: 100_000,
  timeoutMilliseconds: 20_000,
} as const;

export const cvFileErrorCodes = [
  "invalid_file",
  "unsupported_type",
  "file_too_large",
  "unsafe_archive",
  "encrypted_pdf",
  "page_limit",
  "extraction_timeout",
  "storage_missing",
  "internal_error",
] as const;

export type CvFileErrorCode = (typeof cvFileErrorCodes)[number];
export type CvFileKind = "docx" | "pdf";

export interface CvFileInput {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
}

export interface ValidatedCvFile {
  fileName: string;
  mediaType:
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/pdf";
  kind: CvFileKind;
  bytes: Uint8Array;
}

export class CvFileValidationError extends Error {
  readonly code: CvFileErrorCode;

  constructor(code: CvFileErrorCode) {
    super(`CV file rejected: ${code}`);
    this.name = "CvFileValidationError";
    this.code = code;
  }
}

export function ensureCvExtractionWithinDeadline(startedAt: number): void {
  if (
    !Number.isFinite(startedAt) ||
    Date.now() - startedAt >= cvFileLimits.timeoutMilliseconds
  ) {
    throw new CvFileValidationError("extraction_timeout");
  }
}

export function consumeCvInflatedBytes(
  currentBytes: number,
  emittedBytes: number,
): number {
  if (
    !Number.isSafeInteger(currentBytes) ||
    currentBytes < 0 ||
    !Number.isSafeInteger(emittedBytes) ||
    emittedBytes < 0
  ) {
    throw new CvFileValidationError("unsafe_archive");
  }

  const nextBytes = currentBytes + emittedBytes;
  if (
    !Number.isSafeInteger(nextBytes) ||
    nextBytes > cvFileLimits.uncompressedBytes
  ) {
    throw new CvFileValidationError("unsafe_archive");
  }
  return nextBytes;
}

const docxMediaType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfMediaType = "application/pdf";
const unsafeFileNamePattern = /[\u0000-\u001f\u007f/\\]/u;

function kindFromFileName(fileName: string): CvFileKind {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".docx")) return "docx";
  if (lowerFileName.endsWith(".pdf")) return "pdf";
  throw new CvFileValidationError("unsupported_type");
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function hasDocxMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function validateCvFile(input: CvFileInput): ValidatedCvFile {
  const fileName = input.fileName.trim();
  if (
    fileName.length === 0 ||
    fileName.length > 255 ||
    unsafeFileNamePattern.test(fileName)
  ) {
    throw new CvFileValidationError("invalid_file");
  }

  const kind = kindFromFileName(fileName);
  if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) {
    throw new CvFileValidationError("invalid_file");
  }
  if (input.bytes.length > cvFileLimits.inputBytes) {
    throw new CvFileValidationError("file_too_large");
  }

  const expectedMediaType = kind === "docx" ? docxMediaType : pdfMediaType;
  const hasExpectedMagic =
    kind === "docx" ? hasDocxMagic(input.bytes) : hasPdfMagic(input.bytes);

  if (input.mediaType !== expectedMediaType || !hasExpectedMagic) {
    throw new CvFileValidationError("invalid_file");
  }

  return {
    fileName,
    mediaType: expectedMediaType,
    kind,
    bytes: input.bytes.slice(),
  };
}
