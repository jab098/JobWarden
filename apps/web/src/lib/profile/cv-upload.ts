/**
 * Browser-side CV upload orchestration.
 *
 * This runs in the browser and not on the server because the Storage insert
 * policy is `to authenticated` and compares the first path segment to
 * `auth.uid()`. A server action under the development access bypass has no
 * `auth.uid()`, so it cannot satisfy that policy no matter how it is written.
 *
 * The handshake is deliberately four steps. `begin_career_cv_upload` fences one
 * exact path for fifteen minutes, the Storage policy re-checks that intent as
 * the object lands, `register_cv_document` refuses to record a document whose
 * object is not already in the bucket, and only then does extraction start.
 * Every step is authorised independently, so a client that skips one gets
 * nothing.
 */

const bucket = "career-documents";
const maximumBytes = 5_242_880; // Matches the bucket's own file_size_limit.

const fileKinds = {
  docx: {
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // DOCX is a ZIP container, so its first four bytes are the local file
    // header signature.
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  pdf: {
    mediaType: "application/pdf",
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  },
} as const;

export type CvFileKind = keyof typeof fileKinds;

export type CvUploadRejection =
  "unsupported_type" | "empty_file" | "too_large" | "content_mismatch";

export type CvUploadOutcome =
  | {
      kind: "uploaded";
      documentId: string;
      /**
       * Whether the extraction request was actually accepted.
       *
       * The upload and the extraction are separate steps, and the second can
       * fail while the first succeeded. This used to be discarded with
       * `.catch(() => undefined)`, so a failed request left the document at
       * `uploaded` for ever while the surface said "we are reading it now".
       * That is exactly how a missing CORS preflight went unnoticed until an
       * owner uploaded their first real CV.
       */
      extractionStarted: boolean;
    }
  | { kind: "rejected"; reason: CvUploadRejection }
  /** The profile moved under us. The caller refreshes and offers a retry. */
  | { kind: "stale" }
  /** `career_cv_uploads_enabled()` is false, or access is not approved. */
  | { kind: "forbidden" }
  | { kind: "failed" };

type Response = { data: unknown; error: unknown };

export type CvUploadClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<Response>;
  storage: {
    from(name: string): {
      upload(
        path: string,
        body: Blob,
        options: { contentType: string; upsert: boolean },
      ): Promise<Response>;
      remove(paths: string[]): Promise<Response>;
    };
  };
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> },
    ): Promise<Response>;
  };
};

export type CvUploadFile = {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number): Blob;
};

function extensionKind(fileName: string): CvFileKind | null {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".docx")) return "docx";
  if (lowered.endsWith(".pdf")) return "pdf";
  return null;
}

function hasSignature(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Postgres error codes surface on the PostgREST error as `code`. Mapping them
 * here keeps the distinction the database already draws: a stale fence is worth
 * retrying, a permission refusal is not.
 */
function classify(error: unknown): CvUploadOutcome {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code: unknown }).code
      : null;
  if (code === "40001") return { kind: "stale" };
  if (code === "42501") return { kind: "forbidden" };
  return { kind: "failed" };
}

function failed(response: Response): CvUploadOutcome | null {
  const { error } = response;
  if (error === null || error === undefined) return null;
  return classify(error);
}

/**
 * Validates a candidate file without touching the network.
 *
 * The extension decides the declared kind and the leading bytes confirm it. A
 * `.txt` renamed to `.docx` is caught here rather than after it has consumed a
 * Storage object, an extraction run, and a slot against the AI free-tier
 * ceiling.
 */
export function inspectCvFile(
  file: Pick<CvUploadFile, "name" | "size">,
  leadingBytes: Uint8Array,
): { kind: CvFileKind } | { rejection: CvUploadRejection } {
  const kind = extensionKind(file.name);
  if (kind === null) return { rejection: "unsupported_type" };
  if (file.size === 0) return { rejection: "empty_file" };
  if (file.size > maximumBytes) return { rejection: "too_large" };
  if (!hasSignature(leadingBytes, fileKinds[kind].signature)) {
    return { rejection: "content_mismatch" };
  }
  return { kind };
}

