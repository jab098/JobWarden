import type { DocxParagraph, TailoringOperation } from "@jobwarden/domain";
import { strToU8, zipSync } from "fflate";

import {
  decodeXml,
  extractArchiveEntry,
  inspectArchive,
  type ArchiveEntry,
} from "./docx.ts";
import { CvFileValidationError, type CvFileErrorCode } from "./file-gate.ts";

/**
 * Conservative OOXML editing. Two operations only — replace a paragraph's text
 * and omit a paragraph — because those are the only edits that leave the
 * surrounding structure, numbering, and section breaks untouched.
 *
 * ponytail: this scans `<w:p>` and `<w:t>` element boundaries as text rather
 * than rebuilding the document from parse events. Rebuilding loses fidelity in
 * more ways than it protects against, and the boundaries are only ambiguous in
 * the presence of comments, CDATA, and processing instructions — which
 * `assertUnambiguousMarkup` rejects outright. Move to a full round-tripping
 * parser only if an edit richer than these two is ever required.
 */

const documentPartName = "word/document.xml";

function fail(code: CvFileErrorCode): never {
  throw new CvFileValidationError(code);
}

interface LoadedArchive {
  /** Original entry names, so the rewritten archive keeps its exact parts. */
  parts: Map<string, Uint8Array>;
  documentEntryName: string;
  documentXml: string;
}

function loadArchive(bytes: Uint8Array): LoadedArchive {
  const startedAt = Date.now();
  const entries: ArchiveEntry[] = inspectArchive(bytes, startedAt);
  const parts = new Map<string, Uint8Array>();
  const actualBytes = { value: 0 };
  let documentEntryName: string | null = null;

  for (const entry of entries) {
    const content = extractArchiveEntry(bytes, entry, startedAt, actualBytes);
    parts.set(entry.name, content);
    if (entry.normalizedName === documentPartName)
      documentEntryName = entry.name;
  }

  if (documentEntryName === null) fail("unsafe_archive");

  return {
    parts,
    documentEntryName,
    documentXml: decodeXml(parts.get(documentEntryName)!),
  };
}

/**
 * Comments, CDATA sections, and processing instructions are the only constructs
 * that could hide something that looks like an element boundary. Word does not
 * emit them in `document.xml`, so refusing them costs nothing and removes the
 * whole class of ambiguity this editor would otherwise have to reason about.
 */
function assertUnambiguousMarkup(xml: string): void {
  if (xml.includes("<!--") || xml.includes("<![CDATA[")) {
    fail("unsafe_archive");
  }
  // The XML declaration is the one permitted processing instruction.
  const withoutDeclaration = xml.replace(/^\s*<\?xml[^>]*\?>/u, "");
  if (withoutDeclaration.includes("<?")) fail("unsafe_archive");
}

interface ParagraphSpan {
  index: number;
  start: number;
  end: number;
  text: string;
  uniformFormatting: boolean;
  containsNestedParagraph: boolean;
}

const paragraphOpenPattern = /<w:p(?=[\s/>])/gu;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/gu, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

/** Offsets of every `<w:t>` element's inner text within the supplied fragment. */
function textSpans(fragment: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const pattern = /<w:t(?:\s[^>]*)?>/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(fragment)) !== null) {
    const innerStart = match.index + match[0].length;
    const closing = fragment.indexOf("</w:t>", innerStart);
    if (closing === -1) fail("unsafe_archive");
    spans.push({ start: innerStart, end: closing });
    pattern.lastIndex = closing;
  }

  return spans;
}

/** Inline formatting of each run that actually carries text. */
function runFormatting(fragment: string): string[] {
  const formats: string[] = [];
  const pattern = /<w:r(?:\s[^>]*)?>/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(fragment)) !== null) {
    const start = match.index + match[0].length;
    const closing = fragment.indexOf("</w:r>", start);
    if (closing === -1) continue;
    const body = fragment.slice(start, closing);
    if (!body.includes("<w:t")) continue;
    formats.push(/<w:rPr>[\s\S]*?<\/w:rPr>/u.exec(body)?.[0] ?? "");
    pattern.lastIndex = closing;
  }

  return formats;
}

