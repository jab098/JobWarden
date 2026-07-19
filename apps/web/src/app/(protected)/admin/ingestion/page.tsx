import type { Metadata } from "next";

import { IngestionRequestForm } from "@/components/admin/ingestion-request-form";
import { IngestionRequestList } from "@/components/admin/ingestion-request-list";
import { IngestionRunList } from "@/components/admin/ingestion-run-list";
import { SourceHealthList } from "@/components/admin/source-health-list";
import { getAdminRepository } from "@/lib/admin/get-repository";
import { requestIngestionAction } from "./actions";

export const metadata: Metadata = {
  title: "Ingestion | JobWarden administration",
};

export default async function IngestionPage() {
  const repository = await getAdminRepository();
  const [sources, sourceHealth, runs, requests] = await Promise.all([
    repository.listSources(),
    repository.listSourceHealth(),
    repository.listIngestionRuns(50),
    repository.listIngestionRequests(20),
  ]);
  const enabledSources = sources.filter((source) => source.enabled);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="mb-10 max-w-2xl">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
          Administrator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          Ingestion
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#596173]">
          Inspect collection outcomes and request a bounded source refresh
          without fetching inside this page request.
        </p>
      </header>
      <div className="space-y-12">
        <SourceHealthList sources={sourceHealth} />
        <section aria-labelledby="request-sync-heading" className="space-y-4">
          <div>
            <h2
              id="request-sync-heading"
              className="text-xl font-semibold tracking-[-0.025em]"
            >
              Request source sync
            </h2>
            <p className="mt-1 text-sm text-[#596173]">
              Each request is coalesced and respects its configured minimum
              interval.
            </p>
          </div>
          {enabledSources.length === 0 ? (
            <p className="text-sm text-[#596173]">
              No enabled source is available for a manual request.
            </p>
          ) : (
            <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
              {enabledSources.map((source) => (
                <article
                  key={source.sourceId}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <h3 className="font-medium">{source.employerName}</h3>
                    <p className="mt-1 font-mono text-xs text-[#596173]">
                      Every {source.minimumSyncMinutes} minutes
                    </p>
                  </div>
                  <IngestionRequestForm
                    sourceId={source.sourceId}
                    action={requestIngestionAction}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
        <IngestionRequestList requests={requests} />
        <IngestionRunList runs={runs} />
      </div>
    </main>
  );
}
