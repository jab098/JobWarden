export function ProtectedLoadingView() {
  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="h-8 border-b border-[#d8d2c7]" />
        <div role="status" className="grid min-h-[70vh] content-center gap-4">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          <p className="text-sm font-medium">Checking your access…</p>
          <span className="sr-only">Loading the protected workspace</span>
        </div>
      </div>
    </main>
  );
}
