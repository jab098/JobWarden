import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <AppShell dataMode="supabase" activePath="profile">
      <div className="mx-auto min-h-screen max-w-6xl bg-white px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-ink-faint">
          Preparing your career profile
        </p>
        <Skeleton className="mt-3 h-10 w-64 max-w-full" />
        <div className="mt-8 space-y-5 border-t border-border pt-8">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </AppShell>
  );
}
