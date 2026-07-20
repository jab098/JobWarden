import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardRepository } from "@/lib/dashboard/get-repository";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { window: windowParam } = await searchParams;
  // Two windows, both derived from stored records; anything else is 7.
  const windowDays = windowParam === "30" ? 30 : 7;
  const result = await (
    await getDashboardRepository()
  ).getDashboard(windowDays);

  return <DashboardView result={result} />;
}
