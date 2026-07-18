import { afterEach, describe, expect, it, vi } from "vitest";

import { cvFileLimits, validateCvFile } from "./file-gate.ts";
import { extractCvText } from "./index.ts";
import { extractPdfText, runWithExtractionDeadline } from "./pdf.ts";

const encoder = new TextEncoder();

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/gu, "\\$1");
}

function createPdf(
  pageTexts: readonly string[],
  options: { trailerExtra?: string } = {},
): Uint8Array {
  const pageCount = pageTexts.length;
  const firstPageObject = 4;
  const firstContentObject = firstPageObject + pageCount;
  const pageReferences = Array.from(
    { length: pageCount },
    (_, index) => `${firstPageObject + index} 0 R`,
  ).join(" ");
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageCount} >>`],
    [3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
  ]);

  pageTexts.forEach((text, index) => {
    const pageObject = firstPageObject + index;
    const contentObject = firstContentObject + index;
    const textOperations = (text.match(/.{1,60}/gu) ?? [""])
      .map((chunk) => `(${escapePdfText(chunk)}) Tj T*`)
      .join("\n");
    const stream = `BT /F1 10 Tf 14 TL 72 720 Td\n${textOperations}\nET`;
    objects.set(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    objects.set(
      contentObject,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  const objectCount = 3 + pageCount * 2;
  let pdf = "%PDF-1.7\n";
  const offsets = new Array<number>(objectCount + 1).fill(0);
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R ${options.trailerExtra ?? ""} >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("bounded PDF extraction", () => {
  it("dispatches a validated PDF through the package extraction interface", async () => {
    const result = await extractCvText(
      validateCvFile({
        fileName: "fictional-profile.pdf",
        mediaType: "application/pdf",
        bytes: createPdf(["Fictional profile"]),
      }),
    );

    expect(result).toMatchObject({ kind: "pdf", pageCount: 1 });
  });

  it("extracts fictional PDF text and reports its page count", async () => {
    const result = await extractPdfText(
      createPdf(["Fictional analytics implementation consultant"]),
    );

    expect(result).toEqual({
      kind: "pdf",
      text: "Fictional analytics implementation consultant",
      truncated: false,
      pageCount: 1,
    });
  });

  it("rejects encrypted PDFs before text extraction", async () => {
    await expect(
      extractPdfText(
        createPdf(["Fictional encrypted profile"], {
          trailerExtra: "/Encrypt 3 0 R",
        }),
      ),
    ).rejects.toMatchObject({ code: "encrypted_pdf" });
  });

  it("rejects PDFs above the page ceiling before reading page text", async () => {
    const bytes = createPdf(
      Array.from({ length: cvFileLimits.pdfPages + 1 }, () => "Fictional page"),
    );
    expect(bytes.length).toBeLessThan(cvFileLimits.inputBytes);

    await expect(extractPdfText(bytes)).rejects.toMatchObject({
      code: "page_limit",
    });
  });

  it("truncates extracted text at the character ceiling", async () => {
    const result = await extractPdfText(
      createPdf(Array.from({ length: 40 }, () => "A".repeat(3_000))),
    );

    expect(result.text).toHaveLength(cvFileLimits.extractedCharacters);
    expect(result.text).toMatch(/^[A\n]+$/u);
    expect(result.truncated).toBe(true);
  });

  it("maps malformed PDF data to a sanitised invalid-file error", async () => {
    await expect(
      extractPdfText(encoder.encode("%PDF-1.7\nfictional malformed data")),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("fails a stalled extraction at the fixed deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00Z"));
    const operation = new Promise<never>(() => undefined);
    const extraction = runWithExtractionDeadline(operation, Date.now());
    const rejection = expect(extraction).rejects.toMatchObject({
      code: "extraction_timeout",
    });

    await vi.advanceTimersByTimeAsync(cvFileLimits.timeoutMilliseconds + 1);
    await rejection;
  });

  it("keeps timeout errors sanitised when cancellation itself throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00Z"));
    const extraction = runWithExtractionDeadline(
      new Promise<never>(() => undefined),
      Date.now(),
      () => {
        throw new Error("fictional cancellation detail");
      },
    );
    const rejection = expect(extraction).rejects.toMatchObject({
      code: "extraction_timeout",
      message: "CV file rejected: extraction_timeout",
    });

    await vi.advanceTimersByTimeAsync(cvFileLimits.timeoutMilliseconds + 1);
    await rejection;
  });
});
