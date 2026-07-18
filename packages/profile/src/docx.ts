import { unzipSync } from "fflate";

import {
  CvFileValidationError,
  cvFileLimits,
  type CvFileErrorCode,
} from "./file-gate.ts";

export interface ExtractedCvText {
  kind: "docx" | "pdf";
  text: string;
  truncated: boolean;
  pageCount?: number;
}

interface ArchiveEntry {
  name: string;
  normalizedName: string;
  originalSize: number;
}

const requiredDocxParts = [
  "[content_types].xml",
  "_rels/.rels",
  "word/document.xml",
] as const;

const executablePartPattern =
  /(?:^|\/)(?:vbaProject\.bin|activeX(?:\/|$)|embeddings(?:\/|$)|oleObject\d*\.bin$)|\.(?:app|bat|cmd|com|dll|exe|jar|js|msi|ps1|scr|sh)$/iu;
const xmlEntityPattern = /&(#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|quot);/giu;
const anyXmlEntityPattern = /&[^;\s]{1,40};/u;
const unsafeArchiveNamePattern = /[\u0000-\u001f\u007f\\]/u;

function fail(code: CvFileErrorCode): never {
  throw new CvFileValidationError(code);
}

function ensureWithinDeadline(startedAt: number): void {
  if (Date.now() - startedAt > cvFileLimits.timeoutMilliseconds) {
    fail("extraction_timeout");
  }
}

function normaliseArchiveName(name: string): string {
  if (
    name.length === 0 ||
    name.length > 1_024 ||
    name.startsWith("/") ||
    name.startsWith("\\") ||
    name.includes("//") ||
    unsafeArchiveNamePattern.test(name)
  ) {
    fail("unsafe_archive");
  }

  const isDirectory = name.endsWith("/");
  const path = isDirectory ? name.slice(0, -1) : name;
  const segments = path.split("/");
  if (
    path.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":"),
    )
  ) {
    fail("unsafe_archive");
  }

  return `${path.normalize("NFC").toLowerCase()}${isDirectory ? "/" : ""}`;
}

function inspectArchive(bytes: Uint8Array): ArchiveEntry[] {
  if (
    bytes.length === 0 ||
    bytes.length > cvFileLimits.inputBytes ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    fail("unsafe_archive");
  }

  const entries: ArchiveEntry[] = [];
  const seenNames = new Set<string>();
  let uncompressedBytes = 0;

  unzipSync(bytes, {
    filter(file) {
      if (file.compression !== 0 && file.compression !== 8) {
        fail("unsafe_archive");
      }

      const normalizedName = normaliseArchiveName(file.name);
      if (seenNames.has(normalizedName)) fail("unsafe_archive");
      seenNames.add(normalizedName);

      if (executablePartPattern.test(normalizedName)) {
        fail("unsafe_archive");
      }

      uncompressedBytes += file.originalSize;
      if (
        entries.length >= cvFileLimits.archiveEntries ||
        !Number.isSafeInteger(uncompressedBytes) ||
        uncompressedBytes > cvFileLimits.uncompressedBytes
      ) {
        fail("unsafe_archive");
      }

      entries.push({
        name: file.name,
        normalizedName,
        originalSize: file.originalSize,
      });
      return false;
    },
  });

  const archiveNames = new Set(entries.map((entry) => entry.normalizedName));
  if (requiredDocxParts.some((name) => !archiveNames.has(name))) {
    fail("unsafe_archive");
  }

  return entries;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  if (bytes.length % 2 !== 0) fail("unsafe_archive");
  return new TextDecoder(littleEndian ? "utf-16le" : "utf-16be", {
    fatal: true,
  }).decode(bytes);
}

function decodeXml(bytes: Uint8Array): string {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return decodeUtf16(bytes.subarray(2), true);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return decodeUtf16(bytes.subarray(2), false);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    fail("unsafe_archive");
  }
}

function decodeXmlText(value: string): string {
  const decoded = value.replace(xmlEntityPattern, (entity, token: string) => {
    const lowerToken = token.toLowerCase();
    if (lowerToken === "amp") return "&";
    if (lowerToken === "apos") return "'";
    if (lowerToken === "gt") return ">";
    if (lowerToken === "lt") return "<";
    if (lowerToken === "quot") return '"';

    const numericValue = lowerToken.startsWith("#x")
      ? Number.parseInt(lowerToken.slice(2), 16)
      : Number.parseInt(lowerToken.slice(1), 10);
    if (
      !Number.isInteger(numericValue) ||
      numericValue <= 0 ||
      numericValue > 0x10ffff ||
      (numericValue >= 0xd800 && numericValue <= 0xdfff)
    ) {
      fail("unsafe_archive");
    }
    return String.fromCodePoint(numericValue);
  });

  if (anyXmlEntityPattern.test(decoded)) fail("unsafe_archive");
  return decoded;
}

function ensurePassiveXml(xml: string): void {
  if (/<!DOCTYPE\b|<!ENTITY\b/iu.test(xml)) fail("unsafe_archive");
}

function attributesFromTag(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/gu;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.split(":").at(-1)?.toLowerCase();
    const value = match[3];
    if (!name || value === undefined) fail("unsafe_archive");
    attributes.set(name, decodeXmlText(value));
  }
  return attributes;
}

