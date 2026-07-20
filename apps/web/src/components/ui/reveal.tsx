"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Reveals its content as the reader reaches it, rather than when the page
 * mounts. Fade and rise only — blur belongs to page-level entrances
 * (`page-enter-blur`), not to components.
 *
 * Three things this deliberately gets right, each of which is a way the naive
 * version breaks:
 *
 * - **It fails visible.** The hidden state is applied from an effect, never in
 *   the server-rendered markup, so JavaScript off, an old browser, a hydration
 *   failure, or an observer that never fires all leave the content on screen.
 *   The alternative — hiding in CSS and revealing with JavaScript — turns every
 *   one of those into a blank page.
 * - **It reveals once.** The observer disconnects on first intersection, so
 *   scrolling back up does not replay the entrance. Movement means "this is
 *   new"; repeating it on every pass is the noise `enter.tsx` already avoids.
 * - **It respects reduced motion.** The global rule collapses the duration, but
 *   an element would still flash through its hidden state, so the hidden state
 *   is never applied at all when the reader has asked for less motion.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
  /** Reveal slightly before the element's edge, so it is not still moving when read. */
  rootMargin = "0px 0px -10% 0px",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
  rootMargin?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "pending" | "shown">("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // `matchMedia` is absent in jsdom and in some embedded webviews. Treating
    // that as "no preference" would be a guess about a reader's accessibility
    // setting, so an unanswerable question means no animation at all.
    const canAskAboutMotion = typeof window.matchMedia === "function";
    if (!canAskAboutMotion || typeof IntersectionObserver === "undefined") {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A viewport with no height cannot be intersected, so hiding against it
    // would hide the content permanently. Measured at zero in an embedded
    // preview pane during development; prerendering and some headless contexts
    // do the same. Stay visible rather than gamble on it.
    const viewportHeight = window.innerHeight || 0;
    if (viewportHeight <= 0) return;

    // Already in view on first paint: this is above the fold and belongs to the
    // page's own entrance, so it is left alone rather than hidden and re-shown.
    const box = element.getBoundingClientRect();
    if (box.top < viewportHeight && box.bottom > 0) return;

    setState("pending");

    // An observer always reports an initial state shortly after `observe`.
    // If nothing arrives at all, the observer is not working and the content
    // would stay hidden forever, so it is shown instead. This does not fire
    // for content that is merely unscrolled: that case still produces a
    // callback, it just reports `isIntersecting: false`.
    let acknowledged = false;
    const failSafe = window.setTimeout(() => {
      if (!acknowledged) setState("shown");
    }, 500);

    const observer = new IntersectionObserver(
      (entries) => {
        acknowledged = true;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => {
      window.clearTimeout(failSafe);
      observer.disconnect();
    };
  }, [rootMargin]);

  return (
    <Tag
      ref={ref as never}
      data-reveal={state === "idle" ? undefined : state}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
