import "server-only";

import { strToU8, zipSync } from "fflate";

/**
 * A fictional CV archive, generated in code so no document — real or realistic
 * — is ever committed to the repository. It exists only to make the tailoring
 * surface reviewable while real CV upload remains closed.
 */
const fictionalParagraphs = [
  "Alex Fictionperson — Analytics Implementation Lead",
  "Fictionex Ltd, London. Senior Analytics Engineer, 2021 to 2026.",
  "Built event instrumentation and analytics implementation for 12 product teams.",
  "Owned data quality governance and reduced reporting defects by 30 percent.",
  "Ran experimentation programmes and consent technology reviews across the UK business.",
  "Northgate Fiction Ltd, Leeds. Analyst, 2018 to 2021.",
  "Delivered attribution reporting and stakeholder training for 6 markets.",
  "Tools: SQL, Python, dbt, Snowplow, Looker.",
  "Education: BSc Mathematics, Fictional University, 2018.",
  "Interests: long-distance cycling and amateur radio.",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function paragraphXml(text: string, index: number): string {
  // The second paragraph deliberately carries two differently formatted runs so
  // the mixed-formatting warning has something real to fire on.
  if (index === 1) {
    const [head, tail] = [text.slice(0, 15), text.slice(15)];
    return (
      '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>' +
      `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(head)}</w:t></w:r>` +
      `<w:r><w:t xml:space="preserve">${escapeXml(tail)}</w:t></w:r></w:p>`
    );
  }
  return (
    '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>' +
    `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
  );
}

export const fictionalCvText = fictionalParagraphs.join("\n");

export function buildFictionalCvDocx(): Uint8Array {
  const body = fictionalParagraphs.map(paragraphXml).join("");

  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        body +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
    ),
  });
}
