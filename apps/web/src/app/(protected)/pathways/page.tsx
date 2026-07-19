import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ExploreView } from "@/components/explore/explore-view";
import { getExploreRepository } from "@/lib/explore/get-repository";

export const metadata: Metadata = { title: "Pathways" };

export default async function PathwaysPage() {
  const result = await (await getExploreRepository()).getExplore();

  return (
    <AppShell dataMode={result.dataMode} activePath="pathways">
      <ExploreView result={result} />
    </AppShell>
  );
}
