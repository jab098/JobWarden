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
      <div className="border-b border-[#d8d4cb] pb-5">
        <h2
          id="sources-heading"
          className="text-xl font-semibold tracking-[-0.025em]"
        >
          Permitted sources
        </h2>
        <p className="mt-1 text-sm text-[#596173]">
          Only reviewed, allowlisted public interfaces belong here.
        </p>
      </div>
      {!readOnly && saveAction ? (
        <details className="border-l-2 border-[#2458a6] bg-white px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Add a Greenhouse source
          </summary>
          <div className="mt-5">
            <SourceForm action={saveAction} />
          </div>
        </details>
      ) : null}
      {sources.length === 0 ? (
        <p className="border-l-2 border-[#9aa7b8] pl-4 text-sm text-[#596173]">
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
                  <p className="mt-1 font-mono text-xs text-[#596173]">
                    greenhouse / {source.boardToken}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminStatus state={source.termsReviewState} />
                  <AdminStatus state={source.robotsReviewState} />
                </div>
              </div>
              <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs text-[#596173]">Cadence</dt>
                  <dd className="mt-0.5">
                    Every {source.minimumSyncMinutes} minutes
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#596173]">
                    Last successful sync
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {formatAdminDate(source.lastSuccessfulSyncAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#596173]">
                    Terms / robots review
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {source.termsReviewedAt} / {source.robotsReviewedAt}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#596173]">Allowed hosts</dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {source.allowedHosts.join(", ")}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[#4f5869]">
                {source.complianceNotes}
              </p>
              {!readOnly && saveAction ? (
                <details className="mt-4 border-t border-[#e3dfd7] pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-[#2458a6]">
                    Edit source configuration
                  </summary>
                  <div className="mt-5">
                    <SourceForm action={saveAction} source={source} />
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