function findParagraphSpans(xml: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  paragraphOpenPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  let searchFrom = 0;

  while ((match = paragraphOpenPattern.exec(xml)) !== null) {
    if (match.index < searchFrom) continue;

    const openEnd = xml.indexOf(">", match.index);
    if (openEnd === -1) fail("unsafe_archive");

    // `<w:p/>` — an empty paragraph with no runs to write into.
    if (xml[openEnd - 1] === "/") {
      spans.push({
        index,
        start: match.index,
        end: openEnd + 1,
        text: "",
        uniformFormatting: true,
        containsNestedParagraph: false,
      });
      index += 1;
      searchFrom = openEnd + 1;
      continue;
    }

    // Paragraphs nest only inside text boxes; a depth counter keeps the outer
    // element's true end rather than the first inner close tag.
    let depth = 1;
    let cursor = openEnd + 1;
    let nested = false;
    while (depth > 0) {
      const nextOpen = xml.slice(cursor).search(/<w:p(?=[\s>])/u);
      const nextClose = xml.indexOf("</w:p>", cursor);
      if (nextClose === -1) fail("unsafe_archive");

      if (nextOpen !== -1 && cursor + nextOpen < nextClose) {
        depth += 1;
        nested = true;
        cursor = cursor + nextOpen + 4;
        continue;
      }
      depth -= 1;
      cursor = nextClose + "</w:p>".length;
    }

    const fragment = xml.slice(match.index, cursor);
    const formats = runFormatting(fragment);
    spans.push({
      index,
      start: match.index,
      end: cursor,
      text: decodeEntities(
        textSpans(fragment)
          .map((span) => fragment.slice(span.start, span.end))
          .join(""),
      ),
      uniformFormatting: formats.every((format) => format === formats[0]),
      containsNestedParagraph: nested,
    });
    index += 1;
    searchFrom = cursor;
  }

  return spans;
}

export function readDocxParagraphs(bytes: Uint8Array): DocxParagraph[] {
  const { documentXml } = loadArchive(bytes);
  assertUnambiguousMarkup(documentXml);

  return findParagraphSpans(documentXml).map((span) => ({
    index: span.index,
    text: span.text,
    uniformFormatting: span.uniformFormatting,
  }));
}

function replaceParagraphText(fragment: string, text: string): string {
  const spans = textSpans(fragment);
  if (spans.length === 0) fail("invalid_file");

  let result = "";
  let cursor = 0;
  spans.forEach((span, position) => {
    result += fragment.slice(cursor, span.start);
    if (position === 0) result += escapeXmlText(text);
    cursor = span.end;
  });
  result += fragment.slice(cursor);

  // Word trims leading and trailing whitespace unless the run says otherwise.
  return result.replace(
    /<w:t(\s[^>]*)?>/u,
    (open, attributes: string | undefined) =>
      open.includes("xml:space")
        ? open
        : `<w:t${attributes ?? ""} xml:space="preserve">`,
  );
}

/**
 * Writes a new archive. The source bytes are never modified, so no failure in
 * this path — or in anything that produced its operations — can damage the
 * user's original document.
 */
export function writeTailoredDocx(
  bytes: Uint8Array,
  operations: readonly TailoringOperation[],
): Uint8Array {
  const archive = loadArchive(bytes);
  assertUnambiguousMarkup(archive.documentXml);

  const spans = findParagraphSpans(archive.documentXml);
  const byIndex = new Map(spans.map((span) => [span.index, span]));
  const applied = new Set<number>();

  const edits = operations.map((operation) => {
    const span = byIndex.get(operation.paragraphIndex);
    if (span === undefined) fail("invalid_file");
    if (applied.has(operation.paragraphIndex)) fail("invalid_file");
    applied.add(operation.paragraphIndex);

    if (operation.kind === "omit") {
      return { start: span.start, end: span.end, replacement: "" };
    }

    // A paragraph containing a text box owns markup this editor will not
    // rewrite blind; refuse rather than flatten it.
    if (span.containsNestedParagraph) fail("invalid_file");

    return {
      start: span.start,
      end: span.end,
      replacement: replaceParagraphText(
        archive.documentXml.slice(span.start, span.end),
        operation.text,
      ),
    };
  });

  // Apply from the end so earlier offsets stay valid, which also means every
  // operation addresses the paragraph indexes the caller reviewed.
  let documentXml = archive.documentXml;
  for (const edit of edits.toSorted(
    (left, right) => right.start - left.start,
  )) {
    documentXml =
      documentXml.slice(0, edit.start) +
      edit.replacement +
      documentXml.slice(edit.end);
  }

  const parts: Record<string, Uint8Array> = {};
  for (const [name, content] of archive.parts) {
    parts[name] =
      name === archive.documentEntryName ? strToU8(documentXml) : content;
  }

  return zipSync(parts);
}
