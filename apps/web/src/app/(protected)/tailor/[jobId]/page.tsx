import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TailoringWorkspaceView } from "@/components/tailoring/tailoring-workspace";
import { getTailoringRepository } from "@/lib/tailoring/get-repository";
import { TailoringUnavailableError } from "@/lib/tailoring/repository";
import type { TailoringWorkspace } from "@/lib/tailoring/types";

export const metadata: Metadata = { title: "Tailor CV" };

/** Resolved before any JSX exists, so rendering errors reach the error boundary. */
async function loadWorkspace(jobId: string): Promise<TailoringWorkspace> {
  try {
    return await (await getTailoringRepository()).getWorkspace(jobId);
  } catch (error) {
    if (
      error instanceof TailoringUnavailableError &&
      error.reason === "job_not_found"
    ) {
      notFound();
    }
    throw error;
  }
}

export default async function TailorPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const workspace = await loadWorkspace(jobId);

  return <TailoringWorkspaceView workspace={workspace} />;
}
