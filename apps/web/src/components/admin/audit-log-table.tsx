import type { AuditLogEntry } from "@/lib/admin/types";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Read-only by construction: the audit trail is evidence, so this surface has
 * no control that could alter it.
 */
export function AuditLogTable({
  entries,
}: {
  entries: readonly AuditLogEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="mt-4 max-w-prose text-sm text-ink-secondary">
        No audited actions yet. Entries appear here as administrators approve
        access, change sources, or request ingestion runs.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Audited administrator actions, most recent first
        </caption>
        <thead>
          <tr className="border-b border-border text-xs font-medium text-ink-faint">
            <th scope="col" className="py-2 pr-4 font-medium">
              When
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Action
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Resource
            </th>
            <th scope="col" className="py-2 font-medium">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border align-top">
              <td className="py-3 pr-4 font-mono text-xs text-ink-faint">
                {dateFormatter.format(new Date(entry.createdAt))}
              </td>
              <td className="py-3 pr-4 text-foreground">{entry.action}</td>
              <td className="py-3 pr-4 text-ink-secondary [overflow-wrap:anywhere]">
                {entry.resourceType}
                {entry.resourceId ? (
                  <span className="block font-mono text-xs text-ink-faint">
                    {entry.resourceId}
                  </span>
                ) : null}
              </td>
              <td className="py-3 text-ink-secondary [overflow-wrap:anywhere]">
                {Object.entries(entry.metadata).length === 0 ? (
                  <span className="text-ink-faint">-</span>
                ) : (
                  <dl className="space-y-0.5 text-xs">
                    {Object.entries(entry.metadata).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="text-ink-faint">{key}</dt>
                        <dd className="text-foreground">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
