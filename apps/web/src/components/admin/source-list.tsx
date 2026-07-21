import { Disclosure } from "@/components/ui/disclosure";

import { AdminStatus } from "./admin-status";
import { formatAdminDate } from "./admin-format";
import { SourceForm } from "./source-form";
import type { AdminFormAction, JobSourceView } from "@/lib/admin/types";

export function SourceList({
  sources,
  saveAction,
  readOnly = false,
}: {
  sources: readonly JobSourceView[];
  saveAction?: AdminFormAction;
  readOnly?: boolean;
}) {
  return (
    <section aria-labelledby="sources-heading" className="space-y-5">
      <div className="border-b border-border pb-5">
        <h2
          id="sources-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Permitted sources
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Only reviewed, allowlisted public interfaces belong here.
        </p>
      </div>
      {!readOnly && saveAction ? (
        <Disclosure
          label="Add a Greenhouse source"
          className="bg-white"
          panelClassName="px-5 py-4"
        >
          <SourceForm action={saveAction} />
        </Disclosure>
      ) : null}
      {sources.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          No permitted job sources have been configured.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {sources.map((source) => (
            <article
              key={source.sourceId}
              className="py-5 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{source.employerName}</h3>
                    <AdminStatus
                      state={source.enabled ? "enabled" : "disabled"}
                    />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-secondary">
                    {source.provider} / {source.boardToken} ·{" "}
                    {source.coverageMode === "complete"
                      ? "complete snapshot source"
                      : "incremental indexed coverage"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminStatus state={source.termsReviewState} />
                  <AdminStatus state={source.robotsReviewState} />
                </div>
              </div>
              <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs text-ink-secondary">Cadence</dt>
                  <dd className="mt-0.5">
                    Every {source.minimumSyncMinutes} minutes
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">
                    Last successful sync
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {formatAdminDate(source.lastSuccessfulSyncAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">
                    Terms / robots review
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {source.termsReviewedAt} / {source.robotsReviewedAt}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">Allowed hosts</dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {source.allowedHosts.join(", ")}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[#4f5869]">
                {source.complianceNotes}
              </p>
              {!readOnly &&
              saveAction &&
              (source.provider === "greenhouse" ||
                source.provider === "lever" ||
                source.provider === "ashby" ||
                source.provider === "workable") ? (
                <Disclosure
                  label="Edit source configuration"
                  className="mt-4"
                  panelClassName="px-3.5 py-3.5"
                >
                  <SourceForm action={saveAction} source={source} />
                </Disclosure>
              ) : (
                <p className="mt-4 border-t border-[#e3dfd7] pt-4 text-xs text-ink-secondary">
                  National discovery sources are environment-managed and
                  read-only here.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
