import Link from "next/link";

export default function JobNotFound() {
  return (
    <main className="mx-auto max-w-3xl bg-white px-5 py-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
        Listing unavailable
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
        This job could not be found
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">
        It may have closed, or the listing address may be incomplete.
      </p>
      <Link
        href="/jobs"
        className="mt-7 inline-flex rounded-sm text-sm font-semibold text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        Return to UK jobs
      </Link>
    </main>
  );
}
