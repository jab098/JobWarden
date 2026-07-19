import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getOnboardingRepository } from "@/lib/onboarding/get-repository";

export const metadata: Metadata = { title: "Set up JobWarden" };

export default async function OnboardingPage() {
  const view = await (await getOnboardingRepository()).getView();

  // Already finished: nothing to do here, and lingering would be confusing.
  if (view.complete) redirect("/home");

  return <OnboardingFlow view={view} />;
}
