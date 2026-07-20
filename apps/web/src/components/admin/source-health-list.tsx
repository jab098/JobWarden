import { formatAdminDate } from "./admin-format";
import type { SourceHealthView } from "@/lib/admin/types";

const metrics = [
  ["Advertised salary", "advertisedCompensation"],
  ["Estimated salary", "estimatedCompensation"],
  ["Salary not stated", "unknownCompensation"],
  ["Permanent", "permanentRoles"],
  ["Contract", "contractRoles"],
  ["Temporary", "temporaryRoles"],
  ["Full time", "fullTimeRoles"],
  ["Part time", "partTimeRoles"],
] as const;

const freshnessLabel = {
  fresh: "Fresh",
  stale: "Stale",
  failed: "Latest run failed",
  never: "Never synced",
  disabled: "Disabled",
} as const;

export function SourceHealthList({
  sources,
}: {
  sources: readonly SourceHealthView[];
}) {
  return (
    <section aria-labelledby="source-health-heading" className="space-y-4">
      <div>
        <h2
          id="source-health-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Source health
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Freshness and active UK-role coverage by permitted source.
        </p>
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          No source health is available yet.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {sources.map((source) => (
            <article
              key={source.sourceId}
              className="py-5 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{source.employerName}</h3>
                  <p className="mt-1 font-mono text-xs text-ink-secondary">
                    {source.provider} ·{" "}
                    {source.coverageMode === "complete"
                      ? "complete snapshot source"
                      : "incremental indexed coverage"}
                  </p>
                </div>
                <p className="text-sm text-ink-secondary">
                  <span className="font-mono text-foreground">
                    {source.activeOccurrences}
                  </span>{" "}
                  active occurrences
                </p>
              </div>
              <p className="mt-3 text-xs text-ink-secondary">
                {freshnessLabel[source.freshnessState]} · Last successful sync:{" "}
                {source.lastSuccessfulSyncAt
                  ? formatAdminDate(source.lastSuccessfulSyncAt)
                  : "Never"}
                {source.latestRunStatus
                  ? ` · Latest run: ${source.latestRunStatus}`
                  : ""}
                {source.latestErrorCode ? ` · ${source.latestErrorCode}` : ""}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4 xl:grid-cols-8">
                {metrics.map(([label, field]) => (
                  <div key={field}>
                    <dt className="text-xs text-ink-secondary">{label}</dt>
                    <dd className="mt-0.5 font-mono">{source[field]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