function validateRelationships(
  relationshipParts: ReadonlyMap<string, Uint8Array>,
): void {
  let hasMainDocumentRelationship = false;

  for (const [name, bytes] of relationshipParts) {
    const xml = decodeXml(bytes);
    ensurePassiveXml(xml);
    const relationshipTags = xml.match(
      /<(?:[A-Za-z_][\w.-]*:)?Relationship\b[^>]*\/?>/gu,
    );

    for (const tag of relationshipTags ?? []) {
      const attributes = attributesFromTag(tag);
      const target = attributes.get("target");
      const type = attributes.get("type");
      const targetMode = attributes.get("targetmode")?.toLowerCase();
      if (!target || !type) fail("unsafe_archive");

      if (
        targetMode === "external" ||
        target.startsWith("//") ||
        /^[a-z][a-z0-9+.-]*:/iu.test(target)
      ) {
        fail("unsafe_archive");
      }
      normaliseArchiveName(target.replace(/^\.\//u, ""));

      if (name === "_rels/.rels" && type.endsWith("/officeDocument")) {
        if (
          target.replace(/^\.\//u, "").toLowerCase() !== "word/document.xml"
        ) {
          fail("unsafe_archive");
        }
        hasMainDocumentRelationship = true;
      }
    }
  }

  if (!hasMainDocumentRelationship) fail("unsafe_archive");
}

function validateContentTypes(bytes: Uint8Array): void {
  const xml = decodeXml(bytes);
  ensurePassiveXml(xml);
  if (
    !xml.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    ) ||
    /macroEnabled|vbaProject|activeX|oleObject/iu.test(xml)
  ) {
    fail("unsafe_archive");
  }
}

function extractTextFromDocumentXml(xml: string): {
  text: string;
  truncated: boolean;
} {
  ensurePassiveXml(xml);
  const documentTag = xml.match(/<w:document\b[^>]*>/u)?.[0];
  if (
    !documentTag ||
    !/\bxmlns:w\s*=\s*(["'])http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main\1/u.test(
      documentTag,
    )
  ) {
    fail("unsafe_archive");
  }
  const withoutDeletedText = xml.replace(
    /<w:del\b[^>]*>[\s\S]*?<\/w:del\s*>/gu,
    "",
  );
  const paragraphs: string[] = [];
  let extractedCharacters = 0;
  let truncated = false;
  const paragraphPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p\s*>/gu;

  for (const paragraphMatch of withoutDeletedText.matchAll(paragraphPattern)) {
    const paragraphXml = paragraphMatch[1] ?? "";
    const paragraphProperties = paragraphXml.match(
      /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr\s*>/u,
    )?.[1];
    if (
      paragraphProperties &&
      /<w:(?:vanish|webHidden)\b/u.test(paragraphProperties)
    ) {
      continue;
    }

    const pieces: string[] = [];
    const runPattern = /<w:r\b[^>]*>([\s\S]*?)<\/w:r\s*>/gu;
    for (const runMatch of paragraphXml.matchAll(runPattern)) {
      const runXml = runMatch[1] ?? "";
      if (/<w:(?:vanish|webHidden)\b/u.test(runXml)) continue;

      const tokenPattern =
        /<w:t\b[^>]*>([\s\S]*?)<\/w:t\s*>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/gu;
      for (const token of runXml.matchAll(tokenPattern)) {
        const value =
          token[1] === undefined ? token[0] : decodeXmlText(token[1]);
        pieces.push(
          token[1] === undefined
            ? /<w:tab\b/u.test(token[0])
              ? "\t"
              : "\n"
            : value,
        );
      }
    }

    const paragraph = pieces
      .join("")
      .replace(/[ \t]+\n/gu, "\n")
      .trim();
    if (paragraph.length === 0) continue;

    const separatorLength = paragraphs.length === 0 ? 0 : 1;
    const remaining =
      cvFileLimits.extractedCharacters - extractedCharacters - separatorLength;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const accepted = paragraph.slice(0, remaining);
    paragraphs.push(accepted);
    extractedCharacters += separatorLength + accepted.length;
    if (accepted.length < paragraph.length) {
      truncated = true;
      break;
    }
  }

  const text = paragraphs.join("\n");
  if (text.length === 0) fail("invalid_file");
  return { text, truncated };
}

export async function extractDocxText(
  bytes: Uint8Array,
): Promise<ExtractedCvText> {
  const startedAt = Date.now();
  try {
    const entries = inspectArchive(bytes);
    ensureWithinDeadline(startedAt);

    const neededNames = new Set(
      entries
        .filter(
          (entry) =>
            requiredDocxParts.includes(
              entry.normalizedName as (typeof requiredDocxParts)[number],
            ) || entry.normalizedName.endsWith(".rels"),
        )
        .map((entry) => entry.name),
    );
    const extracted = unzipSync(bytes, {
      filter: (entry) => neededNames.has(entry.name),
    });
    const normalizedParts = new Map<string, Uint8Array>();
    for (const entry of entries) {
      const value = extracted[entry.name];
      if (value) normalizedParts.set(entry.normalizedName, value);
    }

    const contentTypes = normalizedParts.get("[content_types].xml");
    const document = normalizedParts.get("word/document.xml");
    if (!contentTypes || !document) fail("unsafe_archive");
    validateContentTypes(contentTypes);

    const relationships = new Map(
      [...normalizedParts].filter(([name]) => name.endsWith(".rels")),
    );
    validateRelationships(relationships);
    ensureWithinDeadline(startedAt);

    const result = extractTextFromDocumentXml(decodeXml(document));
    ensureWithinDeadline(startedAt);
    return { kind: "docx", ...result };
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    fail("unsafe_archive");
  }
}
