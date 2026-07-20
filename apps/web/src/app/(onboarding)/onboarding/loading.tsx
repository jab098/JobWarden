import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped and placed like the step it stands in for: same width token, same
 * vertical centring. A skeleton at a different width from its page moves the
 * whole column the moment the content lands.
 */
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col px-5 py-10">
      <main className="mx-auto my-auto w-full max-w-flow">
        <p className="sr-only">Preparing your setup</p>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-6 h-4 w-full max-w-md" />
        <Skeleton className="mt-6 h-7 w-48" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-6 h-24 w-full" />
      </main>
    </div>
  );
}
