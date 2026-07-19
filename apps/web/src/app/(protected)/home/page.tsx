import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardRepository } from "@/lib/dashboard/get-repository";

export const metadata: Metadata = { title: "Home" };

const defaultWindowDays = 7;

export default async function HomePage() {
  const result = await (
    await getDashboardRepository()
  ).getDashboard(defaultWindowDays);

  return (
    <AppShell dataMode={result.dataMode} activePath="home">
      <DashboardView result={result} />
    </AppShell>
  );
}
