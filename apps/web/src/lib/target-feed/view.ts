export function parseIncludeDismissed(
  value: string | string[] | undefined,
): boolean {
  return value === "1";
}

export function matchesHref(options: { includeDismissed?: boolean }): string {
  return options.includeDismissed ? "/matches?includeDismissed=1" : "/matches";
}
