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
    <main className="mx-auto max-w-page px-5 py-7 sm:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Ingestion</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
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
              className="text-base font-semibold tracking-[-0.01em]"
            >
              Request source sync
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Each request is coalesced and respects its configured minimum
              interval.
            </p>
          </div>
          {enabledSources.length === 0 ? (
            <p className="text-sm text-ink-secondary">
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
                    <p className="mt-1 font-mono text-xs text-ink-secondary">
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
