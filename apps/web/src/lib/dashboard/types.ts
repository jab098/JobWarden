import type { Dashboard } from "@jobwarden/domain";

export type DashboardResult = Dashboard & {
  dataMode: "supabase" | "fixtures";
};
