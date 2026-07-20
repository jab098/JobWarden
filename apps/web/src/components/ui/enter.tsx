"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const STORE = "jobwarden:seen-surfaces";

function seenSurfaces(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(STORE);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private mode, a full store, a hostile value: never break a page over an
    // animation.
    return new Set();
  }
}

function hasSeen(key: string): boolean {
  if (typeof window === "undefined") return false;
  return seenSurfaces().has(key);
}

function markSeen(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = seenSurfaces();
    if (seen.has(key)) return;
    seen.add(key);
    window.sessionStorage.setItem(STORE, JSON.stringify([...seen]));
  } catch {
    /* Same again: an animation is never worth an exception. */
  }
}

/**
 * Animates its content into view, and re-runs whenever the surface changes.
 *
 * Somewhere new in this session rises into place; somewhere already seen just
 * fades. The movement is what says "this is new", so repeating it every time a
 * reader returns to the same page turns it into noise.
 *
 * Route changes are covered by the route-group templates, which remount this on
 * every navigation. Anything that changes content *without* navigating — an
 * onboarding step advancing through a server action — has to pass its own `id`,
 * because from the router's point of view nothing moved.
 */
export function Enter({
  children,
  id,
  className,
}: {
  children: React.ReactNode;
  /** Defaults to the pathname; pass one when content changes in place. */
  id?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const key = id ?? pathname ?? "root";
  // Keyed on the surface so the inner component genuinely remounts and decides
  // again. A `key` on the rendered element alone would not: this component's
  // own state would survive, and every surface after the first would inherit
  // the first one's answer.
  return (
    <EnterOnce key={key} surfaceKey={key} className={className}>
      {children}
    </EnterOnce>
  );
}

function EnterOnce({
  surfaceKey,
  children,
  className,
}: {
  surfaceKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  // A pure read, so React calling this twice in development returns the same
  // answer. Recording the visit is a side effect and belongs after the commit;
  // doing it here would mark the surface seen during the discarded first pass
  // and every entrance would degrade to a fade.
  const [first] = useState(() => !hasSeen(surfaceKey));

  useEffect(() => {
    markSeen(surfaceKey);
  }, [surfaceKey]);

  return (
    // The server has no session store and always assumes new, so a full
    // document load of an already-seen surface corrects itself during
    // hydration; this covers exactly that one class swap.
    <div
      data-enter={surfaceKey}
      suppressHydrationWarning
      className={cn(first ? "page-enter" : "page-fade", className)}
    >
      {children}
    </div>
  );
}
