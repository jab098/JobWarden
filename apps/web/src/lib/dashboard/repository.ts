import "server-only";

import type { DashboardResult } from "./types";

/** Read-only by design: the dashboard adds no mutation path anywhere. */
export interface DashboardRepository {
  getDashboard(windowDays: number): Promise<DashboardResult>;
}
