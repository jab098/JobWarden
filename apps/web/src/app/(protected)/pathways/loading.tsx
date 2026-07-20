export default function LoadingExplore() {
  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-border px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-ink-faint">
          United Kingdom only
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
          Explore adjacent careers
        </h1>
      </header>
      <p
        role="status"
        className="px-5 py-16 text-sm text-ink-secondary sm:px-8"
      >
        Checking your confirmed evidence against the pathway taxonomy…
      </p>
    </div>
  );
}
