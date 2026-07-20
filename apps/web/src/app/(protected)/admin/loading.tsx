export default function AdminLoading() {
  return (
    <main
      className="mx-auto max-w-page px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      aria-busy="true"
    >
      <p className="sr-only" role="status">
        Loading administrator workspace
      </p>
      <div className="h-3 w-28 animate-pulse rounded bg-[#d8d4cb]" />
      <div className="mt-5 h-10 w-52 animate-pulse rounded bg-[#d8d4cb]" />
      <div className="mt-12 space-y-4 border-y border-[#dedad1] py-5">
        <div className="h-4 w-3/5 animate-pulse rounded bg-[#dedad1]" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-[#dedad1]" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-[#dedad1]" />
      </div>
    </main>
  );
}
