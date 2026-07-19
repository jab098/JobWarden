import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { CvFileValidationError } from "./file-gate.ts";
import { readDocxParagraphs, writeTailoredDocx } from "./docx-edit.ts";

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function run(text: string, bold = false): string {
  const properties = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function paragraph(...runs: string[]): string {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs.join("")}</w:p>`;
}

function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
}

/** A fictional CV archive. Never build a fixture from a real document. */
function buildDocx(
  body = [
    paragraph(run("Fictionex Ltd — Senior Analytics Engineer")),
    paragraph(run("Built event instrumentation for "), run("12 teams", true)),
    paragraph(run("Hobbies: amateur radio")),
    "<w:p/>",
    `<w:tbl><w:tr><w:tc>${paragraph(run("Table cell paragraph"))}</w:tc></w:tr></w:tbl>`,
  ].join(""),
  extraParts: Record<string, string> = {},
): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(packageRels),
    "word/document.xml": strToU8(documentXml(body)),
    "word/styles.xml": strToU8(
      '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    ),
    ...Object.fromEntries(
      Object.entries(extraParts).map(([name, value]) => [name, strToU8(value)]),
    ),
  });
}

function documentTextOf(archive: Uint8Array): string {
  return new TextDecoder().decode(unzipSync(archive)["word/document.xml"]!);
}

describe("readDocxParagraphs", () => {
  it("reads every paragraph in document order, including table cells", () => {
    const paragraphs = readDocxParagraphs(buildDocx());

    expect(paragraphs.map((item) => item.text)).toEqual([
      "Fictionex Ltd — Senior Analytics Engineer",
      "Built event instrumentation for 12 teams",
      "Hobbies: amateur radio",
      "",
      "Table cell paragraph",
    ]);
    expect(paragraphs.map((item) => item.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("flags a paragraph whose runs carry different formatting", () => {
    const paragraphs = readDocxParagraphs(buildDocx());

    expect(paragraphs[0]?.uniformFormatting).toBe(true);
    expect(paragraphs[1]?.uniformFormatting).toBe(false);
  });

  it.each([
    ["a comment", `<!-- <w:p><w:r><w:t>hidden</w:t></w:r></w:p> -->`],
    ["a CDATA section", `<w:p><w:r><w:t><![CDATA[raw]]></w:t></w:r></w:p>`],
    ["a processing instruction", `<?custom directive?><w:p/>`],
  ])(
    "fails closed on %s that could hide element boundaries",
    (_label, body) => {
      expect(() => readDocxParagraphs(buildDocx(body))).toThrow(
        CvFileValidationError,
      );
    },
  );

  it("rejects an archive carrying an executable part", () => {
    expect(() =>
      readDocxParagraphs(
        buildDocx(undefined, { "word/vbaProject.bin": "binary" }),
      ),
    ).toThrow(CvFileValidationError);
  });
});

describe("writeTailoredDocx", () => {
  it("replaces a paragraph's text without touching the rest", () => {
    const original = buildDocx();

    const tailored = writeTailoredDocx(original, [
      { paragraphIndex: 2, kind: "replace", text: "Amateur radio operator" },
    ]);

    expect(readDocxParagraphs(tailored).map((item) => item.text)).toEqual([
      "Fictionex Ltd — Senior Analytics Engineer",
      "Built event instrumentation for 12 teams",
      "Amateur radio operator",
      "",
      "Table cell paragraph",
    ]);
  });

  it("removes an omitted paragraph entirely", () => {
    const tailored = writeTailoredDocx(buildDocx(), [
      { paragraphIndex: 2, kind: "omit" },
    ]);

    const texts = readDocxParagraphs(tailored).map((item) => item.text);
    expect(texts).not.toContain("Hobbies: amateur radio");
    expect(texts).toHaveLength(4);
  });

  it("applies several operations by original paragraph index", () => {
    const tailored = writeTailoredDocx(buildDocx(), [
      { paragraphIndex: 0, kind: "replace", text: "Fictionex Ltd — Analytics" },
      { paragraphIndex: 2, kind: "omit" },
    ]);

    expect(readDocxParagraphs(tailored).map((item) => item.text)).toEqual([
      "Fictionex Ltd — Analytics",
      "Built event instrumentation for 12 teams",
      "",
      "Table cell paragraph",
    ]);
  });

  it("keeps the paragraph's own structure and section properties", () => {
    const tailored = documentTextOf(
      writeTailoredDocx(buildDocx(), [
        { paragraphIndex: 0, kind: "replace", text: "Analytics Engineer" },
      ]),
    );

    expect(tailored).toContain('<w:pStyle w:val="Normal"/>');
    expect(tailored).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  });

  it("keeps the first run's formatting and empties the remaining runs", () => {
    const tailored = documentTextOf(
      writeTailoredDocx(buildDocx(), [
        { paragraphIndex: 1, kind: "replace", text: "Instrumentation lead" },
      ]),
    );

    // The bold second run survives structurally but carries no text, so the
    // rewritten sentence reads in the first run's formatting.
    expect(tailored).toContain("Instrumentation lead");
    expect(tailored).toContain("<w:b/>");
    expect(tailored).not.toContain("12 teams");
  });

  it("escapes XML metacharacters in replacement text", () => {
    const archive = writeTailoredDocx(buildDocx(), [
      {
        paragraphIndex: 2,
        kind: "replace",
        text: 'Research & development <analytics> "lead"',
      },
    ]);
    const tailored = documentTextOf(archive);

    expect(tailored).toContain("Research &amp; development &lt;analytics&gt;");
    expect(tailored).not.toContain("<analytics>");
    // The escaped markup round-trips back to the exact text the user approved.
    expect(readDocxParagraphs(archive)[2]?.text).toBe(
      'Research & development <analytics> "lead"',
    );
  });

  it("preserves whitespace in replacement text", () => {
    const tailored = documentTextOf(
      writeTailoredDocx(buildDocx(), [
        { paragraphIndex: 2, kind: "replace", text: "  spaced  text  " },
      ]),
    );

    expect(tailored).toContain('xml:space="preserve"');
  });

  it("leaves every other archive part byte-identical", () => {
    const original = buildDocx();
    const tailored = writeTailoredDocx(original, [
      { paragraphIndex: 2, kind: "omit" },
    ]);

    const before = unzipSync(original);
    const after = unzipSync(tailored);

    expect(Object.keys(after).toSorted()).toEqual(
      Object.keys(before).toSorted(),
    );
    for (const name of Object.keys(before)) {
      if (name === "word/document.xml") continue;
      expect(after[name]).toEqual(before[name]);
    }
  });

  it("never mutates the source archive", () => {
    const original = buildDocx();
    const snapshot = Uint8Array.from(original);

    writeTailoredDocx(original, [
      { paragraphIndex: 0, kind: "replace", text: "Analytics Engineer" },
      { paragraphIndex: 2, kind: "omit" },
    ]);

    expect(original).toEqual(snapshot);
  });

  it("produces an archive that still reads as a valid CV document", () => {
    const tailored = writeTailoredDocx(buildDocx(), [
      { paragraphIndex: 2, kind: "omit" },
    ]);

    expect(() => readDocxParagraphs(tailored)).not.toThrow();
  });

  it("rejects an operation pointing outside the document", () => {
    expect(() =>
      writeTailoredDocx(buildDocx(), [{ paragraphIndex: 99, kind: "omit" }]),
    ).toThrow(CvFileValidationError);
  });

  it("rejects two operations on the same paragraph", () => {
    expect(() =>
      writeTailoredDocx(buildDocx(), [
        { paragraphIndex: 1, kind: "omit" },
        { paragraphIndex: 1, kind: "replace", text: "Analytics" },
      ]),
    ).toThrow(CvFileValidationError);
  });

  it("rejects replacing a paragraph that has no run to write into", () => {
    expect(() =>
      writeTailoredDocx(buildDocx(), [
        { paragraphIndex: 3, kind: "replace", text: "New text" },
      ]),
    ).toThrow(CvFileValidationError);
  });

  it("returns the original archive content when given no operations", () => {
    const original = buildDocx();
    const tailored = writeTailoredDocx(original, []);

    expect(documentTextOf(tailored)).toBe(documentTextOf(original));
  });
});
