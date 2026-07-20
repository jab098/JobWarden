import Link from "next/link";

import { ActivityChart } from "@/components/dashboard/activity-chart";
import {
  CardHeader,
  CheckItem,
  Meter,
  MeterRow,
  type Tone,
} from "@/components/ui/card";

import { funnelStageLabels } from "@/lib/applications/types";
import type { DashboardResult } from "@/lib/dashboard/types";
import type { PeriodComparison, ProfileNudge } from "@jobwarden/domain";
import { cn } from "@/lib/utils";

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
      className="group block card-surface p-4 outline-none card-interactive focus-visible:ring-2 focus-visible:ring-ring/60"
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
  status,
  action,
  children,
  className,
}: {
  title: string;
  status?: { label: string; tone?: Tone; quiet?: boolean };
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface flex flex-col p-4", className)}>
      <CardHeader title={title} status={status} action={action} />
      {children}
    </section>
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

const windowChoices = [
  [7, "7 days"],
  [30, "30 days"],
] as const;

export function DashboardView({ result }: { result: DashboardResult }) {
  const { insights } = result.applications;
  const funnelPeak = Math.max(1, ...insights.funnel.map((s) => s.reached));
  const dueNow = insights.followUps.overdue + insights.followUps.dueToday;
  // Each set-up step reads its own field rather than the absence of a nudge, so
  // a step is only ticked when the underlying fact is actually true. The DOCX
  // step only exists once a CV does; before that its copy ("your CV is a PDF")
  // would be describing a file that is not there.
  const profileChecks: {
    key: ProfileNudge;
    done: boolean;
    settled: string;
  }[] = [
    {
      key: "add_cv",
      done: result.profileHealth.hasCv,
      settled: "CV on file",
    },
    {
      key: "confirm_evidence",
      done: result.profileHealth.confirmedEvidenceCount > 0,
      settled: `${result.profileHealth.confirmedEvidenceCount} confirmed evidence items matching can use`,
    },
    {
      key: "enable_search",
      done: result.profileHealth.enabledSearchCount > 0,
      settled: `${result.profileHealth.enabledSearchCount} named searches enabled`,
    },
  ];
  if (result.profileHealth.hasCv) {
    profileChecks.splice(1, 0, {
      key: "add_docx_for_tailoring",
      done: result.profileHealth.cvKind === "docx",
      settled: "DOCX on file, so tailored copies keep your layout",
    });
  }
  const settledChecks = profileChecks.filter((check) => check.done).length;

  return (
    <div className="mx-auto max-w-page px-4 py-5 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Home
          </h1>
          <nav
            aria-label="Activity window"
            className="flex items-center rounded-lg border border-border bg-surface-sunken/60 p-0.5"
          >
            {windowChoices.map(([days, label]) => (
              <Link
                key={days}
                href={days === 7 ? "/home" : `/home?window=${days}`}
                aria-current={result.windowDays === days ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs outline-none transition-[background-color,color,box-shadow] duration-(--duration-quick) ease-(--ease-smooth-out) focus-visible:ring-2 focus-visible:ring-ring/60",
                  result.windowDays === days
                    ? "bg-card font-medium text-foreground shadow-[0_1px_3px_rgba(16,20,28,0.1)] ring-1 ring-border"
                    : "text-ink-secondary hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-secondary">
          Everything here is counted from your own records over the last{" "}
          {result.windowDays} days. Nothing is estimated, and silence from an
          employer is never reported as a rejection.
        </p>
      </header>

      <div className="stagger-children mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
        <Panel
          title="Applications"
          action={{ href: "/applications", label: "Open tracker" }}
        >
          <dl className="mt-4 flex flex-col gap-2.5">
            {insights.funnel.map((step) => (
              <MeterRow
                key={step.stage}
                label={funnelStageLabels[step.stage]}
                value={step.reached}
                max={funnelPeak}
              />
            ))}
          </dl>
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
            <ActivityChart
              series={result.targetFeed.byDay}
              label={`Matching jobs by the day JobWarden first saw them, over ${result.windowDays} days`}
              unit="matching jobs first seen"
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
            <ActivityChart
              series={result.decisions.byDay}
              label={`Decisions per day over ${result.windowDays} days`}
              unit="decisions"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              {result.decisions.inPeriod} in this period
            </p>
          </div>
        </Panel>

        <Panel
          title="Profile health"
          status={{
            label: `${settledChecks} of ${profileChecks.length} set up`,
            tone: settledChecks === profileChecks.length ? "good" : "neutral",
          }}
          action={{ href: "/profile", label: "Open career profile" }}
        >
          <Meter
            value={settledChecks}
            max={profileChecks.length}
            tone={settledChecks === profileChecks.length ? "good" : "attention"}
            className="mt-3.5"
          />
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
          <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {profileChecks.map((check) => (
              <CheckItem key={check.key} done={check.done}>
                {check.done ? (
                  check.settled
                ) : (
                  <Link
                    href={nudgeCopy[check.key].href}
                    className="rounded-sm text-ink-secondary underline decoration-border underline-offset-4 outline-none transition-colors duration-(--duration-quick) hover:text-foreground hover:decoration-ink-faint focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {nudgeCopy[check.key].text}
                  </Link>
                )}
              </CheckItem>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
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