/**
 * Runs the upload handshake.
 *
 * Errors are returned, never thrown, and never carry the file name, the storage
 * path, or any file content. CV bytes are private user data and an error string
 * is the easiest way for them to reach a log.
 */
export async function uploadCv(
  client: CvUploadClient,
  input: {
    file: CvUploadFile;
    userId: string;
    generation: number;
  },
): Promise<CvUploadOutcome> {
  const { file, userId, generation } = input;

  // Read once: the same buffer answers the signature check, the digest, and the
  // upload body.
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { kind: "failed" };
  }

  const inspection = inspectCvFile(file, new Uint8Array(bytes.slice(0, 8)));
  if ("rejection" in inspection) {
    return { kind: "rejected", reason: inspection.rejection };
  }
  const { kind } = inspection;
  const { mediaType } = fileKinds[kind];

  // Web Crypto is available wherever a Supabase session is, so this failing is
  // close to impossible — but the contract above says errors are returned and
  // never thrown, and an unguarded await here would quietly make that untrue.
  let path: string;
  let sha256: string;
  try {
    path = `${userId}/${crypto.randomUUID()}.${kind}`;
    sha256 = await sha256Hex(bytes);
  } catch {
    return { kind: "failed" };
  }

  const begun = await client.rpc("begin_career_cv_upload", {
    expected_generation: generation,
    storage_path_value: path,
  });
  const beginFailure = failed(begun);
  if (beginFailure) return beginFailure;

  const store = client.storage.from(bucket);
  const uploaded = await store.upload(
    path,
    new Blob([bytes], { type: mediaType }),
    {
      contentType: mediaType,
      // The path carries a fresh UUID, so a collision means something is wrong
      // rather than something to overwrite.
      upsert: false,
    },
  );
  const uploadFailure = failed(uploaded);
  if (uploadFailure) return uploadFailure;

  const registered = await client.rpc("register_cv_document", {
    expected_generation: generation,
    storage_path_value: path,
    original_file_name_value: file.name,
    file_kind_value: kind,
    media_type_value: mediaType,
    byte_size_value: file.size,
    sha256_value: sha256,
  });
  const registerFailure = failed(registered);
  if (registerFailure) {
    // The object landed but nothing references it. Without this the retry
    // writes to a new UUID and the orphan survives until the user deletes their
    // whole profile.
    await store.remove([path]).catch(() => undefined);
    return registerFailure;
  }

  const documentId = registered.data;
  if (typeof documentId !== "string") return { kind: "failed" };

  // Extraction is still fire-and-forget — a failure here leaves a document in
  // `uploaded` that the user can retry, not a lost upload — but the outcome is
  // now reported rather than discarded, so the surface can stop claiming the
  // CV is being read when nothing is reading it.
  //
  // Both shapes count as failure: `invoke` returns `{ error }` for an HTTP
  // fault and throws outright for a network or CORS one, and it was the second
  // that went unseen.
  let extractionStarted = false;
  try {
    const invoked = await client.functions.invoke("extract-career-profile", {
      body: {
        cvDocumentId: documentId,
        // The document id, not the file's SHA-256. `cv_extraction_runs` is
        // unique on (user_id, idempotency_key), and the claim returns the
        // existing run when the key matches — so keying on content meant a
        // failed extraction could never be retried with the same file. The
        // owner whose first CV failed re-uploaded it twice and got no run at
        // all, silently.
        //
        // A document id is the right granularity: every upload registers a new
        // document, so a retry is a new attempt, while two invokes for the
        // same document still deduplicate.
        idempotencyKey: documentId,
      },
    });
    extractionStarted = !invoked.error;
  } catch {
    extractionStarted = false;
  }

  return { kind: "uploaded", documentId, extractionStarted };
}
