export const heardFromOptions = [
  ["search", "A search engine"],
  ["social", "Social media"],
  ["friend", "A friend or colleague"],
  ["community", "A community or forum"],
  ["newsletter", "A newsletter"],
  ["other", "Somewhere else"],
] as const;

export type HeardFrom = (typeof heardFromOptions)[number][0];

export type EarlyAccessState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "unavailable"; message: string };
