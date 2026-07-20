export type FeedbackState =
  | { kind: "idle" }
  | {
      kind: "success" | "invalid" | "forbidden" | "unavailable";
      message: string;
    };

export function ActionFeedback({ state }: { state: FeedbackState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "success") {
    return (
      <span role="status" className="text-xs text-ink-secondary">
        {state.message}
      </span>
    );
  }
  return (
    <span role="alert" className="text-xs text-danger">
      {state.message}
    </span>
  );
}
