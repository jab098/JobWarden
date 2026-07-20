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

/**
 * Why the run discarded what it discarded.
 *
 * Received and eligible alone made a source that dropped 95% of its stock look
 * like a source without much UK content, which is how the eligibility
 * classifier defect went unnoticed for twenty-five tasks.
 */
const dropFields = [
  ["Not UK", "excludedNonUkCount"],
  ["Unrecognised location", "quarantinedAmbiguousCount"],
  ["Unusable link", "quarantinedInvalidUrlCount"],
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
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Recent source runs
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Counts, sanitised failure codes, and the location text of adverts
          whose place could not be recognised. Advert content is never shown.
        </p>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-ink-secondary">
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
                  <p className="mt-1 font-mono text-xs text-ink-secondary">
                    {run.triggerType} · {shortId(run.id)} ·{" "}
                    {formatAdminDate(run.startedAt)}
                  </p>
                </div>
                <p className="font-mono text-xs text-ink-secondary">
                  {formatDuration(run.durationMs)} · {run.retryCount} retries
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-5">
                {countFields.map(([label, field]) => (
                  <div key={field}>
                    <dt className="text-xs text-ink-secondary">{label}</dt>
                    <dd className="mt-0.5 font-mono">{run[field]}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-5">
                {dropFields.map(([label, field]) => (
                  <div key={field}>
                    <dt className="text-xs text-ink-secondary">{label}</dt>
                    <dd className="mt-0.5 font-mono">{run[field]}</dd>
                  </div>
                ))}
              </dl>
              {run.unrecognisedLocations.length > 0 ? (
                <div className="mt-4 rounded border border-[#dedad1] bg-white px-3 py-2">
                  <h4 className="text-xs text-ink-secondary">
                    Locations not recognised
                  </h4>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Adding these places to the location dataset republishes
                    their adverts on the next run.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {run.unrecognisedLocations.map((location) => (
                      <li
                        key={location}
                        className="rounded bg-background px-2 py-0.5 font-mono text-xs"
                      >
                        {location}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
