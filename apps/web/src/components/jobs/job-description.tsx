"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// 12 lines at leading-7 (1.75rem) = 21rem = 336px. Clipping on a line-height
// multiple lands the cut on a line boundary, so no gradient fade is needed to
// hide a half-line — the design system forbids gradients anyway.
const COLLAPSED_HEIGHT_CLASS = "max-h-[21rem]";
const COLLAPSED_HEIGHT_PX = 336;

// A first guess so clearly-long text starts collapsed rather than flashing full
// then snapping shut; the measured value below corrects every case.
const LIKELY_LONG_CHARS = 1100;

/**
 * A job's role description: readable width, paragraphed when the source carries
 * breaks, and collapsed to a preview when it is genuinely long, so a wall of
 * text does not push everything else off the page. The control appears only when
 * the content actually overflows the preview height — measured, not guessed from
 * a character count, which does not track how many lines the text wraps to.
 * Descriptions ingested before paragraph breaks were preserved arrive as one
 * block and render as one paragraph; the collapse still tames their length.
 */
export function JobDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(text.length > LIKELY_LONG_CHARS);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bodyRef.current;
    if (element) setOverflows(element.scrollHeight > COLLAPSED_HEIGHT_PX + 4);
  }, [text]);

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const clamped = overflows && !expanded;

  return (
    <div className={className}>
      <div
        ref={bodyRef}
        className={cn(
          "space-y-3 text-sm leading-7 text-ink-secondary [overflow-wrap:anywhere]",
          clamped && `${COLLAPSED_HEIGHT_CLASS} overflow-hidden`,
        )}
      >
        {paragraphs.length > 1 ? (
          paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>{text}</p>
        )}
      </div>
      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-2.5 rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
