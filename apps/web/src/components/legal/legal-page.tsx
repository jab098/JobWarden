import Link from "next/link";

/**
 * Kept in step with docs/privacy/privacy-policy.md by an executable guardrail:
 * a provider that processes personal data must appear in both, so a service
 * cannot be added without being disclosed.
 */
export const subprocessors = [
  {
    name: "Supabase",
    purpose: "database, authentication, and private file storage",
  },
  { name: "Cloudflare", purpose: "application hosting and DNS" },
  { name: "Resend", purpose: "digest email delivery" },
  {
    name: "Sentry",
    purpose:
      "optional error reporting in the EU region, with no default personal data",
  },
] as const;

export function LegalPage({
  title,
  updated,
  children,
}: Readonly<{ title: string; updated: string; children: React.ReactNode }>) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint">
        JobWarden
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-xs text-ink-faint">Last updated {updated}</p>
      <div className="mt-6 space-y-4 text-sm leading-6 text-ink-secondary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <p className="mt-10 text-sm">
        <Link
          href="/"
          className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Back to JobWarden
        </Link>
      </p>
    </main>
  );
}
