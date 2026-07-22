import { sourceAttribution } from "@/lib/jobs/source-attribution";
import { cn } from "@/lib/utils";

/**
 * Renders the required source attribution for a listing (e.g. "Jobs by Adzuna")
 * and nothing for sources that need none. Used on every surface a listing
 * appears — search feed, matches feed, detail — so the credit is identical.
 */
export function JobAttribution({
  sourceProvider,
  className,
}: {
  sourceProvider: string | null | undefined;
  className?: string;
}) {
  const attribution = sourceAttribution(sourceProvider);
  if (!attribution) return null;
  return (
    <span className={cn("text-xs text-ink-faint", className)}>
      {attribution}
    </span>
  );
}
