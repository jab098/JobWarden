import { zlibSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cvFileLimits, validateCvFile } from "./file-gate.ts";
import { extractCvText } from "./index.ts";
import { extractPdfText, runWithExtractionDeadline } from "./pdf.ts";

const encoder = new TextEncoder();

type GetResolvedPdfJs = typeof import("unpdf").getResolvedPDFJS;
type ResolvedPdfJs = Awaited<ReturnType<GetResolvedPdfJs>>;

const unpdfMock = vi.hoisted(() => ({
  actualGetResolvedPdfJs: undefined as GetResolvedPdfJs | undefined,
  getResolvedPdfJs: vi.fn<GetResolvedPdfJs>(),
}));

vi.mock("unpdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("unpdf")>();
  unpdfMock.actualGetResolvedPdfJs = actual.getResolvedPDFJS;
  unpdfMock.getResolvedPdfJs.mockImplementation(actual.getResolvedPDFJS);
  return {
    ...actual,
    getResolvedPDFJS: unpdfMock.getResolvedPdfJs,
  };
});

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/gu, "\\$1");
}

function createPdf(
  pageTexts: readonly string[],
  options: {
    compressStreams?: boolean;
    pageOperations?: readonly string[];
    trailerExtra?: string;
  } = {},
): Uint8Array {
  const pageCount = pageTexts.length;
  const firstPageObject = 4;
  const firstContentObject = firstPageObject + pageCount;
  const pageReferences = Array.from(
    { length: pageCount },
    (_, index) => `${firstPageObject + index} 0 R`,
  ).join(" ");
  const objects = new Map<number, Uint8Array>([
    [1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>")],
    [
      2,
      encoder.encode(
        `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageCount} >>`,
      ),
    ],
    [
      3,
      encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    ],
  ]);

  pageTexts.forEach((text, index) => {
    const pageObject = firstPageObject + index;
    const contentObject = firstContentObject + index;
    const textOperations = (text.match(/.{1,60}/gu) ?? [""])
      .map((chunk) => `(${escapePdfText(chunk)}) Tj T*`)
      .join("\n");
    const stream =
      options.pageOperations?.[index] ??
      `BT /F1 10 Tf 14 TL 72 720 Td\n${textOperations}\nET`;
    const streamBytes = options.compressStreams
      ? zlibSync(encoder.encode(stream), { level: 9 })
      : encoder.encode(stream);
    const filter = options.compressStreams ? " /Filter /FlateDecode" : "";
    objects.set(
      pageObject,
      encoder.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
      ),
    );
    objects.set(
      contentObject,
      concatenateBytes([
        encoder.encode(
          `<< /Length ${streamBytes.length}${filter} >>\nstream\n`,
        ),
        streamBytes,
        encoder.encode("\nendstream"),
      ]),
    );
  });

  const objectCount = 3 + pageCount * 2;
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.7\n")];
  let byteLength = chunks[0]!.length;
  const offsets = new Array<number>(objectCount + 1).fill(0);
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const object = objects.get(objectId);
    if (!object) throw new Error(`test PDF is missing object ${objectId}`);
    offsets[objectId] = byteLength;
    const objectBytes = concatenateBytes([
      encoder.encode(`${objectId} 0 obj\n`),
      object,
      encoder.encode("\nendobj\n"),
    ]);
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  }

  const xrefOffset = byteLength;
  let trailer = `xref\n0 ${objectCount + 1}\n`;
  trailer += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    trailer += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R ${options.trailerExtra ?? ""} >>\n`;
  trailer += `startxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(trailer));
  return concatenateBytes(chunks);
}

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  unpdfMock.getResolvedPdfJs.mockReset();
  if (unpdfMock.actualGetResolvedPdfJs) {
    unpdfMock.getResolvedPdfJs.mockImplementation(
      unpdfMock.actualGetResolvedPdfJs,
    );
  }
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

  it("bounds a real FlateDecode PDF through the production PDF.js stream", async () => {
    expect(unpdfMock.actualGetResolvedPdfJs).toBeDefined();
    unpdfMock.getResolvedPdfJs.mockImplementationOnce(
      unpdfMock.actualGetResolvedPdfJs!,
    );
    const bombText = "C".repeat(120_000);
    const positionedChunks = bombText
      .match(/.{1,60}/gu)!
      .map((chunk) => `1 0 0 1 72 720 Tm (${chunk}) Tj`)
      .join("\n");
    const compressed = createPdf([bombText], {
      compressStreams: true,
      pageOperations: [`BT /F1 10 Tf\n${positionedChunks}\nET`],
    });
    expect(compressed.length).toBeLessThan(5_000);

    const result = await extractPdfText(compressed);

    expect(result.text).toHaveLength(cvFileLimits.extractedCharacters);
    expect(result.text).toMatch(/^C+$/u);
    expect(result.truncated).toBe(true);
  });

  it("streams a compressed text bomb incrementally and cancels at the character ceiling", async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const chunks = [
      {
        items: [
          {
            str: "A".repeat(60_000),
            hasEOL: false,
            width: 200,
            height: 10,
            transform: [1, 0, 0, 10, 72, 720],
          },
        ],
      },
      {
        items: [
          {
            str: "B".repeat(60_000),
            hasEOL: false,
            width: 200,
            height: 10,
            transform: [1, 0, 0, 10, 72, 700],
          },
        ],
      },
    ];
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValue({ done: true, value: undefined });
    const pageCleanup = vi.fn();
    const page = {
      cleanup: pageCleanup,
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      streamTextContent: vi.fn(() => ({
        getReader: () => ({ cancel, read, releaseLock }),
      })),
      view: [0, 0, 612, 792],
    };
    const documentDestroy = vi.fn(async () => undefined);
    const document = {
      destroy: documentDestroy,
      getPage: vi.fn(async () => page),
      numPages: 1,
    };
    const loadingTaskDestroy = vi.fn(async () => undefined);
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: { setTextRenderingMode: 38 },
      getDocument: () => ({
        destroy: loadingTaskDestroy,
        promise: Promise.resolve(document),
      }),
    } as unknown as ResolvedPdfJs);
    const compressed = createPdf(["C".repeat(120_000)], {
      compressStreams: true,
    });
    expect(compressed.length).toBeLessThan(5_000);

    const result = await extractPdfText(compressed);

    expect(result.text).toHaveLength(cvFileLimits.extractedCharacters);
    expect(result.truncated).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(pageCleanup).toHaveBeenCalledTimes(1);
    expect(documentDestroy).toHaveBeenCalled();
    expect(loadingTaskDestroy).toHaveBeenCalled();
  });

  it("excludes text whose geometry is outside the visible page", async () => {
    const result = await extractPdfText(
      createPdf(["unused"], {
        pageOperations: [
          "BT /F1 10 Tf 72 720 Td (Visible fictional evidence) Tj ET\n" +
            "BT /F1 10 Tf 5000 5000 Td (Off-page fictional claim) Tj ET",
        ],
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("keeps mirrored and rotated text whose transformed bounds intersect the page", async () => {
    const result = await extractPdfText(
      createPdf(["unused"], {
        pageOperations: [
          "BT /F1 10 Tf -1 0 0 1 612 720 Tm (Mirrored fictional evidence remains visible) Tj ET\n" +
            "BT /F1 10 Tf 0 -1 1 0 72 792 Tm (Rotated fictional evidence remains visible) Tj ET\n" +
            "BT /F1 10 Tf 1 0 0 1 5000 5000 Tm (Off-page fictional claim) Tj ET",
        ],
      }),
    );

    expect(result.text).toContain(
      "Mirrored fictional evidence remains visible",
    );
    expect(result.text).toContain("Rotated fictional evidence remains visible");
    expect(result.text).not.toContain("Off-page fictional claim");
  });

  it("rejects a page containing invisible text-rendering instructions", async () => {
    await expect(
      extractPdfText(
        createPdf(["unused"], {
          pageOperations: [
            "BT /F1 10 Tf 72 720 Td 3 Tr (Invisible fictional claim) Tj ET",
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("destroys the loading task and document when incremental parsing fails", async () => {
    const documentDestroy = vi.fn(async () => undefined);
    const document = {
      destroy: documentDestroy,
      getPage: vi.fn(async () => {
        throw new Error("fictional parser failure");
      }),
      numPages: 1,
    };
    const loadingTaskDestroy = vi.fn(async () => undefined);
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: { setTextRenderingMode: 38 },
      getDocument: () => ({
        destroy: loadingTaskDestroy,
        promise: Promise.resolve(document),
      }),
    } as unknown as ResolvedPdfJs);

    await expect(
      extractPdfText(createPdf(["Fictional evidence"])),
    ).rejects.toMatchObject({ code: "invalid_file" });
    expect(documentDestroy).toHaveBeenCalled();
    expect(loadingTaskDestroy).toHaveBeenCalled();
  });

  it("returns by the hard deadline when stream cancellation stalls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00Z"));
    const cancelGate = deferred();
    const cancel = vi.fn(() => cancelGate.promise);
    const reader = {
      cancel,
      read: vi.fn(async () => ({
        done: false,
        value: {
          items: [
            {
              str: "A".repeat(cvFileLimits.extractedCharacters + 1),
              hasEOL: false,
              width: 200,
              height: 10,
              transform: [1, 0, 0, 10, 72, 720],
            },
          ],
        },
      })),
      releaseLock: vi.fn(),
    };
    const page = {
      cleanup: vi.fn(),
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      streamTextContent: vi.fn(() => ({ getReader: () => reader })),
      view: [0, 0, 612, 792],
    };
    const document = {
      destroy: vi.fn(async () => undefined),
      getPage: vi.fn(async () => page),
      numPages: 1,
    };
    const loadingTask = {
      destroy: vi.fn(async () => undefined),
      promise: Promise.resolve(document),
    };
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: { setTextRenderingMode: 38 },
      getDocument: () => loadingTask,
    } as unknown as ResolvedPdfJs);

    const extraction = extractPdfText(createPdf(["Fictional evidence"]));
    const deadlineMarker = new Promise<"deadline_exceeded">((resolve) => {
      setTimeout(
        () => resolve("deadline_exceeded"),
        cvFileLimits.timeoutMilliseconds + 1,
      );
    });
    const outcome = Promise.race([
      extraction.then(() => "settled" as const),
      deadlineMarker,
    ]);

    await vi.advanceTimersByTimeAsync(cvFileLimits.timeoutMilliseconds + 1);
    try {
      await expect(outcome).resolves.toBe("settled");
    } finally {
      cancelGate.resolve();
      await extraction;
    }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("returns by the hard deadline when document destruction stalls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00Z"));
    const documentDestroyGate = deferred();
    const loadingTaskDestroyGate = deferred();
    const page = {
      cleanup: vi.fn(),
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      streamTextContent: vi.fn(() => ({
        getReader: () => ({
          cancel: vi.fn(async () => undefined),
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: {
                items: [
                  {
                    str: "Visible fictional evidence",
                    hasEOL: false,
                    width: 200,
                    height: 10,
                    transform: [1, 0, 0, 10, 72, 720],
                  },
                ],
              },
            })
            .mockResolvedValue({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      })),
      view: [0, 0, 612, 792],
    };
    const documentDestroy = vi.fn(() => documentDestroyGate.promise);
    const document = {
      destroy: documentDestroy,
      getPage: vi.fn(async () => page),
      numPages: 1,
    };
    const loadingTaskDestroy = vi.fn(() => loadingTaskDestroyGate.promise);
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: { setTextRenderingMode: 38 },
      getDocument: () => ({
        destroy: loadingTaskDestroy,
        promise: Promise.resolve(document),
      }),
    } as unknown as ResolvedPdfJs);

    const extraction = extractPdfText(createPdf(["Fictional evidence"]));
    const deadlineMarker = new Promise<"deadline_exceeded">((resolve) => {
      setTimeout(
        () => resolve("deadline_exceeded"),
        cvFileLimits.timeoutMilliseconds + 1,
      );
    });
    const outcome = Promise.race([
      extraction.then(() => "settled" as const),
      deadlineMarker,
    ]);

    await vi.advanceTimersByTimeAsync(cvFileLimits.timeoutMilliseconds + 1);
    try {
      await expect(outcome).resolves.toBe("settled");
    } finally {
      documentDestroyGate.resolve();
      loadingTaskDestroyGate.resolve();
      await extraction;
    }
    expect(documentDestroy).toHaveBeenCalled();
    expect(loadingTaskDestroy).toHaveBeenCalled();
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
