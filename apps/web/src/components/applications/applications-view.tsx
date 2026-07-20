import Link from "next/link";

import type { ApplicationStage } from "@jobwarden/domain";

import { ApplicationItem } from "@/components/applications/application-item";
import { InsightsPanel } from "@/components/applications/insights-panel";
import type { ApplicationsResult } from "@/lib/applications/types";
import { cn } from "@/lib/utils";

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
    <div className="mx-auto max-w-6xl px-4 py-5 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Applications
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Every application you made yourself, tracked from applied through
              to its outcome.
            </p>
          </div>
          <nav
            aria-label="Applications view"
            className="flex items-center rounded-lg border border-border bg-surface-sunken/60 p-0.5"
          >
            {(
              [
                ["list", "List", "/applications"],
                ["board", "Board", "/applications?view=board"],
              ] as const
            ).map(([key, label, href]) => (
              <Link
                key={key}
                href={href}
                aria-current={view === key ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs outline-none transition-[background-color,color,box-shadow] duration-(--duration-quick) ease-(--ease-smooth-out) focus-visible:ring-2 focus-visible:ring-ring/60",
                  view === key
                    ? "bg-card font-medium text-foreground shadow-[0_1px_3px_rgba(16,20,28,0.1)] ring-1 ring-border"
                    : "text-ink-secondary hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          <span className="tnum font-medium text-foreground">
            {count}{" "}
            {count === 1 ? "tracked application" : "tracked applications"}
          </span>
          {result.dataMode === "fixtures" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              Development data
            </span>
          ) : null}
        </div>
      </header>

      <InsightsPanel insights={result.insights} />

      {count === 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-card px-6 py-14 text-center">
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            No applications tracked yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
            Apply on the employer&apos;s own site, then track the application
            from the job&apos;s detail page. JobWarden records only what you
            did. It never submits applications or contacts recruiters.
          </p>
          <Link
            href="/matches"
            className="mt-5 inline-flex rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Open my matches
          </Link>
        </div>
      ) : view === "list" ? (
        <section aria-label="Tracked applications" className="mt-4 min-w-0">
          <ul>
            {result.items.map((item) => (
              <ApplicationItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-label="Applications board"
          className="mt-5 min-w-0 overflow-x-auto pb-2"
        >
          <div className="flex min-w-max gap-3">
            {boardColumns.map((column) => {
              const items = result.items.filter((item) =>
                column.stages.includes(item.stage),
              );
              return (
                <section
                  key={column.key}
                  aria-label={`${column.label} column`}
                  className="w-72 shrink-0 rounded-lg border border-border bg-surface-sunken"
                >
                  <h2 className="flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-ink-secondary">
                    {column.label}
                    <span className="tnum rounded-full bg-card px-1.5 py-0.5 font-mono text-[0.68rem] font-medium text-ink-secondary ring-1 ring-border">
                      {items.length}
                    </span>
                  </h2>
                  {items.length === 0 ? (
                    <p className="px-3.5 pt-1 pb-4 text-xs text-ink-faint">
                      Nothing in {column.label.toLowerCase()}.
                    </p>
                  ) : (
                    <ul className="overflow-hidden rounded-b-lg border-t border-border">
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
    </div>
  );
}
