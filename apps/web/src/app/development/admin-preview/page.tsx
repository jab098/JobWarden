import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessRequestList } from "@/components/admin/access-request-list";
import { AdminShell } from "@/components/admin/admin-shell";
import { IngestionRequestList } from "@/components/admin/ingestion-request-list";
import { IngestionRunList } from "@/components/admin/ingestion-run-list";
import { SourceList } from "@/components/admin/source-list";
import { Button } from "@/components/ui/button";
import { getDevelopmentAdminSnapshot } from "@/lib/admin/development-admin";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fictional administrator preview | JobWarden",
};

export default async function DevelopmentAdminPreview() {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });
  if (!developmentAccess.enabled) notFound();

  const snapshot = getDevelopmentAdminSnapshot();
  const enabledSources = snapshot.sources.filter((source) => source.enabled);

  return (
    <AdminShell preview>
      <main className="mx-auto w-full min-w-0 max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <header className="mb-12 max-w-3xl">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
            Fictional local data
          </p>
          <h1 className="mt-3 break-words text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Administrator operations preview
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#596173]">
            A visual review surface for access decisions, lawful source
            controls, and ingestion outcomes. It has no production identity and
            cannot change stored data.
          </p>
        </header>

        <div className="space-y-16">
          <div id="access" className="scroll-mt-16">
            <AccessRequestList
              requests={[...snapshot.accessRequests]}
              requestsEnabled={snapshot.accessRequestsEnabled}
              readOnly
            />
          </div>

          <div id="sources" className="scroll-mt-16">
            <SourceList sources={snapshot.sources} readOnly />
          </div>

          <section
            id="ingestion"
            aria-labelledby="preview-sync-heading"
            className="scroll-mt-16 space-y-4"
          >
            <div>
              <h2
                id="preview-sync-heading"
                className="text-xl font-semibold tracking-[-0.025em]"
              >
                Request source sync
              </h2>
              <p className="mt-1 text-sm text-[#596173]">
                Preview controls are intentionally inert.
              </p>
            </div>
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
                  <Button type="button" size="sm" variant="outline" disabled>
                    Request sync
                  </Button>
                </article>
              ))}
            </div>
          </section>

          <IngestionRequestList requests={snapshot.ingestionRequests} />
          <IngestionRunList runs={snapshot.runs} />
        </div>
      </main>
    </AdminShell>
  );
}
