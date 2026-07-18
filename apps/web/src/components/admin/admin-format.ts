export function formatAdminDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "In progress";
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

export function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
