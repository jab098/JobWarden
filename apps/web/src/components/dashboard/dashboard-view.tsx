import Link from "next/link";

import { ActivityChart } from "@/components/dashboard/activity-chart";
import {
  CardHeader,
  CheckItem,
  Meter,
  MeterRow,
  progressTones,
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

/**
 * Home measures what the user has done. Before they have done anything there is
 * nothing to measure, and a grid of zeros reports that as failure rather than
 * as a beginning. This is the same page in its first state: what JobWarden has
 * already found for them, then the two things that start the measuring.
 *
 * It is keyed off tracked applications and decisions, not off matches: matching
 * runs over the shared catalogue, so a user can have matches within minutes of
 * finishing onboarding while every other panel is still empty.
 */
function FirstRun({
  matchCount,
  topProfileName,
  profileChecks,
  settledChecks,
}: {
  matchCount: number;
  topProfileName: string | null;
  profileChecks: { key: ProfileNudge; done: boolean; settled: string }[];
  settledChecks: number;
}) {
  const outstanding = profileChecks.filter((check) => !check.done);
  const setUp = settledChecks === profileChecks.length;

  return (
    <>
      <section className="card-surface mt-4 p-5">
        <p className="text-sm text-ink-secondary">
          {setUp ? "Your profile is set up." : "Your profile is nearly set up."}
        </p>
        <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-foreground">
          {matchCount === 0
            ? "No roles match your profile yet"
            : `${matchCount} ${matchCount === 1 ? "role matches" : "roles match"} your profile right now`}
        </p>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-6 text-ink-secondary">
          {matchCount === 0
            ? "JobWarden checks the UK listings it has indexed four times each weekday. As soon as one fits your evidence and preferences, it appears under Matches."
            : `Scored against ${topProfileName ? `your ${topProfileName} search` : "your saved searches"}, with the evidence behind every score.`}
        </p>
        {matchCount > 0 ? (
          <Link
            href="/matches"
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            View your matches
          </Link>
        ) : null}
      </section>

      <section
        aria-labelledby="first-run-next"
        className="card-surface mt-2.5 p-5"
      >
        <h2 id="first-run-next" className="text-sm font-semibold">
          What fills this page
        </h2>
        <ul className="mt-3.5 flex flex-col gap-3">
          <NextStep
            href="/matches"
            title="Save or dismiss a few matches"
            body="Your decisions are the record JobWarden measures. They also tell it which roles to keep showing you."
          />
          <NextStep
            href="/jobs"
            title="Track an application"
            body="Applied on an employer's site? Track it here and this page starts reporting your funnel, your follow-ups, and what has gone quiet."
          />
          {outstanding.map((check) => (
            <NextStep
              key={check.key}
              href={nudgeCopy[check.key].href}
              title="Finish your career profile"
              body={nudgeCopy[check.key].text}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

/** One numbered-feeling next action: a whole-row link with a quiet marker. */
function NextStep({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span
          aria-hidden="true"
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-faint transition-colors duration-(--duration-quick) group-hover:bg-link"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground transition-colors duration-(--duration-quick) group-hover:text-link">
            {title}
          </span>
          <span className="mt-0.5 block max-w-[62ch] text-sm leading-6 text-ink-secondary">
            {body}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** What a panel says instead of drawing an empty chart or a row of zeros. */
function NothingYet({
  children,
  href,
  action,
}: {
  children: React.ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="mt-4 flex flex-1 flex-col justify-center py-2">
      <p className="max-w-[52ch] text-sm leading-6 text-ink-secondary">
        {children}
      </p>
      <Link
        href={href}
        className="mt-2 self-start rounded-sm text-sm font-medium text-link outline-none transition-colors duration-(--duration-quick) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {action}
      </Link>
    </div>
  );
}

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
  const decisionTotal =
    result.decisions.counts.saved +
    result.decisions.counts.considering +
    result.decisions.counts.dismissed;
  // "Has this account done anything yet", not "is anything on screen zero".
  // Matches arrive on their own; applications and decisions only exist because
  // the user made them, so they are what separates a new account from a quiet
  // week on an established one.
  const firstRun = insights.totalTracked === 0 && decisionTotal === 0;

  // Extracted because both the first-run layout and the full dashboard show it:
  // it is the one panel that already has real content for a new account, since
  // onboarding just filled it in.
  const profileHealthPanel = (
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
          <dt className="mt-0.5 text-xs text-ink-faint">enabled searches</dt>
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
  );

  if (firstRun) {
    return (
      <div className="mx-auto max-w-page px-4 py-5 lg:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Home
          </h1>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-secondary">
            This page reports on your own job search. It fills in as you use
            JobWarden, and it never estimates or invents anything.
          </p>
        </header>
        <FirstRun
          matchCount={result.targetFeed.currentMatchCount}
          topProfileName={result.targetFeed.topProfileName}
          profileChecks={profileChecks}
          settledChecks={settledChecks}
        />
        <div className="mt-2.5">{profileHealthPanel}</div>
        {result.dataMode === "fixtures" ? (
          <p className="mt-5 text-xs text-ink-faint">
            This preview shows frozen fictional statistics.
          </p>
        ) : null}
      </div>
    );
  }

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
          {insights.totalTracked === 0 ? (
            <NothingYet href="/jobs" action="Find a role to apply for">
              Once you track an application, this panel reports how far each one
              got, what is still open, and what has gone quiet.
            </NothingYet>
          ) : (
            <>
              <dl className="mt-4 flex flex-col gap-2.5">
                {insights.funnel.map((step, index) => (
                  <MeterRow
                    key={step.stage}
                    label={funnelStageLabels[step.stage]}
                    value={step.reached}
                    max={funnelPeak}
                    // Each stage is nearer an offer than the last, so the ramp
                    // reads as progress rather than five interchangeable bars.
                    tone={
                      progressTones[Math.min(index, progressTones.length - 1)]
                    }
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
            </>
          )}
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
              tone="inbound"
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
          {decisionTotal === 0 ? (
            <NothingYet href="/matches" action="Go to your matches">
              Saving, considering and dismissing roles is what teaches JobWarden
              your taste. Your decisions appear here as you make them.
            </NothingYet>
          ) : (
            <>
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
                  tone="action"
                />
                <p className="mt-1.5 text-xs text-ink-faint">
                  {result.decisions.inPeriod} in this period
                </p>
              </div>
            </>
          )}
        </Panel>

        {profileHealthPanel}
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
