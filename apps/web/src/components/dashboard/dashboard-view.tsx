import Link from "next/link";

import type { DashboardResult } from "@/lib/dashboard/types";
import type {
  DayCount,
  PeriodComparison,
  ProfileNudge,
} from "@jobwarden/domain";
import { cn } from "@/lib/utils";

/**
 * A sparkline drawn as inline SVG. A charting dependency would be a lot of
 * bytes for a few bars, and the roadmap requires separate approval for one.
 */
function Sparkline({
  series,
  label,
  className,
}: {
  series: readonly DayCount[];
  label: string;
  className?: string;
}) {
  const peak = Math.max(1, ...series.map((day) => day.count));
  const width = Math.max(1, series.length) * 12;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} 32`}
      className={cn("h-8 w-full max-w-[9rem]", className)}
      preserveAspectRatio="none"
    >
      {series.map((day, index) => {
        const height = day.count === 0 ? 1.5 : (day.count / peak) * 30;
        return (
          <rect
            key={day.date}
            x={index * 12 + 2}
            y={32 - height}
            width={8}
            height={height}
            rx={1}
            className={day.count === 0 ? "fill-border" : "fill-link/80"}
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
      <span className="text-xs text-ink-faint">
        {value.current} {unit} · not enough history to compare
      </span>
    );
  }
  const wording =
    value.direction === "level"
      ? "the same as the period before"
      : `${value.change} ${value.direction === "up" ? "more" : "fewer"} than the period before`;
  return (
    <span className="text-xs text-ink-faint">
      {value.current} {unit} · {wording}
    </span>
  );
}

/** A key figure at the top of the page. Renders as a card; links whole-card. */
function StatCard({
  label,
  value,
  context,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  context?: React.ReactNode;
  href: string;
  tone?: "neutral" | "good" | "attention";
}) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-border bg-card p-4 outline-none transition-[border-color,box-shadow,transform] duration-150 ease-(--ease-smooth-out) hover:-translate-y-px hover:border-input hover:shadow-[0_2px_8px_rgba(16,20,28,0.05)] focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="block text-xs text-ink-secondary">{label}</span>
      <span
        className={cn(
          "tnum mt-1.5 block text-2xl font-semibold tracking-[-0.02em]",
          tone === "good" && "text-success",
          tone === "attention" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
      {context ? (
        <span className="mt-1 block text-xs text-ink-faint">{context}</span>
      ) : null}
    </Link>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card p-5",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? (
          <Link
            href={action.href}
            className="rounded-sm text-xs text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** One aligned funnel row: stage, proportional bar, count. */
function FunnelRow({
  stage,
  reached,
  peak,
}: {
  stage: string;
  reached: number;
  peak: number;
}) {
  const share = peak === 0 ? 0 : reached / peak;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-ink-secondary capitalize">
        {stage}
      </span>
      <span aria-hidden="true" className="h-1.5 min-w-0 flex-1">
        <span
          className="block h-full rounded-full bg-link/75 transition-[width] duration-(--duration-slow) ease-(--ease-smooth-out)"
          style={{ width: `${Math.max(share * 100, reached > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="tnum w-6 shrink-0 text-right font-mono text-xs text-foreground">
        {reached}
      </span>
    </div>
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

export function DashboardView({ result }: { result: DashboardResult }) {
  const { insights } = result.applications;
  const funnelPeak = Math.max(1, ...insights.funnel.map((s) => s.reached));
  const dueNow = insights.followUps.overdue + insights.followUps.dueToday;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 lg:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Home
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-6 text-ink-secondary">
          Everything here is counted from your own records over the last{" "}
          {result.windowDays} days. Nothing is estimated, and silence from an
          employer is never reported as a rejection.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Matches right now"
          value={result.targetFeed.currentMatchCount}
          context={result.targetFeed.topProfileName ?? undefined}
          href="/matches"
          tone={result.targetFeed.currentMatchCount > 0 ? "good" : "neutral"}
        />
        <StatCard
          label="Applications tracked"
          value={insights.totalTracked}
          context={`${insights.outcomes.open} still open`}
          href="/applications"
        />
        <StatCard
          label="Follow-ups due"
          value={dueNow}
          context={
            insights.followUps.overdue > 0
              ? `${insights.followUps.overdue} overdue · ${insights.followUps.dueToday} due today`
              : `${insights.followUps.dueToday} due today · ${insights.followUps.upcoming} upcoming`
          }
          href="/applications"
          tone={insights.followUps.overdue > 0 ? "attention" : "neutral"}
        />
        <StatCard
          label="Saved roles"
          value={result.decisions.counts.saved}
          context={`${result.decisions.counts.considering} considering`}
          href="/matches"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Applications"
          action={{ href: "/applications", label: "Open tracker" }}
        >
          <div className="mt-4 flex flex-col gap-2.5">
            {insights.funnel.map((step) => (
              <FunnelRow
                key={step.stage}
                stage={step.stage}
                reached={step.reached}
                peak={funnelPeak}
              />
            ))}
          </div>
          <p className="mt-4">
            <Comparison
              value={result.applications.startedThisPeriod}
              unit="started this period"
            />
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {insights.outcomes.open}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">still open</dt>
            </div>
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {insights.outcomes.observed}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">
                with an observed outcome
              </dt>
            </div>
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {insights.outcomes.quietFourteenPlusDays}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">
                no response observed in 14+ days
              </dt>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Matches"
          action={{ href: "/matches", label: "Open matches" }}
        >
          <div className="mt-4 mb-4 flex items-start justify-between gap-6">
            <div>
              <p className="tnum text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {result.targetFeed.currentMatchCount}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">matches right now</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium text-foreground">
                {result.targetFeed.topProfileName ?? "No single leader"}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">
                profile producing most matches
              </p>
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-4">
            <Sparkline
              series={result.targetFeed.byDay}
              label={`Matching jobs by the day JobWarden first saw them, over ${result.windowDays} days`}
              className="h-10 max-w-[14rem]"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              By the day JobWarden first saw each job
            </p>
          </div>
        </Panel>

        <Panel
          title="Your decisions"
          action={{ href: "/matches", label: "Review saved roles" }}
        >
          <dl className="mt-4 mb-4 grid grid-cols-3 gap-3">
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {result.decisions.counts.saved}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">saved</dt>
            </div>
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {result.decisions.counts.considering}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">considering</dt>
            </div>
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {result.decisions.counts.dismissed}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">dismissed</dt>
            </div>
          </dl>
          <div className="mt-auto border-t border-border pt-4">
            <Sparkline
              series={result.decisions.byDay}
              label={`Decisions per day over ${result.windowDays} days`}
              className="h-10 max-w-[14rem]"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              {result.decisions.inPeriod} in this period
            </p>
          </div>
        </Panel>

        <Panel
          title="Profile health"
          action={{ href: "/profile", label: "Open career profile" }}
        >
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {result.profileHealth.confirmedEvidenceCount}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">
                confirmed evidence items
              </dt>
            </div>
            <div>
              <dd className="tnum text-base font-semibold text-foreground">
                {result.profileHealth.enabledSearchCount}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">
                enabled searches
              </dt>
            </div>
            <div>
              <dd className="text-base font-semibold text-foreground">
                {result.profileHealth.hasCv
                  ? (result.profileHealth.cvKind ?? "yes").toUpperCase()
                  : "None"}
              </dd>
              <dt className="mt-0.5 text-xs text-ink-faint">CV on file</dt>
            </div>
          </dl>
          {result.profileHealth.nudges.length === 0 ? null : (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4">
              {result.profileHealth.nudges.map((nudge) => (
                <li key={nudge} className="text-sm leading-6">
                  <Link
                    href={nudgeCopy[nudge].href}
                    className="rounded-sm text-ink-secondary underline decoration-border underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground hover:decoration-ink-faint focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {nudgeCopy[nudge].text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Pathways"
          action={{ href: "/pathways", label: "Open pathways" }}
        >
          {result.explore.enabled ? (
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dd className="tnum text-base font-semibold text-foreground">
                  {result.explore.qualifyingCount}
                </dd>
                <dt className="mt-0.5 text-xs text-ink-faint">
                  pathways qualifying
                </dt>
              </div>
              <div>
                <dd className="tnum text-base font-semibold text-foreground">
                  {result.explore.promotedCount}
                </dd>
                <dt className="mt-0.5 text-xs text-ink-faint">promoted</dt>
              </div>
              <div>
                <dd className="tnum text-base font-semibold text-foreground">
                  {result.explore.dismissedCount}
                </dd>
                <dt className="mt-0.5 text-xs text-ink-faint">dismissed</dt>
              </div>
            </dl>
          ) : (
            <p className="mt-4 max-w-prose text-sm leading-6 text-ink-secondary">
              Pathways is off. Turn it on to see adjacent careers built from
              your confirmed evidence.
            </p>
          )}
        </Panel>

        <Panel
          title="Digest emails"
          action={{ href: "/profile", label: "Notification settings" }}
        >
          <p className="mt-4 text-sm leading-6 text-ink-secondary">
            <span className="tnum font-medium text-foreground">
              {result.digests.sent}
            </span>{" "}
            sent · {result.digests.noMatchSlots} slots with no new matches ·{" "}
            {result.digests.heldBack} held back by a limit ·{" "}
            {result.digests.failed} failed and retried
          </p>
        </Panel>
      </div>

      {result.dataMode === "fixtures" ? (
        <p className="mt-5 text-xs text-ink-faint">
          This preview shows frozen fictional statistics.
        </p>
      ) : null}
    </div>
  );
}
