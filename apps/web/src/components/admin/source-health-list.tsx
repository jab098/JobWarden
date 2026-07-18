import { formatAdminDate } from "./admin-format";
import type { SourceHealthView } from "@/lib/admin/types";

const metrics = [
  ["Advertised salary", "advertisedCompensation"],
  ["Estimated salary", "estimatedCompensation"],
  ["Salary not stated", "unknownCompensation"],
  ["Permanent", "permanentRoles"],
  ["Contract", "contractRoles"],
  ["Part time", "partTimeRoles"],
] as const;

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
          className="text-xl font-semibold tracking-[-0.025em]"
        >
          Source health
        </h2>
        <p className="mt-1 text-sm text-[#596173]">
          Freshness and active UK-role coverage by permitted source.
        </p>
      </div>
      {sources.length === 0 ? (
        <p className="border-l-2 border-[#9aa7b8] pl-4 text-sm text-[#596173]">
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
                  <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-[#596173]">
                    {source.provider} · {source.coverageMode} coverage
                  </p>
                </div>
                <p className="text-sm text-[#596173]">
                  <span className="font-mono text-[#263248]">
                    {source.activeOccurrences}
                  </span>{" "}
                  active occurrences
                </p>
              </div>
              <p className="mt-3 text-xs text-[#596173]">
                Last successful sync:{" "}
                {source.lastSuccessfulSyncAt
                  ? formatAdminDate(source.lastSuccessfulSyncAt)
                  : "Never"}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {metrics.map(([label, field]) => (
                  <div key={field}>
                    <dt className="text-xs text-[#596173]">{label}</dt>
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
