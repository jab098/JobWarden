import { describe, expect, it } from "vitest";

import {
  inspectCvFile,
  uploadCv,
  type CvUploadClient,
  type CvUploadFile,
} from "./cv-upload";

const userId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const docxSignature = [0x50, 0x4b, 0x03, 0x04];
const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d];

function fileOf(
  name: string,
  signature: readonly number[],
  size = 1024,
): CvUploadFile {
  const bytes = new Uint8Array(size);
  bytes.set(signature.slice(0, size));
  return {
    name,
    size,
    type: "",
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
    slice: () => new Blob([bytes]),
  };
}

type Recorded = { step: string; parameters?: Record<string, unknown> };

function clientOf(
  failures: Partial<Record<"begin" | "upload" | "register", unknown>> = {},
  registerData: unknown = documentId,
) {
  const calls: Recorded[] = [];
  const removed: string[][] = [];
  const client: CvUploadClient = {
    async rpc(name, parameters) {
      calls.push({ step: name, parameters });
      if (name === "begin_career_cv_upload" && failures.begin) {
        return { data: null, error: failures.begin };
      }
      if (name === "register_cv_document") {
        return failures.register
          ? { data: null, error: failures.register }
          : { data: registerData, error: null };
      }
      return { data: null, error: null };
    },
    storage: {
      from(name) {
        expect(name).toBe("career-documents");
        return {
          async upload(path, _body, options) {
            calls.push({ step: "upload", parameters: { path, ...options } });
            return failures.upload
              ? { data: null, error: failures.upload }
              : { data: { path }, error: null };
          },
          async remove(paths) {
            removed.push(paths);
            return { data: null, error: null };
          },
        };
      },
    },
    functions: {
      async invoke(name, options) {
        calls.push({ step: `invoke:${name}`, parameters: options.body });
        return { data: null, error: null };
      },
    },
  };
  return { client, calls, removed };
}

const goodInput = () => ({
  file: fileOf("cv.docx", docxSignature),
  userId,
  generation: 3,
});

describe("inspectCvFile", () => {
  it("rejects an extension the bucket does not accept", () => {
    expect(
      inspectCvFile(
        { name: "cv.txt", size: 10 },
        new Uint8Array(docxSignature),
      ),
    ).toEqual({ rejection: "unsupported_type" });
  });

  it("rejects an empty file", () => {
    expect(
      inspectCvFile({ name: "cv.pdf", size: 0 }, new Uint8Array(pdfSignature)),
    ).toEqual({ rejection: "empty_file" });
  });

  it("rejects a file above the bucket's five mebibyte limit", () => {
    expect(
      inspectCvFile(
        { name: "cv.pdf", size: 5_242_881 },
        new Uint8Array(pdfSignature),
      ),
    ).toEqual({ rejection: "too_large" });
  });

  it("accepts a file exactly at the limit", () => {
    expect(
      inspectCvFile(
        { name: "cv.pdf", size: 5_242_880 },
        new Uint8Array(pdfSignature),
      ),
    ).toEqual({ kind: "pdf" });
  });

  it("rejects a renamed file whose leading bytes contradict its extension", () => {
    expect(
      inspectCvFile(
        { name: "cv.pdf", size: 100 },
        new Uint8Array(docxSignature),
      ),
    ).toEqual({ rejection: "content_mismatch" });
    expect(
      inspectCvFile(
        { name: "cv.docx", size: 100 },
        new Uint8Array(pdfSignature),
      ),
    ).toEqual({ rejection: "content_mismatch" });
  });

  it("reads the extension without regard to case", () => {
    expect(
      inspectCvFile(
        { name: "CV.DOCX", size: 100 },
        new Uint8Array(docxSignature),
      ),
    ).toEqual({ kind: "docx" });
  });
});

