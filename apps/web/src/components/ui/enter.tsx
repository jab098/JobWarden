"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

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
 * Owner decision, 2026-07-20: **every** arrival animates. This previously rose
 * into place the first time a surface was seen in a session and merely faded on
 * every return, on the argument that movement means "this is new" and repeating
 * it is noise. The owner asked for the entrance on every step and every page
 * change, so the distinction is gone and `page-fade` is now used only by the
 * cross-document view transition.
 *
 * Route changes are covered by the route-group templates, which remount this on
 * every navigation. Anything that changes content *without* navigating — an
 * onboarding step advancing through a server action — has to pass its own `id`,
 * because from the router's point of view nothing moved.
 *
 * The visit is still recorded in session storage. It no longer selects the
 * animation; it is the observable that proves this subtree hydrated, which is
 * what the Task 27 regression test asserts and the only cheap proof available.
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
  useEffect(() => {
    markSeen(surfaceKey);
  }, [surfaceKey]);

  return (
    // No `suppressHydrationWarning` any more, and that is a gain rather than an
    // omission. It existed because the class depended on session storage, which
    // the server cannot read, so server and client legitimately disagreed on
    // one class. The class is now the same in both, so a mismatch here would be
    // a real defect — and the Task 27 hydration test can see it, where before
    // the suppression would have hidden it.
    <div data-enter={surfaceKey} className={cn("page-enter", className)}>
      {children}
    </div>
  );
}
