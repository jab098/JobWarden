export type JobsView = "target" | "all";

export function resolveJobsView(
  view: string | undefined,
  enabledProfileCount: number,
): JobsView {
  if (view === "all") return "all";
  if (view === "target") return "target";
  return enabledProfileCount > 0 ? "target" : "all";
}

export function parseIncludeDismissed(
  value: string | string[] | undefined,
): boolean {
  return value === "1";
}

export function targetFeedHref(options: {
  view?: JobsView;
  includeDismissed?: boolean;
}): string {
  const query = new URLSearchParams();
  if (options.view) query.set("view", options.view);
  if (options.includeDismissed) query.set("includeDismissed", "1");
  const qs = query.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}
