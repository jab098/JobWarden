import type { Metadata } from "next";

import { ExploreView } from "@/components/explore/explore-view";
import { getExploreRepository } from "@/lib/explore/get-repository";

export const metadata: Metadata = { title: "Pathways" };

export default async function PathwaysPage() {
  const result = await (await getExploreRepository()).getExplore();

  return <ExploreView result={result} />;
}
