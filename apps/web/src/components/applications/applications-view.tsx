import Link from "next/link";

import type { ApplicationStage } from "@jobwarden/domain";

import {
  ApplicationItem,
  stageLabels,
} from "@/components/applications/application-item";
import { InsightsPanel } from "@/components/applications/insights-panel";
import type { ApplicationsResult } from "@/lib/applications/types";

export type ApplicationsView = "list" | "board";

export function resolveApplicationsView(
  view: string | string[] | undefined,
): ApplicationsView {
  return view === "board" ? "board" : "list";
}

const boardColumns: readonly {
  key: string;
  label: string;
  stages: readonly ApplicationStage[];
}[] = [
  { key: "applied", label: "Applied", stages: ["applied"] },
  { key: "screening", label: "Screening", stages: ["screening"] },
  { key: "interviewing", label: "Interviewing", stages: ["interviewing"] },
  { key: "offer", label: "Offer", stages: ["offer"] },
  {
    key: "closed",
    label: "Closed",
    stages: ["accepted", "rejected", "withdrawn", "archived"],
  },
];

export function ApplicationsViewPage({
  result,
  view,
}: {
  result: ApplicationsResult;
  view: ApplicationsView;
}) {
  const count = result.items.length;

  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-[#dedbd2] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
          Manual applications only
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
          Applications
        </h1>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#ece9e2] pt-4 text-sm text-[#596173]">
          <span className="font-medium text-[#263248]">
            {count}{" "}
            {count === 1 ? "tracked application" : "tracked applications"}
          </span>
          {result.dataMode === "fixtures" ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[#7a5a20]">
              Development data
            </span>
          ) : null}
          <nav aria-label="Applications view" className="flex gap-4">
            <Link
              href="/applications"
              aria-current={view === "list" ? "page" : undefined}
              className={`rounded-sm text-sm underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${view === "list" ? "font-semibold text-[#172033]" : "font-medium text-[#2458a6] hover:underline"}`}
            >
              List
            </Link>
            <Link
              href="/applications?view=board"
              aria-current={view === "board" ? "page" : undefined}
              className={`rounded-sm text-sm underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${view === "board" ? "font-semibold text-[#172033]" : "font-medium text-[#2458a6] hover:underline"}`}
            >
              Board
            </Link>
          </nav>
        </div>
      </header>

      <InsightsPanel insights={result.insights} />

      {count === 0 ? (
        <div className="px-5 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">
            No applications tracked yet
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
            Apply on the employer&apos;s own site, then track the application
            from the job&apos;s detail page. JobWarden records only what you did
            — it never submits applications or contacts recruiters.
          </p>
          <Link
            href="/jobs"
            className="mt-6 inline-flex rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            Browse your target feed
          </Link>
        </div>
      ) : view === "list" ? (
        <section aria-label="Tracked applications" className="min-w-0">
          <ul>
            {result.items.map((item) => (
              <ApplicationItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-label="Applications board"
          className="min-w-0 overflow-x-auto px-5 py-6 sm:px-8"
        >
          <div className="flex min-w-max gap-4">
            {boardColumns.map((column) => {
              const items = result.items.filter((item) =>
                column.stages.includes(item.stage),
              );
              return (
                <section
                  key={column.key}
                  aria-label={`${column.label} column`}
                  className="w-72 shrink-0 rounded-md border border-[#e7e3da] bg-[#fbfaf7]"
                >
                  <h2 className="border-b border-[#ece9e2] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
                    {column.label}{" "}
                    <span className="font-mono tabular-nums">
                      ({items.length})
                    </span>
                  </h2>
                  {items.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-[#596173]">
                      Nothing in {column.label.toLowerCase()}.
                    </p>
                  ) : (
                    <ul className="bg-white">
                      {items.map((item) => (
                        <ApplicationItem key={item.id} item={item} compact />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}
      <p className="sr-only">
        Stages available: {Object.values(stageLabels).join(", ")}.
      </p>
    </div>
  );
}
