import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";

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
    <>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 sm:px-6">
        <TrackApplicationButton jobId={job.id} tracked={tracked} />
        <Link
          href={`/tailor/${job.id}`}
          className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Tailor my CV for this role
        </Link>
      </div>
      <JobDetailView dataMode={dataMode} job={job} />
    </>
  );
}
