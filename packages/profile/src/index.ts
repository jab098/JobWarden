import { extractDocxText } from "./docx.ts";
import type { ValidatedCvFile } from "./file-gate.ts";
import { extractPdfText } from "./pdf.ts";

export * from "./docx.ts";
export * from "./docx-edit.ts";
export * from "./file-gate.ts";
export * from "./pdf.ts";
export * from "./proposal.ts";

export function extractCvText(file: ValidatedCvFile) {
  return file.kind === "docx"
    ? extractDocxText(file.bytes)
    : extractPdfText(file.bytes);
}
