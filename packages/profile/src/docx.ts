import { Inflate } from "fflate";
import { SaxesParser, type SaxesTagNS } from "saxes";

import {
  consumeCvInflatedBytes,
  CvFileValidationError,
  cvFileLimits,
  ensureCvExtractionWithinDeadline,
  type CvFileErrorCode,
} from "./file-gate.ts";

export interface ExtractedCvText {
  kind: "docx" | "pdf";
  text: string;
  truncated: boolean;
  pageCount?: number;
}

export interface ArchiveEntry {
  compressedSize: number;
  crc32: number;
  dataOffset: number;
  localOffset: number;
  method: number;
  name: string;
  normalizedName: string;
  originalSize: number;
}

interface XmlHandlers {
  onCloseTag?: (tag: SaxesTagNS) => void;
  onOpenTag?: (tag: SaxesTagNS) => void;
  onText?: (text: string) => void;
}

interface XmlCompatibilityFrame {
  ignorableNamespaces: ReadonlySet<string>;
  suppressed: boolean;
}

interface StyleDefinition {
  basedOn?: string;
  defaultCharacter: boolean;
  defaultParagraph: boolean;
  hidden: boolean;
}

interface HiddenStyleConfiguration {
  defaultCharacterHidden: boolean;
  defaultParagraphHidden: boolean;
  documentDefaultRunHidden: boolean;
  hiddenStyleIds: ReadonlySet<string>;
}

const requiredDocxParts = [
  "[content_types].xml",
  "_rels/.rels",
  "word/document.xml",
] as const;

const wordprocessingNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const markupCompatibilityNamespace =
  "http://schemas.openxmlformats.org/markup-compatibility/2006";
const relationshipsNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const contentTypesNamespace =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const mainDocumentContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const executablePartPattern =
  /(?:^|\/)(?:vbaProject\.bin|activeX(?:\/|$)|embeddings(?:\/|$)|oleObject\d*\.bin$)|\.(?:app|bat|cmd|com|dll|exe|jar|js|msi|ps1|scr|sh)$/iu;
const unsafeArchiveNamePattern = /[\u0000-\u001f\u007f\\]/u;
const zipChunkBytes = 1_024;
const xmlChunkCharacters = 16_384;
const xmlPrefixPattern = /^[A-Za-z_][A-Za-z0-9._-]*$/u;

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[index] = value >>> 0;
}

function fail(code: CvFileErrorCode): never {
  throw new CvFileValidationError(code);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset + 2 > bytes.length
  ) {
    fail("unsafe_archive");
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset + 4 > bytes.length
  ) {
    fail("unsafe_archive");
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function byteRangesEqual(
  bytes: Uint8Array,
  firstOffset: number,
  secondOffset: number,
  length: number,
): boolean {
  if (
    firstOffset < 0 ||
    secondOffset < 0 ||
    length < 0 ||
    firstOffset + length > bytes.length ||
    secondOffset + length > bytes.length
  ) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (bytes[firstOffset + index] !== bytes[secondOffset + index])
      return false;
  }
  return true;
}

