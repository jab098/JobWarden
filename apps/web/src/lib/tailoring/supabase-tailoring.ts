import "server-only";

import {
  suggestTailoringFocus,
  type TailoringOperation,
} from "@jobwarden/domain";
import {
  extractCvText,
  readDocxParagraphs,
  writeTailoredDocx,
} from "@jobwarden/profile";
import { z } from "zod";

import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";

import {
  TailoringUnavailableError,
  type TailoringRepository,
} from "./repository";
import type { RenderedVariant, TailoringWorkspace } from "./types";

const storageBucket = "career-documents";

const operationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("replace"),
      paragraphIndex: z.number().int().min(0).max(10_000),
      text: z.string().min(1).max(4_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("omit"),
      paragraphIndex: z.number().int().min(0).max(10_000),
    })
    .strict(),
]);

const operationsSchema = z.array(operationSchema).max(500);

const jobRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  description_text: z.string().max(100_000),
});

const variantRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  status: z.enum(["draft", "saved"]),
  operations: operationsSchema,
  expires_at: z.string().nullable(),
  cv_document_id: z.string().uuid(),
});

type QueryResponse = { data: unknown; error: unknown };

type TailoringClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<QueryResponse>;
        order(
          column: string,
          options: { ascending: boolean },
        ): { limit(count: number): Promise<QueryResponse> };
      };
    };
  };
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<QueryResponse>;
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new TailoringUnavailableError("unavailable");
  }
  return response.data;
}

export function createSupabaseTailoringRepository(
  client: object,
): TailoringRepository {
  const supabaseClient = client as TailoringClient;
  const profileRepository = createSupabaseProfileRepository(client);

  async function readJob(jobId: string) {
    const response = await supabaseClient
      .from("jobs")
      .select("id,title,employer,description_text")
      .eq("id", jobId)
      .maybeSingle();
    const row = jobRowSchema.nullable().parse(data(response) ?? null);
    if (row === null) throw new TailoringUnavailableError("job_not_found");
    return row;
  }

  async function readVariant(variantId: string) {
    const response = await supabaseClient
      .from("career_cv_variants")
      .select("id,name,status,operations,expires_at,cv_document_id")
      .eq("id", variantId)
      .maybeSingle();
    const row = variantRowSchema.nullable().parse(data(response) ?? null);
    if (row === null) throw new TailoringUnavailableError("variant_not_found");
    return row;
  }

  /**
   * Reads the stored original. Every caller works from these bytes and writes a
   * new archive, so the user's own document is never the thing being edited.
   */
  async function readSourceBytes(storagePath: string): Promise<Uint8Array> {
    const { data: blob, error } = await supabaseClient.storage
      .from(storageBucket)
      .download(storagePath);
    if (error !== null && error !== undefined) {
      throw new TailoringUnavailableError("source_unavailable");
    }
    if (blob === null)
      throw new TailoringUnavailableError("source_unavailable");
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function currentDocxSource() {
    const snapshot = await profileRepository.getSnapshot();
    const cv = snapshot.currentCv;
    if (cv === null)
      return { snapshot, source: null, reason: "no_cv" as const };
    if (cv.kind !== "docx") {
      return { snapshot, source: null, reason: "pdf_only" as const };
    }
    return { snapshot, source: cv, reason: null as never };
  }

  return {
    async getWorkspace(jobId: string): Promise<TailoringWorkspace> {
      const job = await readJob(jobId);
      const { snapshot, source, reason } = await currentDocxSource();

      if (source === null) {
        return {
          job: { id: job.id, title: job.title, employer: job.employer },
          source: { available: false, reason },
          paragraphs: [],
          cvText: "",
          jobText: job.description_text,
          focus: { relevant: [], omissionCandidates: [] },
          variant: null,
          dataMode: snapshot.dataMode,
        };
      }

      const storagePathResponse = await supabaseClient
        .from("cv_documents")
        .select("storage_path")
        .eq("id", source.id)
        .maybeSingle();
      const storagePath = z
        .object({ storage_path: z.string().min(1).max(500) })
        .nullable()
        .parse(data(storagePathResponse) ?? null);
      if (storagePath === null) {
        throw new TailoringUnavailableError("source_unavailable");
      }

      const bytes = await readSourceBytes(storagePath.storage_path);
      const paragraphs = readDocxParagraphs(bytes);
      const extracted = await extractCvText({
        fileName: source.fileName,
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind: "docx",
        bytes,
      });

      const variantResponse = await supabaseClient
        .from("career_cv_variants")
        .select("id,name,status,operations,expires_at,cv_document_id")
        .eq("job_id", jobId)
        .order("updated_at", { ascending: false })
        .limit(1);
      const variantRows = z
        .array(variantRowSchema)
        .max(1)
        .parse(data(variantResponse) ?? []);

      return {
        job: { id: job.id, title: job.title, employer: job.employer },
        source: {
          available: true,
          documentId: source.id,
          fileName: source.fileName,
        },
        paragraphs,
        cvText: extracted.text,
        jobText: job.description_text,
        focus: suggestTailoringFocus({
          paragraphs,
          jobText: job.description_text,
          confirmedConcepts: snapshot.evidence
            .filter((item) => item.confirmationState === "confirmed")
            .map((item) => item.normalizedConcept),
        }),
        variant:
          variantRows[0] === undefined
            ? null
            : {
                id: variantRows[0].id,
                name: variantRows[0].name,
                status: variantRows[0].status,
                operations: variantRows[0].operations,
                expiresAt: variantRows[0].expires_at,
              },
        dataMode: snapshot.dataMode,
      };
    },

    async saveVariant({ jobId, name, operations }) {
      const { source } = await currentDocxSource();
      if (source === null) {
        throw new TailoringUnavailableError("source_unavailable");
      }

      const parsed = operationsSchema.parse(operations);
      const result = data(
        await supabaseClient.rpc("save_cv_variant", {
          target_document_id: source.id,
          target_job_id: z.string().uuid().parse(jobId),
          variant_name: z.string().trim().min(1).max(120).parse(name),
          operations_value: parsed,
        }),
      );
      return z.string().uuid().parse(result);
    },

    async promoteVariant(variantId: string) {
      data(
        await supabaseClient.rpc("promote_cv_variant", {
          target_variant_id: z.string().uuid().parse(variantId),
        }),
      );
    },

    async deleteVariant(variantId: string) {
      data(
        await supabaseClient.rpc("delete_cv_variant", {
          target_variant_id: z.string().uuid().parse(variantId),
        }),
      );
    },

    async renderVariant(variantId: string): Promise<RenderedVariant> {
      const variant = await readVariant(z.string().uuid().parse(variantId));

      const documentResponse = await supabaseClient
        .from("cv_documents")
        .select("storage_path,original_file_name")
        .eq("id", variant.cv_document_id)
        .maybeSingle();
      const document = z
        .object({
          storage_path: z.string().min(1).max(500),
          original_file_name: z.string().min(1).max(255),
        })
        .nullable()
        .parse(data(documentResponse) ?? null);
      if (document === null) {
        throw new TailoringUnavailableError("source_unavailable");
      }

      const bytes = await readSourceBytes(document.storage_path);
      const operations: readonly TailoringOperation[] = variant.operations;

      return {
        fileName: document.original_file_name.replace(
          /\.docx$/iu,
          "-tailored.docx",
        ),
        bytes: writeTailoredDocx(bytes, operations),
      };
    },
  };
}
