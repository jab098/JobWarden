import type { Metadata } from "next";

import {
  ApplicationsViewPage,
  resolveApplicationsView,
} from "@/components/applications/applications-view";
import { getApplicationsRepository } from "@/lib/applications/get-repository";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = resolveApplicationsView(params.view);
  const result = await (await getApplicationsRepository()).getApplications();

  return <ApplicationsViewPage result={result} view={view} />;
}
