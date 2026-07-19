import { AdminStatus } from "./admin-status";
import { formatAdminDate, formatDuration, shortId } from "./admin-format";
import type { IngestionRunView } from "@/lib/admin/types";

const countFields = [
  ["Received", "receivedCount"],
  ["Eligible", "eligibleCount"],
  ["Upserted", "upsertedCount"],
  ["Unchanged", "unchangedCount"],
  ["Closed", "closedCount"],
] as const;

export function IngestionRunList({
  runs,
}: {
  runs: readonly IngestionRunView[];
}) {
  return (
    <section aria-labelledby="ingestion-runs-heading" className="space-y-4">
      <div>
        <h2
          id="ingestion-runs-heading"
          className="text-xl font-semibold tracking-[-0.025em]"
        >
          Recent source runs
        </h2>
        <p className="mt-1 text-sm text-[#596173]">
          Complete counts and sanitised failure codes only; provider payloads
          are never shown.
        </p>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-[#596173]">
          No ingestion runs have been recorded.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {runs.map((run) => (
            <article key={run.id} className="py-5 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{run.employerName}</h3>
                    <AdminStatus state={run.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-[#596173]">
                    {run.triggerType} · {shortId(run.id)} ·{" "}
                    {formatAdminDate(run.startedAt)}
                  </p>
                </div>
                <p className="font-mono text-xs text-[#596173]">
                  {formatDuration(run.durationMs)} · {run.retryCount} retries
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-5">
                {countFields.map(([label, field]) => (
                  <div key={field}>
                    <dt className="text-xs text-[#596173]">{label}</dt>
                    <dd className="mt-0.5 font-mono">{run[field]}</dd>
                  </div>
                ))}
              </dl>
              {run.errorCode ? (
                <p className="mt-4 flex items-center gap-2 rounded border border-[#e7dcd9] bg-white px-3 py-2 font-mono text-xs text-[#7d2d2d]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-[#b95d5d]"
                  />
                  {run.errorCode}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
