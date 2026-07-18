import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { cvFileLimits, validateCvFile } from "./file-gate.ts";
import { extractCvText } from "./index.ts";
import { extractDocxText } from "./docx.ts";

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const packageRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function documentXml(textRuns: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${textRuns}<w:sectPr/></w:body>
</w:document>`;
}

function createDocx(
  overrides: Record<string, Uint8Array | string> = {},
  level: 0 | 9 = 9,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(packageRelationships),
    "word/document.xml": strToU8(
      documentXml(
        "<w:p><w:r><w:t>Fictional analyst</w:t></w:r></w:p>" +
          "<w:p><w:r><w:t>Analytics implementation &amp; stakeholder management</w:t></w:r></w:p>",
      ),
    ),
  };

  for (const [name, value] of Object.entries(overrides)) {
    entries[name] = typeof value === "string" ? strToU8(value) : value;
  }

  return zipSync(entries, { level });
}

interface TestZipEntry {
  centralOffset: number;
  compressedSize: number;
  dataOffset: number;
  localOffset: number;
  name: string;
  originalSize: number;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error("test fixture has no end-of-central-directory record");
}

function inspectTestZip(bytes: Uint8Array): TestZipEntry[] {
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(bytes, endOffset + 10);
  let centralOffset = readUint32(bytes, endOffset + 16);
  const entries: TestZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, centralOffset) !== 0x02014b50) {
      throw new Error("test fixture has an invalid central-directory entry");
    }
    const nameLength = readUint16(bytes, centralOffset + 28);
    const extraLength = readUint16(bytes, centralOffset + 30);
    const commentLength = readUint16(bytes, centralOffset + 32);
    const localOffset = readUint32(bytes, centralOffset + 42);
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    const name = new TextDecoder().decode(
      bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength),
    );
    entries.push({
      centralOffset,
      compressedSize: readUint32(bytes, centralOffset + 20),
      dataOffset: localOffset + 30 + localNameLength + localExtraLength,
      localOffset,
      name,
      originalSize: readUint32(bytes, centralOffset + 24),
    });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function requireTestZipEntry(bytes: Uint8Array, name: string): TestZipEntry {
  const entry = inspectTestZip(bytes).find(
    (candidate) => candidate.name === name,
  );
  if (!entry) throw new Error(`test fixture is missing ${name}`);
  return entry;
}

function replaceAllAscii(
  source: Uint8Array,
  search: string,
  replacement: string,
): Uint8Array {
  if (search.length !== replacement.length) {
    throw new Error("test helper requires equal-length names");
  }

  const output = source.slice();
  const needle = strToU8(search);
  const replacementBytes = strToU8(replacement);
  let replacements = 0;

  for (let index = 0; index <= output.length - needle.length; index += 1) {
    if (needle.every((byte, offset) => output[index + offset] === byte)) {
      output.set(replacementBytes, index);
      replacements += 1;
      index += needle.length - 1;
    }
  }

  if (replacements < 2) {
    throw new Error("test helper did not patch local and central ZIP names");
  }
  return output;
}

describe("bounded DOCX extraction", () => {
  it("dispatches a validated DOCX through the package extraction interface", async () => {
    const result = await extractCvText(
      validateCvFile({
        fileName: "fictional-profile.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: createDocx(),
      }),
    );

    expect(result.kind).toBe("docx");
    expect(result.text).toContain("Fictional analyst");
  });

  it("extracts only visible WordprocessingML text with structural whitespace", async () => {
    const result = await extractDocxText(createDocx());

    expect(result).toEqual({
      kind: "docx",
      text: "Fictional analyst\nAnalytics implementation & stakeholder management",
      truncated: false,
    });
  });

  it("ignores text outside the WordprocessingML namespace", async () => {
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:foreign="urn:fictional:foreign">
  <w:body>
    <w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>
    <foreign:p><foreign:r><foreign:t>Injected foreign text</foreign:t></foreign:r></foreign:p>
  </w:body>
</w:document>`,
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("rejects comments that could masquerade as visible WordprocessingML", async () => {
    await expect(
      extractDocxText(
        createDocx({
          "word/document.xml": documentXml(
            "<!-- <w:p><w:r><w:t>Injected SQL</w:t></w:r></w:p> -->" +
              "<w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>",
          ),
        }),
      ),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it("rejects a nested redefinition of the WordprocessingML prefix", async () => {
    await expect(
      extractDocxText(
        createDocx({
          "word/document.xml": documentXml(
            '<w:p xmlns:w="urn:fictional:foreign"><w:r><w:t>Injected SQL</w:t></w:r></w:p>',
          ),
        }),
      ),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it.each(["../outside.xml", "/absolute.xml", "word\\escape.xml"])(
    "rejects unsafe archive path %s before extraction",
    async (unsafePath) => {
      await expect(
        extractDocxText(createDocx({ [unsafePath]: "unsafe" })),
      ).rejects.toMatchObject({ code: "unsafe_archive" });
    },
  );

  it("rejects duplicate archive paths before extraction", async () => {
    const archive = createDocx({
      "word/a.xml": "first",
      "word/b.xml": "second",
    });
    const duplicateArchive = replaceAllAscii(
      archive,
      "word/b.xml",
      "word/a.xml",
    );

    await expect(extractDocxText(duplicateArchive)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it("rejects forged stored-entry size metadata before extraction", async () => {
    const archive = createDocx(
      { "custom/fictional-padding.bin": "fictional stored padding" },
      0,
    );
    const forged = archive.slice();
    const entry = requireTestZipEntry(forged, "custom/fictional-padding.bin");
    expect(entry.compressedSize).toBe(entry.originalSize);
    expect(entry.originalSize).toBeGreaterThan(1);

    writeUint32(forged, entry.centralOffset + 24, 1);
    writeUint32(forged, entry.localOffset + 22, 1);

    await expect(extractDocxText(forged)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it("rejects archive entry byte ranges that overlap", async () => {
    const archive = createDocx(
      {
        "custom/fictional-a.bin": "aaaaaaaa",
        "custom/fictional-b.bin": "bbbbbbbb",
      },
      0,
    );
    const overlapping = archive.slice();
    const first = requireTestZipEntry(overlapping, "custom/fictional-a.bin");
    const second = requireTestZipEntry(overlapping, "custom/fictional-b.bin");
    const overlappingSize = second.localOffset - first.dataOffset + 1;
    expect(overlappingSize).toBeGreaterThan(first.compressedSize);

    writeUint32(overlapping, first.centralOffset + 20, overlappingSize);
    writeUint32(overlapping, first.centralOffset + 24, overlappingSize);
    writeUint32(overlapping, first.localOffset + 18, overlappingSize);
    writeUint32(overlapping, first.localOffset + 22, overlappingSize);

    await expect(extractDocxText(overlapping)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it("rejects archives above the entry-count ceiling", async () => {
    const extraEntries = Object.fromEntries(
      Array.from({ length: cvFileLimits.archiveEntries }, (_, index) => [
        `custom/item-${index}.xml`,
        new Uint8Array(),
      ]),
    );

    await expect(
      extractDocxText(createDocx(extraEntries)),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it("rejects declared expansion above the uncompressed byte ceiling", async () => {
    const compressedBomb = createDocx({
      "word/media/fictional-padding.bin": new Uint8Array(
        cvFileLimits.uncompressedBytes + 1,
      ),
    });
    expect(compressedBomb.length).toBeLessThan(cvFileLimits.inputBytes);

    await expect(extractDocxText(compressedBomb)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it("aborts when actual emitted ZIP bytes cross the expansion ceiling", async () => {
    const document =
      documentXml(
        "<w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>",
      ) + " ".repeat(cvFileLimits.uncompressedBytes + 1);
    const archive = createDocx({ "word/document.xml": document });
    expect(archive.length).toBeLessThan(cvFileLimits.inputBytes);
    const forged = archive.slice();
    const entries = inspectTestZip(forged);
    const documentEntry = requireTestZipEntry(forged, "word/document.xml");
    const otherDeclaredBytes = entries
      .filter((entry) => entry.name !== "word/document.xml")
      .reduce((total, entry) => total + entry.originalSize, 0);
    const forgedDocumentSize =
      cvFileLimits.uncompressedBytes - otherDeclaredBytes;
    expect(forgedDocumentSize).toBeGreaterThan(0);
    expect(documentEntry.originalSize).toBeGreaterThan(forgedDocumentSize);

    writeUint32(forged, documentEntry.centralOffset + 24, forgedDocumentSize);
    writeUint32(forged, documentEntry.localOffset + 22, forgedDocumentSize);

    await expect(extractDocxText(forged)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it("rejects external OOXML relationships", async () => {
    const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/fictional" TargetMode="External"/>
</Relationships>`;

    await expect(
      extractDocxText(
        createDocx({ "word/_rels/document.xml.rels": relationships }),
      ),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it("rejects executable OOXML parts even with a DOCX file identity", async () => {
    await expect(
      extractDocxText(
        createDocx({ "word/vbaProject.bin": new Uint8Array([1, 2, 3]) }),
      ),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it("consistently rejects undeclared XML entities", async () => {
    const malformed = createDocx({
      "word/document.xml": documentXml(
        "<w:p><w:r><w:t>Fictional &private; value</w:t></w:r></w:p>",
      ),
    });

    await expect(extractDocxText(malformed)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
    await expect(extractDocxText(malformed)).rejects.toMatchObject({
      code: "unsafe_archive",
    });
  });

  it.each([
    documentXml(
      "<w:p><w:r><w:t>Fictional truncated evidence</w:t></w:r></w:p>",
    ).replace(/<\/w:body>\s*<\/w:document>/u, ""),
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Fictional misnested evidence</w:t></w:r></w:body></w:p>
</w:document>`,
  ])("rejects incomplete or misnested WordprocessingML", async (xml) => {
    await expect(
      extractDocxText(createDocx({ "word/document.xml": xml })),
    ).rejects.toMatchObject({ code: "unsafe_archive" });
  });

  it("excludes text inherited from a hidden WordprocessingML style", async () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="character" w:styleId="HiddenEvidence">
    <w:rPr><w:vanish/></w:rPr>
  </w:style>
</w:styles>`;
    const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": documentXml(
          "<w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>" +
            '<w:p><w:r><w:rPr><w:rStyle w:val="HiddenEvidence"/></w:rPr><w:t>Hidden fictional claim</w:t></w:r></w:p>',
        ),
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": relationships,
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("suppresses text hidden by the document run-property defaults", async () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:vanish/></w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
    const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    await expect(
      extractDocxText(
        createDocx({
          "word/document.xml": documentXml(
            "<w:p><w:r><w:t>Default-hidden fictional claim</w:t></w:r></w:p>",
          ),
          "word/styles.xml": styles,
          "word/_rels/document.xml.rels": relationships,
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("suppresses text inherited from the default hidden character style", async () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="character" w:default="1" w:styleId="DefaultHiddenEvidence">
    <w:rPr><w:vanish/></w:rPr>
  </w:style>
</w:styles>`;
    const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    await expect(
      extractDocxText(
        createDocx({
          "word/document.xml": documentXml(
            "<w:p><w:r><w:t>Style-default-hidden fictional claim</w:t></w:r></w:p>",
          ),
          "word/styles.xml": styles,
          "word/_rels/document.xml.rels": relationships,
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("suppresses text inherited from the default hidden paragraph style when pStyle is absent", async () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="HiddenParagraphBase">
    <w:rPr><w:vanish/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:default="1" w:styleId="DefaultHiddenParagraph">
    <w:basedOn w:val="HiddenParagraphBase"/>
  </w:style>
</w:styles>`;
    const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    await expect(
      extractDocxText(
        createDocx({
          "word/document.xml": documentXml(
            "<w:p><w:r><w:t>Paragraph-default-hidden fictional claim</w:t></w:r></w:p>",
          ),
          "word/styles.xml": styles,
          "word/_rels/document.xml.rels": relationships,
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("excludes moved-from and out-of-body WordprocessingML text", async () => {
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>
    <w:moveFrom><w:p><w:r><w:t>Moved fictional claim</w:t></w:r></w:p></w:moveFrom>
  </w:body>
  <w:p><w:r><w:t>Out-of-body fictional claim</w:t></w:r></w:p>
</w:document>`,
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("excludes field-instruction content from evidence", async () => {
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": documentXml(
          "<w:p><w:r><w:t>Visible fictional evidence</w:t></w:r></w:p>" +
            '<w:fldSimple w:instr="fictional instruction"><w:r><w:t>Instruction-only claim</w:t></w:r></w:fldSimple>',
        ),
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("keeps nested field results hidden while an outer field is still an instruction", async () => {
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": documentXml(
          `<w:p>
            <w:r><w:fldChar w:fldCharType="begin"/></w:r>
            <w:r><w:instrText>OUTER INSTRUCTION</w:instrText></w:r>
            <w:r><w:fldChar w:fldCharType="begin"/></w:r>
            <w:r><w:instrText>INNER INSTRUCTION</w:instrText></w:r>
            <w:r><w:fldChar w:fldCharType="separate"/></w:r>
            <w:r><w:t>Nested result inside outer instruction</w:t></w:r>
            <w:r><w:fldChar w:fldCharType="end"/></w:r>
            <w:r><w:fldChar w:fldCharType="separate"/></w:r>
            <w:r><w:t>Visible outer field result</w:t></w:r>
            <w:r><w:fldChar w:fldCharType="end"/></w:r>
          </w:p>`,
        ),
      }),
    );

    expect(result.text).toBe("Visible outer field result");
  });

  it("truncates extracted text at the character ceiling", async () => {
    const text = "A".repeat(cvFileLimits.extractedCharacters + 17);
    const result = await extractDocxText(
      createDocx({
        "word/document.xml": documentXml(
          `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`,
        ),
      }),
    );

    expect(result.text).toHaveLength(cvFileLimits.extractedCharacters);
    expect(result.text).toBe("A".repeat(cvFileLimits.extractedCharacters));
    expect(result.truncated).toBe(true);
  });
});
