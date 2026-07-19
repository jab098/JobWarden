import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { TrackApplicationButton } from "@/components/applications/track-application-button";
import { JobDetailView } from "@/components/jobs/job-detail-view";
import { getApplicationsRepository } from "@/lib/applications/get-repository";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { getJobsRepository } from "@/lib/jobs/get-repository";

export const metadata: Metadata = { title: "Job details" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const repository = await getJobsRepository();
  const job = await repository.findById(jobId);
  if (!job) notFound();
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });
  const dataMode = developmentAccess.enabled ? "fixtures" : "supabase";
  const applications = await (
    await getApplicationsRepository()
  ).getApplications();
  const tracked = applications.items.some(
    (application) => application.job?.id === job.id,
  );
  return (
    <AppShell dataMode={dataMode}>
      <div className="mx-auto max-w-[92rem] border-b border-[#dedbd2] bg-white px-5 py-3 sm:px-8">
        <TrackApplicationButton jobId={job.id} tracked={tracked} />
      </div>
      <JobDetailView dataMode={dataMode} job={job} />
    </AppShell>
  );
}
