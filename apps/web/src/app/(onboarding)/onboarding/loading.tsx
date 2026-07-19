import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="sr-only">Preparing your setup</p>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-6 h-24 w-full" />
    </main>
  );
}
