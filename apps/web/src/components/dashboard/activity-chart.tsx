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

const HEIGHT = 144;
const PLOT_TOP = 6;
const PLOT_BOTTOM = HEIGHT - 22;
const AXIS_WIDTH = 26;

/** A rectangle whose top two corners are rounded; the feet stay square. */
function roundedTopBar(
  x: number,
  y: number,
  width: number,
  bottom: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, bottom - y);
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${bottom}`,
    "Z",
  ].join(" ");
}

/**
 * The dashboard's day-by-day bars, drawn by hand: light horizontal grid,
 * quiet mono axes, rounded bars, placeholder-grey feet for empty days, and
 * a hover tooltip. The figure carries the accessible name; the drawing is
 * decoration. No charting dependency: recharts 3 renders empty against this
 * React/Next pair, and eighty lines we own beat a black box we do not.
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
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const step = series.length > 0 ? plotWidth / series.length : 0;
  const barWidth = Math.min(26, Math.max(3, step * 0.62));
  const dense = series.length > 10;
  const labelEvery = dense ? Math.ceil(series.length / 6) : 1;
  const gridValues = peak <= 2 ? [1] : [Math.ceil(peak / 2), peak];

  const yFor = (count: number) =>
    PLOT_BOTTOM - (count / peak) * (PLOT_BOTTOM - PLOT_TOP);

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
            {/* Baseline and value gridlines with mono tick labels. */}
            <line
              x1={AXIS_WIDTH}
              x2={width}
              y1={PLOT_BOTTOM}
              y2={PLOT_BOTTOM}
              stroke="var(--border)"
            />
            {gridValues.map((value) => (
              <g key={value}>
                <line
                  x1={AXIS_WIDTH}
                  x2={width}
                  y1={yFor(value)}
                  y2={yFor(value)}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <text
                  x={AXIS_WIDTH - 7}
                  y={yFor(value) + 3}
                  textAnchor="end"
                  className="fill-ink-faint font-mono text-[9px]"
                >
                  {value}
                </text>
              </g>
            ))}
            {series.map((day, index) => {
              const centre = AXIS_WIDTH + step * index + step / 2;
              const x = centre - barWidth / 2;
              const isHovered = hovered === index;
              return (
                <g key={day.date}>
                  {day.count === 0 ? (
                    <path
                      d={roundedTopBar(
                        x,
                        PLOT_BOTTOM - 3,
                        barWidth,
                        PLOT_BOTTOM,
                        1.5,
                      )}
                      className="fill-border"
                    />
                  ) : (
                    <path
                      d={roundedTopBar(
                        x,
                        yFor(day.count),
                        barWidth,
                        PLOT_BOTTOM,
                        3,
                      )}
                      className="fill-link transition-opacity duration-(--duration-quick)"
                      opacity={
                        hovered === null ? 0.75 : isHovered ? 0.95 : 0.35
                      }
                    />
                  )}
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
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
