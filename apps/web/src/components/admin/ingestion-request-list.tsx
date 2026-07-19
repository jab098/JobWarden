import { AdminStatus } from "./admin-status";
import { formatAdminDate, shortId } from "./admin-format";
import type { IngestionRequestView } from "@/lib/admin/types";

export function IngestionRequestList({
  requests,
}: {
  requests: readonly IngestionRequestView[];
}) {
  return (
    <section aria-labelledby="queued-requests-heading" className="space-y-4">
      <div>
        <h2
          id="queued-requests-heading"
          className="text-xl font-semibold tracking-[-0.025em]"
        >
          Manual requests
        </h2>
        <p className="mt-1 text-sm text-[#596173]">
          Requests are coalesced per source and consumed by the shared ingestion
          runtime.
        </p>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-[#596173]">
          No manual ingestion requests have been recorded.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{request.employerName}</h3>
                  <AdminStatus state={request.status} />
                  <span className="sr-only">
                    {request.status === "pending"
                      ? "Pending request"
                      : `${request.status} request`}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-[#596173]">
                  {shortId(request.correlationId)} ·{" "}
                  {formatAdminDate(request.requestedAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