describe("uploadCv", () => {
  it("runs begin, upload, register, and extraction in that order", async () => {
    const { client, calls } = clientOf();
    const outcome = await uploadCv(client, goodInput());

    expect(outcome).toEqual({ kind: "uploaded", documentId });
    expect(calls.map((call) => call.step)).toEqual([
      "begin_career_cv_upload",
      "upload",
      "register_cv_document",
      "invoke:extract-career-profile",
    ]);
  });

  it("fences the same generation and path through begin and register", async () => {
    const { client, calls } = clientOf();
    await uploadCv(client, goodInput());

    const begin = calls[0]?.parameters ?? {};
    const upload = calls[1]?.parameters ?? {};
    const register = calls[2]?.parameters ?? {};
    expect(begin.expected_generation).toBe(3);
    expect(register.expected_generation).toBe(3);
    expect(begin.storage_path_value).toBe(upload.path);
    expect(register.storage_path_value).toBe(upload.path);
  });

  it("writes to a path the RPC's own owner and length checks accept", async () => {
    const { client, calls } = clientOf();
    await uploadCv(client, goodInput());

    const path = String(calls[1]?.parameters?.path);
    expect(path.split("/")[0]).toBe(userId);
    expect(path.length).toBeGreaterThanOrEqual(38);
    expect(path.length).toBeLessThanOrEqual(500);
    expect(path).not.toMatch(/(^|\/)\.\.(\/|$)/u);
  });

  it("sends the digest as the extraction idempotency key", async () => {
    const { client, calls } = clientOf();
    await uploadCv(client, goodInput());

    const sha256 = calls[2]?.parameters?.sha256_value;
    const body = calls[3]?.parameters ?? {};
    expect(sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(body.idempotencyKey).toBe(sha256);
    expect(body.cvDocumentId).toBe(documentId);
  });

  it("rejects an invalid file before making any request", async () => {
    const { client, calls } = clientOf();
    const outcome = await uploadCv(client, {
      ...goodInput(),
      file: fileOf("notes.txt", docxSignature),
    });

    expect(outcome).toEqual({ kind: "rejected", reason: "unsupported_type" });
    expect(calls).toEqual([]);
  });

  it("does not register a document when the object never landed", async () => {
    const { client, calls } = clientOf({ upload: { message: "network" } });
    const outcome = await uploadCv(client, goodInput());

    expect(outcome).toEqual({ kind: "failed" });
    expect(calls.map((call) => call.step)).toEqual([
      "begin_career_cv_upload",
      "upload",
    ]);
  });

  it("does not upload when the intent was refused", async () => {
    const { client, calls } = clientOf({ begin: { code: "42501" } });
    const outcome = await uploadCv(client, goodInput());

    expect(outcome).toEqual({ kind: "forbidden" });
    expect(calls.map((call) => call.step)).toEqual(["begin_career_cv_upload"]);
  });

  it("reports a moved generation as retryable rather than failed", async () => {
    const { client } = clientOf({ register: { code: "40001" } });
    expect(await uploadCv(client, goodInput())).toEqual({ kind: "stale" });
  });

  it("reports disabled uploads distinctly from an unexplained failure", async () => {
    const { client } = clientOf({ register: { code: "42501" } });
    expect(await uploadCv(client, goodInput())).toEqual({ kind: "forbidden" });
  });

  it("removes the orphaned object when registration fails", async () => {
    const { client, calls, removed } = clientOf({
      register: { code: "40001" },
    });
    await uploadCv(client, goodInput());

    const path = String(calls[1]?.parameters?.path);
    expect(removed).toEqual([[path]]);
  });

  it("fails rather than reporting success when no document id comes back", async () => {
    const { client, calls } = clientOf({}, null);
    const outcome = await uploadCv(client, goodInput());

    expect(outcome).toEqual({ kind: "failed" });
    expect(calls.map((call) => call.step)).not.toContain(
      "invoke:extract-career-profile",
    );
  });

  it("keeps the file name and storage path out of every outcome", async () => {
    const cases: CvUploadClient[] = [
      clientOf({ begin: { code: "42501" } }).client,
      clientOf({ upload: { message: "boom" } }).client,
      clientOf({ register: { code: "40001" } }).client,
      clientOf({}, null).client,
    ];
    for (const client of cases) {
      const outcome = await uploadCv(client, {
        ...goodInput(),
        file: fileOf("Jane Doe CV.docx", docxSignature),
      });
      const serialised = JSON.stringify(outcome);
      expect(serialised).not.toContain("Jane");
      expect(serialised).not.toContain(userId);
      expect(serialised).not.toContain(".docx");
    }
  });

  it("still reports success when extraction cannot be reached", async () => {
    const { client } = clientOf();
    const failing: CvUploadClient = {
      ...client,
      functions: {
        invoke: () => Promise.reject(new Error("offline")),
      },
    };
    expect(await uploadCv(failing, goodInput())).toEqual({
      kind: "uploaded",
      documentId,
    });
  });
});
