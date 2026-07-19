import type { ExploreActionState } from "@/lib/explore/types";

export function ActionFeedback({ state }: { state: ExploreActionState }) {
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
