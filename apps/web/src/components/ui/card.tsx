import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The card vocabulary, shared by every JobWarden surface. The surface itself is
 * the `.card-surface` class in globals.css so that sections, articles, links
 * and labels can all be cards without a polymorphic wrapper; this file holds
 * the pieces that go inside one: a header that can carry a status, a meter for
 * proportions, and a checklist row.
 */

/**
 * `data` is the default for a plain quantity: graphite ink, not an accent.
 *
 * `progress-1` to `progress-5` are the funnel ramp and are the one exception to
 * "quantities are graphite": they belong to an ordered sequence where a later
 * stage is genuinely nearer a good outcome, and the ramp says so. Never reach
 * for them to make an unordered set of bars look livelier.
 */
export type Tone =
  | "data"
  | "neutral"
  | "good"
  | "attention"
  | "danger"
  | "progress-1"
  | "progress-2"
  | "progress-3"
  | "progress-4"
  | "progress-5";

const meterFill: Record<Tone, string> = {
  data: "bg-data",
  neutral: "bg-ink-faint",
  good: "bg-success",
  attention: "bg-warning",
  danger: "bg-danger",
  "progress-1": "bg-funnel-1",
  "progress-2": "bg-funnel-2",
  "progress-3": "bg-funnel-3",
  "progress-4": "bg-funnel-4",
  "progress-5": "bg-funnel-5",
};

/** The ramp in order, so a caller maps a stage index straight onto a tone. */
export const progressTones = [
  "progress-1",
  "progress-2",
  "progress-3",
  "progress-4",
  "progress-5",
] as const satisfies readonly Tone[];

// The ramp is a meter fill, not a label colour: a tinted pill in a mid-ramp
// green would claim a state the stage does not have. They all read as a plain
// quantity here.
const pillTone: Record<Tone, string> = {
  data: "bg-surface-sunken text-foreground",
  neutral: "bg-surface-sunken text-ink-secondary",
  good: "bg-success-surface text-success",
  attention: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  "progress-1": "bg-surface-sunken text-foreground",
  "progress-2": "bg-surface-sunken text-foreground",
  "progress-3": "bg-surface-sunken text-foreground",
  "progress-4": "bg-surface-sunken text-foreground",
  "progress-5": "bg-surface-sunken text-foreground",
};

/** A small tinted state pill: "On track", "Good", "Overdue". */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A card's top line: title on the left, and on the right either a status pill,
 * a quiet status word, or a link to the surface that can act on the card.
 */
export function CardHeader({
  title,
  status,
  action,
  className,
}: {
  title: string;
  status?: { label: string; tone?: Tone; quiet?: boolean };
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex shrink-0 items-center gap-2.5">
        {status ? (
          status.quiet ? (
            <span className="text-xs text-ink-faint">{status.label}</span>
          ) : (
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          )
        ) : null}
        {action ? (
          <Link
            href={action.href}
            className="rounded-sm text-xs text-link outline-none transition-colors duration-(--duration-quick) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A proportion as a rounded track. Anything above zero keeps a visible sliver
 * so a real count never reads as nothing.
 */
export function Meter({
  value,
  max,
  tone = "data",
  className,
}: {
  value: number;
  max: number;
  tone?: Tone;
  className?: string;
}) {
  const share = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const width = value > 0 ? Math.max(share * 100, 4) : 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
    >
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-(--duration-slow) ease-(--ease-smooth-out)",
          meterFill[tone],
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** One aligned row of label, proportional meter and count. */
export function MeterRow({
  label,
  value,
  max,
  tone = "data",
  labelWidth = "w-24",
}: {
  label: string;
  value: number;
  max: number;
  tone?: Tone;
  labelWidth?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <dt className={cn("shrink-0 text-xs text-ink-secondary", labelWidth)}>
        {label}
      </dt>
      <Meter value={value} max={max} tone={tone} className="min-w-0 flex-1" />
      <dd className="tnum w-6 shrink-0 text-right font-mono text-xs text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * A checklist line. Settled items get a filled tick; outstanding ones get an
 * open ring and carry the action, so the same list states both.
 */
export function CheckItem({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6">
      {done ? (
        <span
          aria-hidden="true"
          className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-white"
        >
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 rounded-full ring-1 ring-input ring-inset"
        />
      )}
      <span className={cn("min-w-0", done && "text-ink-secondary")}>
        {children}
      </span>
    </li>
  );
}
