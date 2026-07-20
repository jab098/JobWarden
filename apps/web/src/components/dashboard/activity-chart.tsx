"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { DayCount } from "@jobwarden/domain";

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

function formatDay(date: string): string {
  return dayLabel.format(new Date(`${date}T00:00:00Z`));
}

const HEIGHT = 148;
const PLOT_TOP = 8;
const PLOT_BOTTOM = HEIGHT - 22;
const AXIS_WIDTH = 28;
/** Empty days keep a visible foot so the day still reads as measured. */
const FOOT = 3;
/** Flat-topped columns; just enough radius to soften the corner. */
const BAR_RADIUS = 2;

/**
 * The dashboard's day-by-day columns, drawn by hand: three evenly spaced
 * gridlines with quiet mono ticks, flat-topped columns standing on the
 * baseline in graphite ink, grey feet for days with nothing, and a hover band
 * with a tooltip. The figure carries the accessible name; the drawing is
 * decoration. No charting dependency: recharts 3 renders empty against this
 * React/Next pair, and seventy lines we own beat a black box we do not.
 */
export function ActivityChart({
  series,
  label,
  unit,
}: {
  series: readonly DayCount[];
  label: string;
  unit: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // A believable default width lets the server render real bars; the
  // measurement only corrects it once mounted, so nothing flashes empty.
  const [width, setWidth] = useState(520);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const measured = box.getBoundingClientRect().width;
      if (measured > 0) setWidth(measured);
    };
    measure();
    // jsdom has no ResizeObserver; the initial measure alone is fine there.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const peak = Math.max(1, ...series.map((day) => day.count));
  // A quiet week should look like a quiet week. Without a floor under the axis
  // a single event paints a full-height column and overstates itself.
  // Three evenly spaced ticks, so the top gridline is always a whole number.
  const tickStep = Math.max(1, Math.ceil(Math.max(3, peak) / 3));
  const axisTop = tickStep * 3;
  const ticks = [tickStep, tickStep * 2, axisTop];
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const step = series.length > 0 ? plotWidth / series.length : 0;
  const barWidth = Math.min(18, Math.max(4, step * 0.56));
  const dense = series.length > 10;
  const labelEvery = dense ? Math.ceil(series.length / 6) : 1;

  const yFor = (count: number) =>
    PLOT_BOTTOM - (count / axisTop) * (PLOT_BOTTOM - PLOT_TOP);

  const hoveredDay = hovered === null ? null : series[hovered];

  return (
    <figure role="img" aria-label={label} className="relative m-0">
      <div ref={boxRef} aria-hidden="true" className="h-36 w-full">
        {width > 0 && series.length > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Gridlines first, so the columns stand in front of them. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={AXIS_WIDTH}
                  x2={width}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="var(--border)"
                />
                <text
                  x={AXIS_WIDTH - 8}
                  y={yFor(tick) + 3}
                  textAnchor="end"
                  className="fill-ink-faint font-mono text-[9px]"
                >
                  {tick}
                </text>
              </g>
            ))}
            <line
              x1={AXIS_WIDTH}
              x2={width}
              y1={PLOT_BOTTOM}
              y2={PLOT_BOTTOM}
              stroke="var(--input)"
            />
            <text
              x={AXIS_WIDTH - 8}
              y={PLOT_BOTTOM + 3}
              textAnchor="end"
              className="fill-ink-faint font-mono text-[9px]"
            >
              0
            </text>
            {series.map((day, index) => {
              const centre = AXIS_WIDTH + step * index + step / 2;
              const x = centre - barWidth / 2;
              const top =
                day.count === 0 ? PLOT_BOTTOM - FOOT : yFor(day.count);
              return (
                <g key={day.date}>
                  {hovered === index ? (
                    <rect
                      x={AXIS_WIDTH + step * index + 1}
                      y={PLOT_TOP - 4}
                      width={Math.max(0, step - 2)}
                      height={PLOT_BOTTOM - PLOT_TOP + 4}
                      rx={3}
                      className="fill-surface-sunken"
                    />
                  ) : null}
                  <rect
                    x={x}
                    y={top}
                    width={barWidth}
                    height={PLOT_BOTTOM - top}
                    rx={BAR_RADIUS}
                    className={day.count === 0 ? "fill-border" : "fill-data"}
                  />
                  {index % labelEvery === 0 ? (
                    <text
                      x={centre}
                      y={HEIGHT - 6}
                      textAnchor="middle"
                      className="fill-ink-faint font-mono text-[9px]"
                    >
                      {formatDay(day.date)}
                    </text>
                  ) : null}
                  {/* Full-column hover target so small bars are easy to hit. */}
                  <rect
                    x={AXIS_WIDTH + step * index}
                    y={0}
                    width={step}
                    height={HEIGHT}
                    fill="transparent"
                    onMouseEnter={() => setHovered(index)}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
      {hoveredDay ? (
        <div
          aria-hidden="true"
          className="card-surface pointer-events-none absolute z-10 -translate-x-1/2 px-2.5 py-1.5 text-xs shadow-[var(--shadow-card-raised)]"
          style={{
            left: AXIS_WIDTH + step * hovered! + step / 2,
            top: -8,
          }}
        >
          <p className="font-medium whitespace-nowrap text-foreground">
            {formatDay(hoveredDay.date)}
          </p>
          <p className="tnum mt-0.5 font-mono whitespace-nowrap text-ink-secondary">
            {hoveredDay.count} {unit}
          </p>
        </div>
      ) : null}
    </figure>
  );
}
