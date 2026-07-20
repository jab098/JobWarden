import type { ApplicationInsights } from "@jobwarden/domain";

import { cn } from "@/lib/utils";

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

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "attention" | "danger";
}) {
  return (
    <div>
      <span
        className={cn(
          "tnum block font-mono text-lg font-semibold",
          tone === "danger" && value > 0
            ? "text-danger"
            : tone === "attention" && value > 0
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 block text-xs text-ink-faint">{label}</span>
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: ApplicationInsights }) {
  const funnelPeak = Math.max(1, ...insights.funnel.map((s) => s.reached));

  return (
    <section
      aria-label="Application insights"
      className="stagger-children mt-4 grid gap-2.5 lg:grid-cols-3"
    >
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Funnel reached
        </h2>
        <dl className="mt-3 flex flex-col gap-2">
          {insights.funnel.map((step) => {
            const share = step.reached / funnelPeak;
            return (
              <div key={step.stage} className="flex items-center gap-3">
                <dt className="w-24 shrink-0 text-xs text-ink-secondary">
                  {funnelLabels[step.stage]}
                </dt>
                <span aria-hidden="true" className="h-1.5 min-w-0 flex-1">
                  <span
                    className="block h-full rounded-full bg-link/75"
                    style={{
                      width: `${Math.max(share * 100, step.reached > 0 ? 4 : 0)}%`,
                    }}
                  />
                </span>
                <dd className="tnum w-6 shrink-0 text-right font-mono text-xs text-foreground">
                  {step.reached}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Follow-ups</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Figure
            label="Overdue"
            value={insights.followUps.overdue}
            tone="danger"
          />
          <Figure
            label="Due today"
            value={insights.followUps.dueToday}
            tone="attention"
          />
          <Figure label="Upcoming" value={insights.followUps.upcoming} />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Outcomes</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Figure label="Observed outcome" value={insights.outcomes.observed} />
          <Figure label="Still open" value={insights.outcomes.open} />
          <Figure
            label="No stage change for 14+ days"
            value={insights.outcomes.quietFourteenPlusDays}
          />
        </div>
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-ink-faint">
          Silence is reported as silence: an application with no stage change is
          never shown as rejected, and JobWarden never contacts recruiters or
          infers their activity.
        </p>
      </div>
    </section>
  );
}
