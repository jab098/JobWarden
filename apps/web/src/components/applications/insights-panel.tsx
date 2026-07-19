import type { ApplicationInsights } from "@jobwarden/domain";

const funnelLabels: Record<
  ApplicationInsights["funnel"][number]["stage"],
  string
> = {
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
};

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="block font-mono text-xl font-semibold tabular-nums text-[#172033]">
        {value}
      </span>
      <span className="block text-xs text-[#596173]">{label}</span>
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: ApplicationInsights }) {
  return (
    <section
      aria-label="Application insights"
      className="border-b border-[#dedbd2] px-5 py-5 sm:px-8"
    >
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
            Funnel reached
          </h2>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {insights.funnel.map((step) => (
              <div key={step.stage}>
                <dt className="text-xs text-[#596173]">
                  {funnelLabels[step.stage]}
                </dt>
                <dd className="font-mono text-xl font-semibold tabular-nums text-[#172033]">
                  {step.reached}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
            Follow-ups
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <Figure label="Overdue" value={insights.followUps.overdue} />
            <Figure label="Due today" value={insights.followUps.dueToday} />
            <Figure label="Upcoming" value={insights.followUps.upcoming} />
          </div>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
            Outcomes
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <Figure
              label="Observed outcome"
              value={insights.outcomes.observed}
            />
            <Figure label="Still open" value={insights.outcomes.open} />
            <Figure
              label="No stage change for 14+ days"
              value={insights.outcomes.quietFourteenPlusDays}
            />
          </div>
          <p className="mt-2 max-w-md text-xs leading-5 text-[#596173]">
            Silence is reported as silence: an application with no stage change
            is never shown as rejected, and JobWarden never contacts recruiters
            or infers their activity.
          </p>
        </div>
      </div>
    </section>
  );
}
