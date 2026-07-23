import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";

import { TrackApplicationButton } from "@/components/applications/track-application-button";
import { JobDetailView } from "@/components/jobs/job-detail-view";
import { getApplicationsRepository } from "@/lib/applications/get-repository";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { getJobsRepository } from "@/lib/jobs/get-repository";
import { getProfileRepository } from "@/lib/profile/get-repository";

export const metadata: Metadata = { title: "Job details" };

/**
 * The reader's own skills, so the job's skills can be marked with the ones they
 * already have. Best-effort: the skills field is an aid, not load-bearing, so a
 * failed or empty profile leaves every skill neutral rather than breaking the
 * page. Skills and tools from confirmed evidence, plus any typed into a search.
 */
async function readUserSkills(): Promise<string[]> {
  try {
    const snapshot = await (await getProfileRepository()).getSnapshot();
    const skills = new Set<string>();
    for (const item of snapshot.evidence) {
      if (
        item.confirmationState === "confirmed" &&
        (item.category === "skill" || item.category === "tool")
      ) {
        skills.add(item.label);
        skills.add(item.normalizedConcept);
      }
    }
    for (const search of snapshot.searches) {
      for (const concept of search.skillConcepts) skills.add(concept);
    }
    return [...skills];
  } catch {
    return [];
  }
}

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
  const [applications, userSkills] = await Promise.all([
    (await getApplicationsRepository()).getApplications(),
    readUserSkills(),
  ]);
  const tracked = applications.items.some(
    (application) => application.job?.id === job.id,
  );
  return (
    <JobDetailView
      dataMode={dataMode}
      job={job}
      userSkills={userSkills}
      actions={
        <>
          <TrackApplicationButton jobId={job.id} tracked={tracked} />
          <Link
            href={`/tailor/${job.id}`}
            className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Tailor my CV for this role
          </Link>
        </>
      }
    />
  );
}
