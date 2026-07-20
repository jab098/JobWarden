"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A collapsible panel that grows and shrinks instead of blinking in and out.
 *
 * The panel is one grid row animated between `0fr` and `1fr`. Nothing measures
 * a height, so a four-line explanation and a forty-line one open at the same
 * speed, and the page below is pushed down smoothly rather than jumping. The
 * layout the browser gives `<details>` cannot do this: a closed disclosure is
 * not rendered at all, and Chrome does not run transitions on
 * `::details-content`, so the panel here is a real element.
 *
 * The trigger is a button with `aria-expanded` and `aria-controls`, matching
 * what `<summary>` reported. The collapsed panel is `inert`, so its content
 * leaves the tab order and the accessibility tree rather than lurking at zero
 * height.
 */
export function Disclosure({
  label,
  children,
  className,
  panelClassName,
  defaultOpen = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  defaultOpen?: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-md border border-border", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-2 text-left text-sm font-medium text-link transition-colors duration-150 ease-out outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className={cn(
            "size-2 fill-none stroke-current transition-transform duration-(--duration-quick) ease-(--ease-smooth-out) motion-reduce:transition-none",
            open && "rotate-90",
          )}
        >
          <path d="M2.5 1 L5.5 4 L2.5 7" strokeWidth="1.2" />
        </svg>
        {label}
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-(--duration-fast) ease-(--ease-smooth-out) motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        {/* The row can only collapse to nothing if its content may overflow;
            `min-h-0` stops the grid item claiming its intrinsic height. */}
        <div className="min-h-0 overflow-hidden">
          <div className={cn("border-t border-border", panelClassName)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
