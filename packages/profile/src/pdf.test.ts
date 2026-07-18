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

function pdfHexString(value: string): string {
  return Array.from(encoder.encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createPdf(
  pageTexts: readonly string[],
  options: {
    catalogExtra?: string;
    compressStreams?: boolean;
    extraObjects?: ReadonlyMap<number, Uint8Array | string>;
    pageExtra?: readonly string[];
    pageOperations?: readonly string[];
    pageResourcesExtra?: readonly string[];
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
    [
      1,
      encoder.encode(
        `<< /Type /Catalog /Pages 2 0 R ${options.catalogExtra ?? ""} >>`,
      ),
    ],
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
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> ${options.pageResourcesExtra?.[index] ?? ""} >> /Contents ${contentObject} 0 R ${options.pageExtra?.[index] ?? ""} >>`,
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

  for (const [objectId, value] of options.extraObjects ?? []) {
    if (objects.has(objectId)) {
      throw new Error(`test PDF object ${objectId} is already reserved`);
    }
    objects.set(
      objectId,
      typeof value === "string" ? encoder.encode(value) : value,
    );
  }

  const objectCount = Math.max(...objects.keys());
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

function safePdfDocumentSecuritySurface() {
  return {
    getAttachments: vi.fn(async () => null),
    getJSActions: vi.fn(async () => null),
    getOpenAction: vi.fn(async () => null),
    getOptionalContentConfig: vi.fn(async () => ({
      getGroup: vi.fn(() => null),
      isVisible: vi.fn(() => false),
    })),
  };
}

function safePdfPageSecuritySurface() {
  return {
    getAnnotations: vi.fn(async () => []),
    getJSActions: vi.fn(async () => ({})),
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

  it("accepts unsupported-name text inside a benign PDF literal string", async () => {
    const result = await extractPdfText(
      createPdf(["Visible fictional evidence"], {
        extraObjects: new Map([
          [6, "<< /Title (Fictional discussion of /AF and /XFA) >>"],
        ]),
        trailerExtra: "/Info 6 0 R",
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("accepts unsupported-name text inside escaped and nested literal strings", async () => {
    const result = await extractPdfText(
      createPdf(["Visible fictional evidence"], {
        extraObjects: new Map([
          [
            6,
            "<< /Title (Fictional \\(escaped /AF\\) and (nested /XFA) discussion) >>",
          ],
        ]),
        trailerExtra: "/Info 6 0 R",
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it("accepts unsupported-name bytes inside comments and hexadecimal strings", async () => {
    const title = pdfHexString("Fictional /AF and /XFA discussion");
    const result = await extractPdfText(
      createPdf(["Visible fictional evidence"], {
        extraObjects: new Map([
          [
            6,
            `<< /Title <${title}> % fictional comment about /AF and /XFA\n>>`,
          ],
        ]),
        trailerExtra: "/Info 6 0 R",
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it.each([
    { compressStreams: false, name: "uncompressed" },
    { compressStreams: true, name: "Flate-compressed" },
  ])(
    "extracts visible /AF and /XFA text from a $name content stream",
    async ({ compressStreams }) => {
      const result = await extractPdfText(
        createPdf(["Visible fictional /AF and /XFA evidence"], {
          compressStreams,
        }),
      );

      expect(result.text).toBe("Visible fictional /AF and /XFA evidence");
    },
  );

  it.each([
    {
      body: "<< /Title (unterminated fictional title >>",
      name: "an unterminated literal string",
    },
    {
      body: "<< /Title <46GG> >>",
      name: "an invalid hexadecimal string",
    },
    {
      body: "<< >>\nstream\nabc\nendstream",
      name: "a stream without a direct length",
    },
    {
      body: "<< /Length 3 >>\nstream\nabcd\nendstream",
      name: "a stream whose direct length does not reach endstream",
    },
    {
      body: "<< /Length 3 >>\nstream x\nabc\nendstream",
      name: "a stream with an ambiguous opening delimiter",
    },
  ])("rejects $name during lexical preflight", async ({ body }) => {
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          extraObjects: new Map([[6, body]]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
    expect(unpdfMock.getResolvedPdfJs).not.toHaveBeenCalled();
  });

  it.each(["A#4Z", "A#4"])(
    "rejects an invalid PDF name escape in /%s during lexical preflight",
    async (invalidName) => {
      await expect(
        extractPdfText(
          createPdf(["Visible fictional evidence"], {
            catalogExtra: `/${invalidName} /FictionalValue`,
          }),
        ),
      ).rejects.toMatchObject({ code: "invalid_file" });
      expect(unpdfMock.getResolvedPdfJs).not.toHaveBeenCalled();
    },
  );

  it("accepts moderately nested container values", async () => {
    const result = await extractPdfText(
      createPdf(["Visible fictional evidence"], {
        extraObjects: new Map([
          [6, `<< /Fictional ${"[".repeat(8)}1${"]".repeat(8)} >>`],
        ]),
        trailerExtra: "/Info 6 0 R",
      }),
    );

    expect(result.text).toBe("Visible fictional evidence");
  });

  it.each([
    {
      body: `${"[".repeat(10_000)}1${"]".repeat(10_000)}`,
      name: "arrays",
    },
    {
      body: `${"<< /A ".repeat(10_000)}1${" >>".repeat(10_000)}`,
      name: "dictionaries",
    },
  ])(
    "rejects deeply nested $name during lexical preflight",
    async ({ body }) => {
      await expect(
        extractPdfText(
          createPdf(["Visible fictional evidence"], {
            extraObjects: new Map([[6, body]]),
          }),
        ),
      ).rejects.toMatchObject({ code: "invalid_file" });
      expect(unpdfMock.getResolvedPdfJs).not.toHaveBeenCalled();
    },
  );

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
      ...safePdfPageSecuritySurface(),
      cleanup: pageCleanup,
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      streamTextContent: vi.fn(() => ({
        getReader: () => ({ cancel, read, releaseLock }),
      })),
      view: [0, 0, 612, 792],
    };
    const documentDestroy = vi.fn(async () => undefined);
    const document = {
      ...safePdfDocumentSecuritySurface(),
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

  it("rejects a PDF carrying a document JavaScript action", async () => {
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          catalogExtra: "/Names << /JavaScript 6 0 R >>",
          extraObjects: new Map([
            [6, "<< /Names [(fictionalScript) 7 0 R] >>"],
            [7, "<< /S /JavaScript /JS (fictionalScript) >>"],
          ]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects a PDF carrying a launch action", async () => {
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          catalogExtra: "/Open#41ction 6 0 R",
          extraObjects: new Map([
            [6, "<< /Type /Action /S /La#75nch /F (fictional-helper.exe) >>"],
          ]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects object-stream ambiguity before unsupported actions can be hidden", async () => {
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          extraObjects: new Map([
            [
              6,
              "<< /Type /Obj#53tm /N 0 /First 0 /Length 0 >>\nstream\n\nendstream",
            ],
          ]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects a PDF carrying a rich-media annotation", async () => {
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          extraObjects: new Map([
            [
              6,
              "<< /Type /Annot /Subtype /RichMedia /Rect [0 0 20 20] /RichMediaContent << /Assets << /Names [] >> >> /RichMediaSettings << >> >>",
            ],
          ]),
          pageExtra: ["/Annots [6 0 R]"],
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects a PDF carrying an embedded file", async () => {
    const embeddedContent = encoder.encode("fictional attachment content");
    await expect(
      extractPdfText(
        createPdf(["Visible fictional evidence"], {
          catalogExtra:
            "/Names << /EmbeddedFiles << /Names [(fictional.txt) 6 0 R] >> >>",
          extraObjects: new Map<number, Uint8Array | string>([
            [
              6,
              "<< /Type /Filespec /F (fictional.txt) /UF (fictional.txt) /EF << /F 7 0 R >> >>",
            ],
            [
              7,
              concatenateBytes([
                encoder.encode(
                  `<< /Length ${embeddedContent.length} >>\nstream\n`,
                ),
                embeddedContent,
                encoder.encode("\nendstream"),
              ]),
            ],
          ]),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it.each(["AF", "A#46"])(
    "rejects a PDF carrying a catalog associated-file entry named /%s",
    async (associatedFileName) => {
      const associatedContent = encoder.encode(
        "fictional catalog-associated content",
      );

      await expect(
        extractPdfText(
          createPdf(["Visible fictional evidence"], {
            catalogExtra: `/${associatedFileName} [6 0 R]`,
            extraObjects: new Map<number, Uint8Array | string>([
              [
                6,
                "<< /Type /Filespec /F (fictional-associated.txt) /UF (fictional-associated.txt) /AFRelationship /Data /EF << /F 7 0 R >> >>",
              ],
              [
                7,
                concatenateBytes([
                  encoder.encode(
                    `<< /Type /EmbeddedFile /Length ${associatedContent.length} >>\nstream\n`,
                  ),
                  associatedContent,
                  encoder.encode("\nendstream"),
                ]),
              ],
            ]),
          }),
        ),
      ).rejects.toMatchObject({ code: "invalid_file" });
    },
  );

  it.each(["XFA", "X#46A"])(
    "rejects a PDF carrying form data named /%s",
    async (xfaName) => {
      const formData = encoder.encode(
        "<fictional-form><claim>untrusted</claim></fictional-form>",
      );

      await expect(
        extractPdfText(
          createPdf(["Visible fictional evidence"], {
            catalogExtra: "/AcroForm 6 0 R",
            extraObjects: new Map<number, Uint8Array | string>([
              [6, `<< /Fields [] /${xfaName} 7 0 R >>`],
              [
                7,
                concatenateBytes([
                  encoder.encode(`<< /Length ${formData.length} >>\nstream\n`),
                  formData,
                  encoder.encode("\nendstream"),
                ]),
              ],
            ]),
          }),
        ),
      ).rejects.toMatchObject({ code: "invalid_file" });
    },
  );

  it("does not confuse normal appearance names with associated-file syntax", async () => {
    const result = await extractPdfText(
      createPdf(["Visible fictional evidence"], {
        catalogExtra: "/AP << /AS /Normal >>",
      }),
    );

    expect(result.text).toContain("Visible fictional evidence");
  });

  it("rejects text hidden by zero fill opacity", async () => {
    await expect(
      extractPdfText(
        createPdf(["unused"], {
          pageOperations: [
            "/GS0 gs BT /F1 10 Tf 72 720 Td (Zero-opacity fictional claim) Tj ET",
          ],
          pageResourcesExtra: [
            "/ExtGState << /GS0 << /Type /ExtGState /ca 0 >> >>",
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects text inside an optional-content group disabled by the catalog", async () => {
    await expect(
      extractPdfText(
        createPdf(["unused"], {
          catalogExtra:
            "/OCProperties << /OCGs [6 0 R] /D << /BaseState /ON /OFF [6 0 R] /Order [6 0 R] >> >>",
          extraObjects: new Map([
            [6, "<< /Type /OCG /Name (Disabled fictional layer) >>"],
          ]),
          pageOperations: [
            "BT /F1 10 Tf 72 720 Td (Visible fictional evidence) Tj ET\n" +
              "/OC /OC1 BDC\n" +
              "BT /F1 10 Tf 72 700 Td (Disabled-layer fictional claim) Tj ET\n" +
              "EMC",
          ],
          pageResourcesExtra: ["/Properties << /OC1 6 0 R >>"],
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("accepts text inside an optional-content group enabled by the catalog", async () => {
    const result = await extractPdfText(
      createPdf(["unused"], {
        catalogExtra:
          "/OCProperties << /OCGs [6 0 R] /D << /BaseState /ON /ON [6 0 R] /Order [6 0 R] >> >>",
        extraObjects: new Map([
          [6, "<< /Type /OCG /Name (Visible fictional layer) >>"],
        ]),
        pageOperations: [
          "BT /F1 10 Tf 72 720 Td (Visible fictional evidence) Tj ET\n" +
            "/OC /OC1 BDC\n" +
            "BT /F1 10 Tf 72 700 Td (Visible-layer fictional evidence) Tj ET\n" +
            "EMC",
        ],
        pageResourcesExtra: ["/Properties << /OC1 6 0 R >>"],
      }),
    );

    expect(result.text).toContain("Visible fictional evidence");
    expect(result.text).toContain("Visible-layer fictional evidence");
  });

  it.each([
    {
      name: "an unknown optional-content reference",
      fnArray: [70, 44, 71],
      argsArray: [
        ["OC", { type: "OCG", id: "unknown-fictional-group" }],
        [[]],
        [],
      ],
      optionalContentConfig: {
        getGroup: vi.fn(() => null),
        isVisible: vi.fn(() => false),
      },
    },
    {
      name: "an unsupported optional-content membership dictionary",
      fnArray: [70, 44, 71],
      argsArray: [
        [
          "OC",
          {
            type: "OCMD",
            ids: ["fictional-group"],
            policy: "AnyOn",
          },
        ],
        [[]],
        [],
      ],
      optionalContentConfig: {
        getGroup: vi.fn(() => ({ id: "fictional-group" })),
        isVisible: vi.fn(() => true),
      },
    },
    {
      name: "an unclosed optional-content scope",
      fnArray: [70, 44],
      argsArray: [["OC", { type: "OCG", id: "fictional-group" }], [[]]],
      optionalContentConfig: {
        getGroup: vi.fn(() => ({ id: "fictional-group" })),
        isVisible: vi.fn(() => true),
      },
    },
    {
      name: "an unmatched marked-content terminator",
      fnArray: [71, 44],
      argsArray: [[], [[]]],
      optionalContentConfig: {
        getGroup: vi.fn(() => ({ id: "fictional-group" })),
        isVisible: vi.fn(() => true),
      },
    },
  ])("rejects $name", async ({ fnArray, argsArray, optionalContentConfig }) => {
    const page = {
      ...safePdfPageSecuritySurface(),
      cleanup: vi.fn(),
      getOperatorList: vi.fn(async () => ({ fnArray, argsArray })),
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
                    str: "Optional-content fictional claim",
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
    const document = {
      ...safePdfDocumentSecuritySurface(),
      destroy: vi.fn(async () => undefined),
      getOptionalContentConfig: vi.fn(async () => optionalContentConfig),
      getPage: vi.fn(async () => page),
      numPages: 1,
    };
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: {
        beginMarkedContent: 69,
        beginMarkedContentProps: 70,
        endMarkedContent: 71,
        nextLineSetSpacingShowText: 47,
        nextLineShowText: 46,
        setFillTransparent: 93,
        setGState: 9,
        setStrokeTransparent: 92,
        setTextRenderingMode: 38,
        showSpacedText: 45,
        showText: 44,
      },
      getDocument: () => ({
        destroy: vi.fn(async () => undefined),
        promise: Promise.resolve(document),
      }),
    } as unknown as ResolvedPdfJs);

    await expect(
      extractPdfText(createPdf(["Fictional evidence"])),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("rejects PDF.js transparent-fill operator state", async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const page = {
      ...safePdfPageSecuritySurface(),
      cleanup: vi.fn(),
      getOperatorList: vi.fn(async () => ({
        fnArray: [93],
        argsArray: [[]],
      })),
      streamTextContent: vi.fn(() => ({
        getReader: () => ({
          cancel,
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: {
                items: [
                  {
                    str: "Transparent-state fictional claim",
                    hasEOL: false,
                    width: 200,
                    height: 10,
                    transform: [1, 0, 0, 10, 72, 720],
                  },
                ],
              },
            })
            .mockResolvedValue({ done: true, value: undefined }),
          releaseLock,
        }),
      })),
      view: [0, 0, 612, 792],
    };
    const document = {
      ...safePdfDocumentSecuritySurface(),
      destroy: vi.fn(async () => undefined),
      getPage: vi.fn(async () => page),
      numPages: 1,
    };
    unpdfMock.getResolvedPdfJs.mockResolvedValue({
      OPS: {
        setFillTransparent: 93,
        setGState: 9,
        setStrokeTransparent: 92,
        setTextRenderingMode: 38,
      },
      getDocument: () => ({
        destroy: vi.fn(async () => undefined),
        promise: Promise.resolve(document),
      }),
    } as unknown as ResolvedPdfJs);

    await expect(
      extractPdfText(createPdf(["Fictional evidence"])),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });

  it("destroys the loading task and document when incremental parsing fails", async () => {
    const documentDestroy = vi.fn(async () => undefined);
    const document = {
      ...safePdfDocumentSecuritySurface(),
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
      ...safePdfPageSecuritySurface(),
      cleanup: vi.fn(),
      getOperatorList: vi.fn(async () => ({ fnArray: [], argsArray: [] })),
      streamTextContent: vi.fn(() => ({ getReader: () => reader })),
      view: [0, 0, 612, 792],
    };
    const document = {
      ...safePdfDocumentSecuritySurface(),
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
      ...safePdfPageSecuritySurface(),
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
      ...safePdfDocumentSecuritySurface(),
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