function decodeZipName(bytes: Uint8Array, utf8: boolean): string {
  try {
    if (!utf8 && bytes.some((byte) => byte > 0x7f)) fail("unsafe_archive");
    return new TextDecoder(utf8 ? "utf-8" : "ascii", { fatal: true }).decode(
      bytes,
    );
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    fail("unsafe_archive");
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

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const earliest = Math.max(0, bytes.length - 22 - 65_535);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (readUint32(bytes, offset) !== 0x06054b50) continue;
    const commentLength = readUint16(bytes, offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  fail("unsafe_archive");
}

export function inspectArchive(
  bytes: Uint8Array,
  startedAt: number,
): ArchiveEntry[] {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length === 0 ||
    bytes.length > cvFileLimits.inputBytes ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    fail("unsafe_archive");
  }

  const endOffset = findEndOfCentralDirectory(bytes);
  if (
    readUint16(bytes, endOffset + 4) !== 0 ||
    readUint16(bytes, endOffset + 6) !== 0
  ) {
    fail("unsafe_archive");
  }
  const entriesOnDisk = readUint16(bytes, endOffset + 8);
  const entryCount = readUint16(bytes, endOffset + 10);
  if (
    entryCount === 0 ||
    entriesOnDisk !== entryCount ||
    entryCount > cvFileLimits.archiveEntries
  ) {
    fail("unsafe_archive");
  }

  const centralSize = readUint32(bytes, endOffset + 12);
  const centralStart = readUint32(bytes, endOffset + 16);
  if (
    centralSize === 0xffffffff ||
    centralStart === 0xffffffff ||
    centralStart + centralSize !== endOffset ||
    centralStart < 4
  ) {
    fail("unsafe_archive");
  }

  const entries: ArchiveEntry[] = [];
  const seenNames = new Set<string>();
  let centralOffset = centralStart;
  let declaredBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    ensureCvExtractionWithinDeadline(startedAt);
    if (readUint32(bytes, centralOffset) !== 0x02014b50) {
      fail("unsafe_archive");
    }

    const versionNeeded = readUint16(bytes, centralOffset + 6);
    const flags = readUint16(bytes, centralOffset + 8);
    const method = readUint16(bytes, centralOffset + 10);
    const modifiedTime = readUint16(bytes, centralOffset + 12);
    const modifiedDate = readUint16(bytes, centralOffset + 14);
    const crc32 = readUint32(bytes, centralOffset + 16);
    const compressedSize = readUint32(bytes, centralOffset + 20);
    const originalSize = readUint32(bytes, centralOffset + 24);
    const nameLength = readUint16(bytes, centralOffset + 28);
    const extraLength = readUint16(bytes, centralOffset + 30);
    const commentLength = readUint16(bytes, centralOffset + 32);
    const diskStart = readUint16(bytes, centralOffset + 34);
    const localOffset = readUint32(bytes, centralOffset + 42);
    const nextCentralOffset =
      centralOffset + 46 + nameLength + extraLength + commentLength;

    if (
      nextCentralOffset > centralStart + centralSize ||
      nameLength === 0 ||
      diskStart !== 0 ||
      localOffset === 0xffffffff ||
      compressedSize === 0xffffffff ||
      originalSize === 0xffffffff ||
      (flags & 0x2049) !== 0 ||
      (method !== 0 && method !== 8) ||
      (method === 0 && compressedSize !== originalSize)
    ) {
      fail("unsafe_archive");
    }

    const centralNameOffset = centralOffset + 46;
    const name = decodeZipName(
      bytes.subarray(centralNameOffset, centralNameOffset + nameLength),
      (flags & 0x0800) !== 0,
    );
    const normalizedName = normaliseArchiveName(name);
    if (
      seenNames.has(normalizedName) ||
      executablePartPattern.test(normalizedName)
    ) {
      fail("unsafe_archive");
    }
    seenNames.add(normalizedName);

    if (readUint32(bytes, localOffset) !== 0x04034b50) {
      fail("unsafe_archive");
    }
    const localVersionNeeded = readUint16(bytes, localOffset + 4);
    const localFlags = readUint16(bytes, localOffset + 6);
    const localMethod = readUint16(bytes, localOffset + 8);
    const localModifiedTime = readUint16(bytes, localOffset + 10);
    const localModifiedDate = readUint16(bytes, localOffset + 12);
    const localCrc32 = readUint32(bytes, localOffset + 14);
    const localCompressedSize = readUint32(bytes, localOffset + 18);
    const localOriginalSize = readUint32(bytes, localOffset + 22);
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    const localNameOffset = localOffset + 30;
    const dataOffset = localNameOffset + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;

    if (
      versionNeeded !== localVersionNeeded ||
      flags !== localFlags ||
      method !== localMethod ||
      modifiedTime !== localModifiedTime ||
      modifiedDate !== localModifiedDate ||
      crc32 !== localCrc32 ||
      compressedSize !== localCompressedSize ||
      originalSize !== localOriginalSize ||
      nameLength !== localNameLength ||
      !byteRangesEqual(bytes, centralNameOffset, localNameOffset, nameLength) ||
      dataOffset < localOffset ||
      dataEnd < dataOffset ||
      dataEnd > centralStart
    ) {
      fail("unsafe_archive");
    }

    declaredBytes += originalSize;
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > cvFileLimits.uncompressedBytes
    ) {
      fail("unsafe_archive");
    }

    entries.push({
      compressedSize,
      crc32,
      dataOffset,
      localOffset,
      method,
      name,
      normalizedName,
      originalSize,
    });
    centralOffset = nextCentralOffset;
  }

  if (centralOffset !== centralStart + centralSize) fail("unsafe_archive");
  const ranges = [...entries].sort(
    (first, second) => first.localOffset - second.localOffset,
  );
  let previousEnd = 0;
  for (const entry of ranges) {
    if (entry.localOffset < previousEnd) fail("unsafe_archive");
    previousEnd = entry.dataOffset + entry.compressedSize;
  }

  const archiveNames = new Set(entries.map((entry) => entry.normalizedName));
  if (requiredDocxParts.some((name) => !archiveNames.has(name))) {
    fail("unsafe_archive");
  }
  return entries;
}

