import { notFound, redirect } from "next/navigation";

import {
  clearPreviewJourney,
  newPreviewJourney,
  previewJourneyEnabled,
  writePreviewJourney,
} from "@/lib/development/preview-journey";

export const dynamic = "force-dynamic";

/**
 * Starts, restarts, or ends the fictional review walkthrough.
 *
 * `GET /development/journey` begins a run and drops into the first onboarding
 * step. `?restart=1` throws away the run in progress first, so the flow can be
 * walked repeatedly and down either branch. `?exit=1` ends it and returns the
 * ordinary populated preview.
 *
 * Not reachable outside the documented local bypass: `previewJourneyEnabled`
 * re-checks it, and `resolveDevelopmentAccessMode` beneath throws outside
 * `NODE_ENV=development` rather than quietly allowing a deployed build to serve
 * this. Nothing here reads or writes a real record.
 */
export async function GET(request: Request): Promise<Response> {
  if (!previewJourneyEnabled()) notFound();

  const { searchParams } = new URL(request.url);

  if (searchParams.get("exit") === "1") {
    await clearPreviewJourney();
    redirect("/home");
  }

  await clearPreviewJourney();
  await writePreviewJourney(newPreviewJourney());
  redirect("/onboarding");
}
