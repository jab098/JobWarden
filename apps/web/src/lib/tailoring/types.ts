import type { DocxParagraph, TailoringOperation } from "@jobwarden/domain";

export type TailoringSource =
  | { available: true; documentId: string; fileName: string }
  | { available: false; reason: "no_cv" | "pdf_only" };

export type TailoringVariant = {
  id: string;
  name: string;
  status: "draft" | "saved";
  operations: readonly TailoringOperation[];
  expiresAt: string | null;
};

export type TailoringWorkspace = {
  job: { id: string; title: string; employer: string };
  source: TailoringSource;
  paragraphs: readonly DocxParagraph[];
  /** Full extracted CV text, used only to check proposals — never rendered. */
  cvText: string;
  jobText: string;
  focus: {
    relevant: readonly number[];
    omissionCandidates: readonly number[];
  };
  variant: TailoringVariant | null;
  dataMode: "supabase" | "fixtures";
};

export type RenderedVariant = {
  fileName: string;
  bytes: Uint8Array;
};

export type TailoringActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string; resourceId?: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };
