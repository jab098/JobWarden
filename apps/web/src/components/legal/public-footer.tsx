import Link from "next/link";

/**
 * The quiet legal row on the public pages. It has to be findable without being
 * hunted for — a beta that reads CVs should not make its privacy policy a
 * direct-URL secret — but it is not competing with the call to action, so it
 * carries no visual weight beyond meeting contrast.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-border pt-5 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-ink-secondary">
        <p>JobWarden · UK private beta</p>
        <nav aria-label="Legal" className="flex items-center gap-5">
          <Link
            href="/privacy"
            className="rounded-sm underline-offset-4 hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="rounded-sm underline-offset-4 hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
