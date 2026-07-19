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
      <span role="status" className="text-xs text-[#596173]">
        {state.message}
      </span>
    );
  }
  return (
    <span role="alert" className="text-xs text-[#8a3328]">
      {state.message}
    </span>
  );
}
