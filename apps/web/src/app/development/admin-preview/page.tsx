import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessRequestList } from "@/components/admin/access-request-list";
import { AdminShell } from "@/components/admin/admin-shell";
import { IngestionRequestList } from "@/components/admin/ingestion-request-list";
import { IngestionRunList } from "@/components/admin/ingestion-run-list";
import { SourceHealthList } from "@/components/admin/source-health-list";
import { SourceList } from "@/components/admin/source-list";
import { Button } from "@/components/ui/button";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { OperationalHealthPanel } from "@/components/admin/operational-health";
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
      <main className="mx-auto w-full min-w-0 max-w-page px-5 py-7 sm:px-8">
        <header className="mb-12 max-w-3xl">
          <h1 className="break-words text-xl font-semibold tracking-[-0.02em]">
            Administrator operations preview
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-secondary">
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
                className="text-base font-semibold tracking-[-0.01em]"
              >
                Request source sync
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
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
                    <p className="mt-1 font-mono text-xs text-ink-secondary">
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
          <SourceHealthList sources={snapshot.sourceHealth} />
          <IngestionRunList runs={snapshot.runs} />

          <h2 className="mt-12 text-lg font-semibold tracking-[-0.02em]">
            Health
          </h2>
          <OperationalHealthPanel health={snapshot.health} />

          <h2 className="mt-12 text-lg font-semibold tracking-[-0.02em]">
            Audit
          </h2>
          <AuditLogTable entries={snapshot.auditLog} />
        </div>
      </main>
    </AdminShell>
  );
}
