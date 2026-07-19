import "server-only";

import {
  suggestTailoringFocus,
  type TailoringOperation,
} from "@jobwarden/domain";
import { readDocxParagraphs, writeTailoredDocx } from "@jobwarden/profile";

import { developmentJobs } from "@/lib/jobs/development-jobs";

import { buildFictionalCvDocx, fictionalCvText } from "./fictional-cv";
import {
  TailoringUnavailableError,
  type TailoringRepository,
} from "./repository";
import type { TailoringWorkspace } from "./types";

export class PreviewTailoringUnavailableError extends Error {
  constructor() {
    super("Tailoring changes are unavailable in this preview.");
    this.name = "PreviewTailoringUnavailableError";
  }
}

const fictionalDocumentId = "c1000000-0000-4000-8000-000000000001";
const fictionalVariantId = "c2000000-0000-4000-8000-000000000001";

/**
 * A frozen fictional draft so the review, warning, and change-summary states are
 * all reachable without a real document.
 */
const fictionalOperations: readonly TailoringOperation[] = Object.freeze([
  Object.freeze({
    paragraphIndex: 9,
    kind: "omit" as const,
  }),
  Object.freeze({
    paragraphIndex: 2,
    kind: "replace" as const,
    text: "Delivered analytics implementation and event instrumentation for 12 product teams.",
  }),
]) as readonly TailoringOperation[];

export function createDevelopmentTailoringRepository(): TailoringRepository {
  return {
    async getWorkspace(jobId: string): Promise<TailoringWorkspace> {
      const job = developmentJobs.find((item) => item.id === jobId);
      if (!job) throw new TailoringUnavailableError("job_not_found");

      const paragraphs = readDocxParagraphs(buildFictionalCvDocx());

      return {
        job: { id: job.id, title: job.title, employer: job.employer },
        source: {
          available: true,
          documentId: fictionalDocumentId,
          fileName: "fictional-cv.docx",
        },
        paragraphs,
        cvText: fictionalCvText,
        jobText: job.descriptionText,
        focus: suggestTailoringFocus({
          paragraphs,
          jobText: job.descriptionText,
          confirmedConcepts: ["analytics implementation", "sql", "dbt"],
        }),
        variant: {
          id: fictionalVariantId,
          name: `Tailored for ${job.employer}`,
          status: "draft",
          operations: fictionalOperations,
          expiresAt: "2026-07-20T12:00:00.000Z",
        },
        dataMode: "fixtures",
      };
    },

    async saveVariant() {
      throw new PreviewTailoringUnavailableError();
    },
    async promoteVariant() {
      throw new PreviewTailoringUnavailableError();
    },
    async deleteVariant() {
      throw new PreviewTailoringUnavailableError();
    },

    async renderVariant(variantId: string) {
      // Downloading is a read, so the preview serves a real generated archive
      // built from the fictional source rather than refusing.
      if (variantId !== fictionalVariantId) {
        throw new TailoringUnavailableError("variant_not_found");
      }
      return {
        fileName: "fictional-cv-tailored.docx",
        bytes: writeTailoredDocx(buildFictionalCvDocx(), fictionalOperations),
      };
    },
  };
}
