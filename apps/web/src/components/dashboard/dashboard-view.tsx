import Link from "next/link";

import type { DashboardResult } from "@/lib/dashboard/types";
import type {
  DayCount,
  PeriodComparison,
  ProfileNudge,
} from "@jobwarden/domain";

/**
 * A sparkline drawn as inline SVG. A charting dependency would be a lot of
 * bytes for four bars, and the roadmap requires separate approval for one.
 */
function Sparkline({
  series,
  label,
}: {
  series: readonly DayCount[];
  label: string;
}) {
  const peak = Math.max(1, ...series.map((day) => day.count));
  const width = Math.max(1, series.length) * 12;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} 24`}
      className="h-6 w-full max-w-[10rem]"
      preserveAspectRatio="none"
    >
      {series.map((day, index) => {
        const height = day.count === 0 ? 1 : (day.count / peak) * 22;
        return (
          <rect
            key={day.date}
            x={index * 12 + 2}
            y={24 - height}
            width={8}
            height={height}
            className={day.count === 0 ? "fill-[#d8d4cb]" : "fill-[#2458a6]"}
          />
        );
      })}
    </svg>
  );
}

function Comparison({
  value,
  unit,
}: {
  value: PeriodComparison;
  unit: string;
}) {
  if (value.direction === "no_baseline") {
    return (
      <span className="text-xs text-[#697181]">
        {value.current} {unit} · not enough history to compare
      </span>
    );
  }
  const wording =
    value.direction === "level"
      ? "the same as the period before"
      : `${value.change} ${value.direction === "up" ? "more" : "fewer"} than the period before`;
  return (
    <span className="text-xs text-[#697181]">
      {value.current} {unit} · {wording}
    </span>
  );
}

function Figure({
  value,
  label,
  href,
}: {
  value: number | string;
  label: string;
  href?: string;
}) {
  // A name is not a statistic; typesetting it at figure size would give it a
  // visual weight the number slots have earned and it has not.
  const isCount = typeof value === "number";
  const body = (
    <>
      <span
        className={`block font-semibold tracking-[-0.02em] text-[#172033] [overflow-wrap:anywhere] ${
          isCount ? "text-2xl" : "text-base"
        }`}
      >
        {value}
      </span>
      <span className="mt-1 block text-xs text-[#697181]">{label}</span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="block rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
    >
      {body}
    </Link>
  ) : (
    <div className="px-1 py-1">{body}</div>
  );
}

const nudgeCopy: Record<ProfileNudge, { text: string; href: string }> = {
  add_cv: {
    text: "Add a CV so matching can use your demonstrated experience.",
    href: "/profile",
  },
  add_docx_for_tailoring: {
    text: "Your CV is a PDF. Add a DOCX to download tailored copies that keep your layout.",
    href: "/profile",
  },
  confirm_evidence: {
    text: "Confirm some skills and responsibilities so matches have evidence to work from.",
    href: "/profile",
  },
  enable_search: {
    text: "Enable a named search to start receiving target matches.",
    href: "/profile",
  },
};

function Section({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#ece9e2] py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-[#263248]">{title}</h2>
        <Link
          href={href}
          className="text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

export function DashboardView({ result }: { result: DashboardResult }) {
  const { insights } = result.applications;

  return (
    <div className="px-5 py-8 lg:px-8">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
        Your activity
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#172033]">
        Home
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-[#596173]">
        Everything here is counted from your own records over the last{" "}
        {result.windowDays} days. Nothing is estimated, and silence from an
        employer is never reported as a rejection.
      </p>

      <Section
        title="Applications"
        href="/applications"
        linkLabel="Open tracker"
      >
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure value={insights.totalTracked} label="tracked in total" />
          <Figure value={insights.outcomes.open} label="still open" />
          <Figure
            value={insights.outcomes.observed}
            label="with an observed outcome"
          />
          <Figure
            value={insights.outcomes.quietFourteenPlusDays}
            label="no response observed in 14+ days"
          />
        </div>
        <p className="mt-3">
          <Comparison
            value={result.applications.startedThisPeriod}
            unit="started this period"
          />
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#697181]">
          {insights.funnel.map((step) => (
            <div key={step.stage} className="flex gap-2">
              <dt className="capitalize">{step.stage}</dt>
              <dd className="font-medium text-[#263248]">{step.reached}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Follow-ups"
        href="/applications"
        linkLabel="Plan next actions"
      >
        <div className="mt-3 grid grid-cols-3 gap-4">
          <Figure value={insights.followUps.overdue} label="overdue" />
          <Figure value={insights.followUps.dueToday} label="due today" />
          <Figure value={insights.followUps.upcoming} label="upcoming" />
        </div>
      </Section>

      <Section title="Matches" href="/matches" linkLabel="Open matches">
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Figure
              value={result.targetFeed.currentMatchCount}
              label="matches right now"
            />
            <Figure
              value={result.targetFeed.topProfileName ?? "No single leader"}
              label="profile producing most matches"
            />
          </div>
          <div className="min-w-0">
            <Sparkline
              series={result.targetFeed.byDay}
              label={`Matching jobs by the day JobWarden first saw them, over ${result.windowDays} days`}
            />
            <p className="mt-1 text-xs text-[#697181]">
              By the day JobWarden first saw each job
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Your decisions"
        href="/matches"
        linkLabel="Review saved roles"
      >
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Figure value={result.decisions.counts.saved} label="saved" />
            <Figure
              value={result.decisions.counts.considering}
              label="considering"
            />
            <Figure
              value={result.decisions.counts.dismissed}
              label="dismissed"
            />
          </div>
          <div className="min-w-0">
            <Sparkline
              series={result.decisions.byDay}
              label={`Decisions per day over ${result.windowDays} days`}
            />
            <p className="mt-1 text-xs text-[#697181]">
              {result.decisions.inPeriod} in this period
            </p>
          </div>
        </div>
      </Section>

      <Section title="Pathways" href="/pathways" linkLabel="Open pathways">
        {result.explore.enabled ? (
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Figure
              value={result.explore.qualifyingCount}
              label="pathways qualifying"
            />
            <Figure value={result.explore.promotedCount} label="promoted" />
            <Figure value={result.explore.dismissedCount} label="dismissed" />
          </div>
        ) : (
          <p className="mt-3 max-w-prose text-sm text-[#596173]">
            Pathways is off. Turn it on to see adjacent careers built from your
            confirmed evidence.
          </p>
        )}
      </Section>

      <Section
        title="Digest emails"
        href="/profile"
        linkLabel="Notification settings"
      >
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure value={result.digests.sent} label="sent" />
          <Figure
            value={result.digests.noMatchSlots}
            label="slots with no new matches"
          />
          <Figure
            value={result.digests.heldBack}
            label="held back by a limit"
          />
          <Figure value={result.digests.failed} label="failed and retried" />
        </div>
      </Section>

      <Section
        title="Profile health"
        href="/profile"
        linkLabel="Open career profile"
      >
        <div className="mt-3 grid grid-cols-3 gap-4">
          <Figure
            value={result.profileHealth.confirmedEvidenceCount}
            label="confirmed evidence items"
          />
          <Figure
            value={result.profileHealth.enabledSearchCount}
            label="enabled searches"
          />
          <Figure
            value={
              result.profileHealth.hasCv
                ? (result.profileHealth.cvKind ?? "yes").toUpperCase()
                : "None"
            }
            label="CV on file"
          />
        </div>
        {result.profileHealth.nudges.length === 0 ? null : (
          <ul className="mt-3 space-y-1">
            {result.profileHealth.nudges.map((nudge) => (
              <li key={nudge} className="text-sm text-[#596173]">
                <Link
                  href={nudgeCopy[nudge].href}
                  className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                >
                  {nudgeCopy[nudge].text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {result.dataMode === "fixtures" ? (
        <p className="mt-6 text-sm text-[#596173]">
          This preview shows frozen fictional statistics.
        </p>
      ) : null}
    </div>
  );
}
