import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Support
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
          JobWarden is a private beta run by one person. Help comes from the
          owner, not a ticket queue.
        </p>
      </header>

      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold tracking-[-0.01em]">
          Something broken or confusing?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
          Contact the owner who invited you, through the channel they invited
          you on, with the page address and what you expected to happen. Nothing
          in JobWarden reports your activity anywhere, so a report from you is
          the only way a problem gets seen.
        </p>
        <h2 className="mt-5 border-t border-border pt-4 text-base font-semibold tracking-[-0.01em]">
          Your data and this beta
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
          How data is handled is written down, not implied: read the{" "}
          <Link
            href="/privacy"
            className="rounded-sm text-link underline decoration-border underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            privacy policy
          </Link>{" "}
          and{" "}
          <Link
            href="/terms"
            className="rounded-sm text-link underline decoration-border underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            terms
          </Link>
          . Exporting or deleting everything you have stored is always available
          from{" "}
          <Link
            href="/settings"
            className="rounded-sm text-link underline decoration-border underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Settings
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
