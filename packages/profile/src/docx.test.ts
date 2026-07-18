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

  return zipSync(entries, { level: 9 });
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