function updateCrc32(current: number, bytes: Uint8Array): number {
  let crc = current;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return crc >>> 0;
}

export function extractArchiveEntry(
  archive: Uint8Array,
  entry: ArchiveEntry,
  startedAt: number,
  actualBytes: { value: number },
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let entryBytes = 0;
  let crc32 = 0xffffffff;

  const accept = (chunk: Uint8Array): void => {
    ensureCvExtractionWithinDeadline(startedAt);
    entryBytes += chunk.length;
    if (!Number.isSafeInteger(entryBytes) || entryBytes > entry.originalSize) {
      fail("unsafe_archive");
    }
    actualBytes.value = consumeCvInflatedBytes(actualBytes.value, chunk.length);
    crc32 = updateCrc32(crc32, chunk);
    chunks.push(chunk.slice());
  };

  const compressed = archive.subarray(
    entry.dataOffset,
    entry.dataOffset + entry.compressedSize,
  );
  if (entry.method === 0) {
    for (let offset = 0; offset < compressed.length; offset += zipChunkBytes) {
      accept(compressed.subarray(offset, offset + zipChunkBytes));
    }
  } else {
    let reachedFinalChunk = false;
    const inflater = new Inflate((chunk, final) => {
      accept(chunk);
      if (final) reachedFinalChunk = true;
    });
    if (compressed.length === 0) {
      inflater.push(new Uint8Array(), true);
    } else {
      for (
        let offset = 0;
        offset < compressed.length;
        offset += zipChunkBytes
      ) {
        ensureCvExtractionWithinDeadline(startedAt);
        const end = Math.min(offset + zipChunkBytes, compressed.length);
        inflater.push(
          compressed.subarray(offset, end),
          end === compressed.length,
        );
      }
    }
    if (!reachedFinalChunk) fail("unsafe_archive");
  }

  if (
    entryBytes !== entry.originalSize ||
    (crc32 ^ 0xffffffff) >>> 0 !== entry.crc32
  ) {
    fail("unsafe_archive");
  }
  const output = new Uint8Array(entryBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  if (bytes.length % 2 !== 0) fail("unsafe_archive");
  return new TextDecoder(littleEndian ? "utf-16le" : "utf-16be", {
    fatal: true,
  }).decode(bytes);
}

export function decodeXml(bytes: Uint8Array): string {
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

function parsePassiveXml(
  xml: string,
  startedAt: number,
  handlers: XmlHandlers,
): void {
  const parser = new SaxesParser({ xmlns: true, position: false });
  const compatibilityFrames: XmlCompatibilityFrame[] = [];
  let malformed = false;
  parser.on("error", () => {
    malformed = true;
  });
  parser.on("comment", () => fail("unsafe_archive"));
  parser.on("doctype", () => fail("unsafe_archive"));
  parser.on("cdata", () => fail("unsafe_archive"));
  parser.on("processinginstruction", () => fail("unsafe_archive"));
  parser.on("opentag", (tag) => {
    ensureCvExtractionWithinDeadline(startedAt);
    if (tag.uri === markupCompatibilityNamespace) {
      fail("unsafe_archive");
    }
    if (
      (tag.prefix === "w" && tag.uri !== wordprocessingNamespace) ||
      (tag.ns.w !== undefined && tag.ns.w !== wordprocessingNamespace) ||
      Object.values(tag.attributes).some(
        (attribute) =>
          attribute.prefix === "w" && attribute.uri !== wordprocessingNamespace,
      )
    ) {
      fail("unsafe_archive");
    }

    const parentFrame = compatibilityFrames.at(-1);
    const ignorableNamespaces = new Set(parentFrame?.ignorableNamespaces ?? []);
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri !== markupCompatibilityNamespace) continue;
      if (attribute.local !== "Ignorable") fail("unsafe_archive");

      const prefixes = attribute.value.trim().split(/\s+/u);
      if (prefixes.length === 0 || prefixes[0] === "") {
        fail("unsafe_archive");
      }
      for (const prefix of prefixes) {
        if (!xmlPrefixPattern.test(prefix)) fail("unsafe_archive");
        const namespace = tag.ns[prefix];
        if (
          namespace === undefined ||
          namespace === "" ||
          namespace === wordprocessingNamespace ||
          namespace === markupCompatibilityNamespace
        ) {
          fail("unsafe_archive");
        }
        ignorableNamespaces.add(namespace);
      }
    }

    const frame: XmlCompatibilityFrame = {
      ignorableNamespaces,
      suppressed:
        (parentFrame?.suppressed ?? false) || ignorableNamespaces.has(tag.uri),
    };
    compatibilityFrames.push(frame);
    if (!frame.suppressed) handlers.onOpenTag?.(tag);
  });
  parser.on("closetag", (tag) => {
    ensureCvExtractionWithinDeadline(startedAt);
    const frame = compatibilityFrames.pop();
    if (!frame) fail("unsafe_archive");
    if (!frame.suppressed) handlers.onCloseTag?.(tag);
  });
  parser.on("text", (text) => {
    ensureCvExtractionWithinDeadline(startedAt);
    if (!compatibilityFrames.at(-1)?.suppressed) handlers.onText?.(text);
  });

  try {
    for (let offset = 0; offset < xml.length; offset += xmlChunkCharacters) {
      ensureCvExtractionWithinDeadline(startedAt);
      parser.write(xml.slice(offset, offset + xmlChunkCharacters));
    }
    parser.close();
    if (malformed || compatibilityFrames.length > 0) fail("unsafe_archive");
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    fail("unsafe_archive");
  }
}

