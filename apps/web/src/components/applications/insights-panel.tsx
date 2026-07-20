import type { ApplicationInsights } from "@jobwarden/domain";

import { CardHeader, MeterRow } from "@/components/ui/card";
import { funnelStageLabels } from "@/lib/applications/types";
import { cn } from "@/lib/utils";

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
      <div className="card-surface p-4">
        <CardHeader title="Funnel reached" />
        <dl className="mt-3.5 flex flex-col gap-2.5">
          {insights.funnel.map((step) => (
            <MeterRow
              key={step.stage}
              label={funnelStageLabels[step.stage]}
              value={step.reached}
              max={funnelPeak}
            />
          ))}
        </dl>
      </div>
      <div className="card-surface p-4">
        <CardHeader
          title="Follow-ups"
          status={
            insights.followUps.overdue > 0
              ? { label: "Overdue", tone: "danger" }
              : insights.followUps.dueToday > 0
                ? { label: "Due today", tone: "attention" }
                : { label: "Clear", tone: "good" }
          }
        />
        <div className="mt-3.5 grid grid-cols-3 gap-3">
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
      <div className="card-surface p-4">
        <CardHeader title="Outcomes" />
        <div className="mt-3.5 grid grid-cols-3 gap-3">
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
