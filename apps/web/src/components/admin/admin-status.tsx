import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  enabled: "Enabled",
  disabled: "Disabled",
  current: "Review current",
  due_soon: "Review due soon",
  overdue: "Review overdue",
  queued: "Queued",
  claimed: "Claimed",
  completed: "Completed",
  cancelled: "Cancelled",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

const stateClasses: Record<string, string> = {
  pending: "border-[#d8a646] bg-[#fff7df] text-[#6f4d07]",
  approved: "border-[#8eb39f] bg-[#edf7f1] text-[#235b3b]",
  enabled: "border-[#8eb39f] bg-[#edf7f1] text-[#235b3b]",
  current: "border-[#8eb39f] bg-[#edf7f1] text-[#235b3b]",
  succeeded: "border-[#8eb39f] bg-[#edf7f1] text-[#235b3b]",
  rejected: "border-[#d9a3a3] bg-[#fff0ef] text-[#7d2d2d]",
  suspended: "border-[#d9a3a3] bg-[#fff0ef] text-[#7d2d2d]",
  failed: "border-[#d9a3a3] bg-[#fff0ef] text-[#7d2d2d]",
  overdue: "border-[#d9a3a3] bg-[#fff0ef] text-[#7d2d2d]",
  due_soon: "border-[#d8a646] bg-[#fff7df] text-[#6f4d07]",
};

export function AdminStatus({ state }: { state: string }) {
  return (
    <Badge
      variant="outline"
      className={
        stateClasses[state] ?? "border-[#cdd2db] bg-white text-[#4f5869]"
      }
    >
      {labels[state] ?? state}
    </Badge>
  );
}