function unqualifiedAttribute(
  tag: SaxesTagNS,
  name: string,
): string | undefined {
  return Object.values(tag.attributes).find(
    (attribute) => attribute.uri === "" && attribute.local === name,
  )?.value;
}

function wordAttribute(tag: SaxesTagNS, name: string): string | undefined {
  return Object.values(tag.attributes).find(
    (attribute) =>
      attribute.uri === wordprocessingNamespace && attribute.local === name,
  )?.value;
}

function isWordTag(tag: SaxesTagNS, local: string): boolean {
  return tag.uri === wordprocessingNamespace && tag.local === local;
}

function validateRelationships(
  relationshipParts: ReadonlyMap<string, Uint8Array>,
  startedAt: number,
): void {
  let hasMainDocumentRelationship = false;

  for (const [name, bytes] of relationshipParts) {
    let depth = 0;
    let sawRoot = false;
    parsePassiveXml(decodeXml(bytes), startedAt, {
      onCloseTag() {
        depth -= 1;
      },
      onOpenTag(tag) {
        depth += 1;
        if (depth === 1) {
          if (
            sawRoot ||
            tag.uri !== relationshipsNamespace ||
            tag.local !== "Relationships"
          ) {
            fail("unsafe_archive");
          }
          sawRoot = true;
          return;
        }
        if (
          depth !== 2 ||
          tag.uri !== relationshipsNamespace ||
          tag.local !== "Relationship"
        ) {
          return;
        }

        const target = unqualifiedAttribute(tag, "Target");
        const type = unqualifiedAttribute(tag, "Type");
        const targetMode = unqualifiedAttribute(
          tag,
          "TargetMode",
        )?.toLowerCase();
        if (!target || !type) fail("unsafe_archive");

        // A relationship pointing outside the package is a hyperlink: a
        // `mailto:` for the writer's own address, an `https:` link to their
        // profile. **Refusing the document for one refused every CV that
        // contains a link**, which is very nearly every real CV — the first
        // real file put through this parser had three, and was rejected as an
        // unsafe archive.
        //
        // Skipping it loses nothing, because this parser never dereferences a
        // relationship. Parts are selected from the archive index by fixed
        // name — `[content_types].xml`, `_rels/.rels`, `word/document.xml`,
        // `word/styles.xml` — so no target is ever resolved, fetched, or
        // opened. The URL is not extracted either; only the visible link text
        // inside `w:t` becomes evidence.
        const isExternal =
          targetMode === "external" ||
          target.startsWith("//") ||
          /^[a-z][a-z0-9+.-]*:/iu.test(target);

        if (isExternal) {
          // The one relationship that must never point outward. It is what
          // names the main document, and an external one would be an attempt
          // to aim the parser somewhere other than this package.
          if (name === "_rels/.rels" && type.endsWith("/officeDocument")) {
            fail("unsafe_archive");
          }
          return;
        }

        // Internal targets keep every check they had: `normaliseArchiveName`
        // still refuses traversal, absolute paths, and drive-letter colons.
        normaliseArchiveName(target.replace(/^\.\//u, ""));

        if (name === "_rels/.rels" && type.endsWith("/officeDocument")) {
          if (
            hasMainDocumentRelationship ||
            target.replace(/^\.\//u, "").toLowerCase() !== "word/document.xml"
          ) {
            fail("unsafe_archive");
          }
          hasMainDocumentRelationship = true;
        }
      },
    });
    if (!sawRoot || depth !== 0) fail("unsafe_archive");
  }

  if (!hasMainDocumentRelationship) fail("unsafe_archive");
}

function validateContentTypes(bytes: Uint8Array, startedAt: number): void {
  let depth = 0;
  let sawRoot = false;
  let hasMainDocumentType = false;
  parsePassiveXml(decodeXml(bytes), startedAt, {
    onCloseTag() {
      depth -= 1;
    },
    onOpenTag(tag) {
      depth += 1;
      if (depth === 1) {
        if (
          sawRoot ||
          tag.uri !== contentTypesNamespace ||
          tag.local !== "Types"
        ) {
          fail("unsafe_archive");
        }
        sawRoot = true;
        return;
      }
      if (depth !== 2 || tag.uri !== contentTypesNamespace) return;
      const contentType = unqualifiedAttribute(tag, "ContentType");
      if (
        contentType &&
        /macroEnabled|vbaProject|activeX|oleObject/iu.test(contentType)
      ) {
        fail("unsafe_archive");
      }
      if (
        tag.local === "Override" &&
        unqualifiedAttribute(tag, "PartName")?.toLowerCase() ===
          "/word/document.xml" &&
        contentType === mainDocumentContentType
      ) {
        hasMainDocumentType = true;
      }
    },
  });
  if (!sawRoot || depth !== 0 || !hasMainDocumentType) fail("unsafe_archive");
}

function isEnabledOnOffProperty(tag: SaxesTagNS): boolean {
  const value = wordAttribute(tag, "val")?.trim().toLowerCase();
  return value === undefined || !["0", "false", "no", "off"].includes(value);
}

function parseHiddenStyles(
  bytes: Uint8Array | undefined,
  startedAt: number,
): HiddenStyleConfiguration {
  if (!bytes) {
    return {
      defaultCharacterHidden: false,
      defaultParagraphHidden: false,
      documentDefaultRunHidden: false,
      hiddenStyleIds: new Set(),
    };
  }
  const definitions = new Map<string, StyleDefinition>();
  let depth = 0;
  let sawRoot = false;
  let documentDefaultsDepth: number | undefined;
  let documentDefaultRunHidden = false;
  let runPropertyDefaultDepth: number | undefined;
  let current:
    { definition: StyleDefinition; depth: number; styleId: string } | undefined;

  parsePassiveXml(decodeXml(bytes), startedAt, {
    onCloseTag(tag) {
      if (current && depth === current.depth && isWordTag(tag, "style")) {
        definitions.set(current.styleId, current.definition);
        current = undefined;
      }
      if (runPropertyDefaultDepth === depth && isWordTag(tag, "rPrDefault")) {
        runPropertyDefaultDepth = undefined;
      }
      if (documentDefaultsDepth === depth && isWordTag(tag, "docDefaults")) {
        documentDefaultsDepth = undefined;
      }
      depth -= 1;
    },
    onOpenTag(tag) {
      depth += 1;
      if (depth === 1) {
        if (!isWordTag(tag, "styles") || sawRoot) fail("unsafe_archive");
        sawRoot = true;
        return;
      }
      if (depth === 2 && isWordTag(tag, "docDefaults")) {
        if (documentDefaultsDepth !== undefined) fail("unsafe_archive");
        documentDefaultsDepth = depth;
        return;
      }
      if (
        documentDefaultsDepth !== undefined &&
        depth === documentDefaultsDepth + 1 &&
        isWordTag(tag, "rPrDefault")
      ) {
        if (runPropertyDefaultDepth !== undefined) fail("unsafe_archive");
        runPropertyDefaultDepth = depth;
        return;
      }
      if (depth === 2 && isWordTag(tag, "style")) {
        const styleId = wordAttribute(tag, "styleId")?.trim();
        if (!styleId || definitions.has(styleId) || current) {
          fail("unsafe_archive");
        }
        const defaultValue = wordAttribute(tag, "default")
          ?.trim()
          .toLowerCase();
        const isDefault =
          defaultValue !== undefined &&
          !["0", "false", "no", "off"].includes(defaultValue);
        const styleType = wordAttribute(tag, "type")?.trim().toLowerCase();
        current = {
          definition: {
            defaultCharacter: styleType === "character" && isDefault,
            defaultParagraph: styleType === "paragraph" && isDefault,
            hidden: false,
          },
          depth,
          styleId,
        };
        return;
      }
      if (
        runPropertyDefaultDepth !== undefined &&
        depth > runPropertyDefaultDepth &&
        (isWordTag(tag, "vanish") || isWordTag(tag, "webHidden")) &&
        isEnabledOnOffProperty(tag)
      ) {
        documentDefaultRunHidden = true;
      }
      if (!current) return;
      if (isWordTag(tag, "basedOn")) {
        current.definition.basedOn = wordAttribute(tag, "val")?.trim();
      }
      if (
        (isWordTag(tag, "vanish") || isWordTag(tag, "webHidden")) &&
        isEnabledOnOffProperty(tag)
      ) {
        current.definition.hidden = true;
      }
    },
  });
  if (
    !sawRoot ||
    depth !== 0 ||
    documentDefaultsDepth !== undefined ||
    runPropertyDefaultDepth !== undefined ||
    current
  ) {
    fail("unsafe_archive");
  }

  const hidden = new Set<string>();
  const visiting = new Set<string>();
  const resolveHidden = (styleId: string): boolean => {
    if (hidden.has(styleId)) return true;
    const definition = definitions.get(styleId);
    if (!definition) return false;
    if (visiting.has(styleId)) fail("unsafe_archive");
    visiting.add(styleId);
    const result =
      definition.hidden ||
      (definition.basedOn !== undefined && resolveHidden(definition.basedOn));
    visiting.delete(styleId);
    if (result) hidden.add(styleId);
    return result;
  };
  for (const styleId of definitions.keys()) resolveHidden(styleId);
  const defaultCharacterStyles = [...definitions].filter(
    ([, definition]) => definition.defaultCharacter,
  );
  const defaultParagraphStyles = [...definitions].filter(
    ([, definition]) => definition.defaultParagraph,
  );
  if (defaultCharacterStyles.length > 1 || defaultParagraphStyles.length > 1) {
    fail("unsafe_archive");
  }
  return {
    defaultCharacterHidden:
      defaultCharacterStyles.length === 1 &&
      resolveHidden(defaultCharacterStyles[0]![0]),
    defaultParagraphHidden:
      defaultParagraphStyles.length === 1 &&
      resolveHidden(defaultParagraphStyles[0]![0]),
    documentDefaultRunHidden,
    hiddenStyleIds: hidden,
  };
}

function extractTextFromDocumentXml(
  xml: string,
  hiddenStyles: HiddenStyleConfiguration,
  startedAt: number,
): { text: string; truncated: boolean } {
  const paragraphs: string[] = [];
  const fieldPhases: Array<"instruction" | "result"> = [];
  let depth = 0;
  let documentDepth: number | undefined;
  let bodyDepth: number | undefined;
  let bodySeen = false;
  let bodyClosed = false;
  let suppressedDepth = 0;
  let paragraph:
    | { depth: number; hidden: boolean; pieces: string[]; styleId?: string }
    | undefined;
  let run:
    | { depth: number; hidden: boolean; pieces: string[]; styleId?: string }
    | undefined;
  let textCapture: { depth: number; value: string } | undefined;
  let extractedCharacters = 0;
  let truncated = false;

  const appendParagraph = (): void => {
    if (!paragraph) return;
    const hiddenByStyle = paragraph.styleId
      ? hiddenStyles.hiddenStyleIds.has(paragraph.styleId)
      : hiddenStyles.defaultParagraphHidden;
    if (paragraph.hidden || hiddenByStyle) {
      return;
    }
    const value = paragraph.pieces
      .join("")
      .replace(/[ \t]+\n/gu, "\n")
      .trim();
    if (value.length === 0 || truncated) return;
    const separatorLength = paragraphs.length === 0 ? 0 : 1;
    const remaining =
      cvFileLimits.extractedCharacters - extractedCharacters - separatorLength;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const accepted = value.slice(0, remaining);
    paragraphs.push(accepted);
    extractedCharacters += separatorLength + accepted.length;
    if (accepted.length < value.length) truncated = true;
  };

  parsePassiveXml(xml, startedAt, {
    onCloseTag(tag) {
      if (textCapture && depth === textCapture.depth && isWordTag(tag, "t")) {
        run?.pieces.push(textCapture.value);
        textCapture = undefined;
      }
      if (run && depth === run.depth && isWordTag(tag, "r")) {
        const hiddenByStyle = run.styleId
          ? hiddenStyles.hiddenStyleIds.has(run.styleId)
          : hiddenStyles.defaultCharacterHidden;
        if (
          !run.hidden &&
          !hiddenByStyle &&
          !hiddenStyles.documentDefaultRunHidden
        ) {
          paragraph?.pieces.push(...run.pieces);
        }
        run = undefined;
      }
      if (paragraph && depth === paragraph.depth && isWordTag(tag, "p")) {
        appendParagraph();
        paragraph = undefined;
      }
      if (
        isWordTag(tag, "del") ||
        isWordTag(tag, "moveFrom") ||
        isWordTag(tag, "instrText") ||
        isWordTag(tag, "delInstrText") ||
        isWordTag(tag, "fldSimple")
      ) {
        suppressedDepth -= 1;
      }
      if (bodyDepth === depth && isWordTag(tag, "body")) {
        bodyDepth = undefined;
        bodyClosed = true;
      }
      if (documentDepth === depth && isWordTag(tag, "document")) {
        documentDepth = undefined;
      }
      depth -= 1;
    },
    onOpenTag(tag) {
      depth += 1;
      if (depth === 1) {
        if (!isWordTag(tag, "document") || documentDepth !== undefined) {
          fail("unsafe_archive");
        }
        documentDepth = depth;
        return;
      }

      if (isWordTag(tag, "body")) {
        if (depth !== 2 || documentDepth !== 1 || bodySeen || bodyClosed) {
          fail("unsafe_archive");
        }
        bodySeen = true;
        bodyDepth = depth;
        return;
      }

      const insideBody = bodyDepth !== undefined && depth > bodyDepth;
      if (
        isWordTag(tag, "del") ||
        isWordTag(tag, "moveFrom") ||
        isWordTag(tag, "instrText") ||
        isWordTag(tag, "delInstrText") ||
        isWordTag(tag, "fldSimple")
      ) {
        suppressedDepth += 1;
      }

      if (insideBody && isWordTag(tag, "fldChar")) {
        const fieldType = wordAttribute(tag, "fldCharType")
          ?.trim()
          .toLowerCase();
        if (fieldType === "begin") fieldPhases.push("instruction");
        else if (fieldType === "separate") {
          if (fieldPhases.length === 0) fail("unsafe_archive");
          fieldPhases[fieldPhases.length - 1] = "result";
        } else if (fieldType === "end") {
          if (fieldPhases.length === 0) fail("unsafe_archive");
          fieldPhases.pop();
        } else {
          fail("unsafe_archive");
        }
      }

      if (insideBody && suppressedDepth === 0 && isWordTag(tag, "p")) {
        if (paragraph) fail("unsafe_archive");
        paragraph = { depth, hidden: false, pieces: [] };
        return;
      }
      if (paragraph && suppressedDepth === 0 && isWordTag(tag, "r")) {
        if (run) fail("unsafe_archive");
        run = { depth, hidden: false, pieces: [] };
        return;
      }
      if (!paragraph || suppressedDepth > 0) return;

      if (isWordTag(tag, "pStyle")) {
        paragraph.styleId = wordAttribute(tag, "val")?.trim();
      } else if (
        (isWordTag(tag, "vanish") || isWordTag(tag, "webHidden")) &&
        isEnabledOnOffProperty(tag)
      ) {
        if (run) run.hidden = true;
        else paragraph.hidden = true;
      }
      if (!run) return;
      if (isWordTag(tag, "rStyle")) {
        run.styleId = wordAttribute(tag, "val")?.trim();
      }
      if (
        suppressedDepth === 0 &&
        !fieldPhases.includes("instruction") &&
        isWordTag(tag, "t")
      ) {
        if (textCapture) fail("unsafe_archive");
        textCapture = { depth, value: "" };
      } else if (
        suppressedDepth === 0 &&
        !fieldPhases.includes("instruction") &&
        (isWordTag(tag, "tab") || isWordTag(tag, "br") || isWordTag(tag, "cr"))
      ) {
        run.pieces.push(isWordTag(tag, "tab") ? "\t" : "\n");
      }
    },
    onText(text) {
      if (textCapture) textCapture.value += text;
    },
  });

  if (
    depth !== 0 ||
    documentDepth !== undefined ||
    bodyDepth !== undefined ||
    !bodySeen ||
    !bodyClosed ||
    suppressedDepth !== 0 ||
    paragraph ||
    run ||
    textCapture ||
    fieldPhases.length !== 0
  ) {
    fail("unsafe_archive");
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
    const entries = inspectArchive(bytes, startedAt);
    const selectedEntries = entries.filter(
      (entry) =>
        requiredDocxParts.includes(
          entry.normalizedName as (typeof requiredDocxParts)[number],
        ) ||
        entry.normalizedName.endsWith(".rels") ||
        entry.normalizedName === "word/styles.xml",
    );
    const normalizedParts = new Map<string, Uint8Array>();
    const actualBytes = { value: 0 };
    for (const entry of selectedEntries) {
      normalizedParts.set(
        entry.normalizedName,
        extractArchiveEntry(bytes, entry, startedAt, actualBytes),
      );
    }

    const contentTypes = normalizedParts.get("[content_types].xml");
    const document = normalizedParts.get("word/document.xml");
    if (!contentTypes || !document) fail("unsafe_archive");
    validateContentTypes(contentTypes, startedAt);
    validateRelationships(
      new Map([...normalizedParts].filter(([name]) => name.endsWith(".rels"))),
      startedAt,
    );
    const hiddenStyles = parseHiddenStyles(
      normalizedParts.get("word/styles.xml"),
      startedAt,
    );
    const result = extractTextFromDocumentXml(
      decodeXml(document),
      hiddenStyles,
      startedAt,
    );
    ensureCvExtractionWithinDeadline(startedAt);
    return { kind: "docx", ...result };
  } catch (error) {
    if (error instanceof CvFileValidationError) throw error;
    fail("unsafe_archive");
  }
}
