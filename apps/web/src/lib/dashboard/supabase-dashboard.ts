import "server-only";

import { buildDashboard, type DashboardInput } from "@jobwarden/domain";
import { z } from "zod";

import {
  readApplicationRecords,
  toDashboardApplications,
} from "@/lib/applications/supabase-applications";
import { createSupabaseExploreRepository } from "@/lib/explore/supabase-explore";
import { createSupabaseProfileRepository } from "@/lib/profile/supabase-profile";
import { createSupabaseTargetFeedRepository } from "@/lib/target-feed/supabase-target-feed";

import type { DashboardRepository } from "./repository";
import type { DashboardResult } from "./types";

const RECENT_DELIVERY_WINDOW = 200;

const decisionRowSchema = z.object({
  decision: z.enum(["saved", "dismissed", "considering"]),
  updated_at: z.string().min(1),
});

const deliveryRowSchema = z.object({
  status: z.enum([
    "pending",
    "sent",
    "failed",
    "suppressed_no_matches",
    "suppressed_daily_cap",
    "suppressed_monthly_cap",
  ]),
  created_at: z.string().min(1),
});

const pathwayDecisionSchema = z.object({
  decision: z.enum(["dismissed", "promoted"]),
});

const jobFirstSeenSchema = z.object({
  id: z.string().uuid(),
  first_seen_at: z.string().min(1),
});

type QueryResponse = { data: unknown; error: unknown };

type DashboardClient = {
  from(table: string): {
    select(columns: string): Promise<QueryResponse> & {
      in(
        column: string,
        values: readonly string[],
      ): { limit(count: number): Promise<QueryResponse> };
      maybeSingle(): Promise<QueryResponse>;
      order(
        column: string,
        options: { ascending: boolean },
      ): { limit(count: number): Promise<QueryResponse> };
    };
  };
};

function data(response: QueryResponse): unknown {
  if (response.error !== null && response.error !== undefined) {
    throw new Error("query failed");
  }
  return response.data;
}

export function createSupabaseDashboardRepository(
  client: object,
): DashboardRepository {
  const supabaseClient = client as DashboardClient;
  const exploreRepository = createSupabaseExploreRepository(client);
  const profileRepository = createSupabaseProfileRepository(client);
  const targetFeedRepository = createSupabaseTargetFeedRepository(client);

  return {
    async getDashboard(windowDays: number): Promise<DashboardResult> {
      try {
        const [records, snapshot, feed, decisionsResponse, deliveriesResponse] =
          await Promise.all([
            readApplicationRecords(client),
            profileRepository.getSnapshot(),
            // Reuses the Target Feed itself, so the dashboard's match count is
            // the same number the feed shows rather than a second estimate.
            targetFeedRepository.getFeed({ includeDismissed: false }),
            supabaseClient
              .from("career_job_decisions")
              .select("decision,updated_at"),
            supabaseClient
              .from("career_notification_deliveries")
              .select("status,created_at")
              .order("created_at", { ascending: false })
              .limit(RECENT_DELIVERY_WINDOW),
          ]);

        // Reuses the Explore surface itself rather than reporting a figure the
        // dashboard would have to derive a second way.
        const [explore, pathwayDecisionsResponse] = await Promise.all([
          exploreRepository.getExplore(),
          supabaseClient.from("career_pathway_decisions").select("decision"),
        ]);

        const matchIds = feed.items.map((item) => item.job.id);
        const firstSeen = new Map<string, string>();
        if (matchIds.length > 0) {
          const jobsResponse = await supabaseClient
            .from("jobs")
            .select("id,first_seen_at")
            .in("id", matchIds)
            .limit(matchIds.length);
          for (const row of z
            .array(jobFirstSeenSchema)
            .parse(data(jobsResponse) ?? [])) {
            firstSeen.set(row.id, row.first_seen_at);
          }
        }

        const pathwayDecisions = z
          .array(pathwayDecisionSchema)
          .parse(data(pathwayDecisionsResponse) ?? []);

        const input: DashboardInput = {
          now: new Date(),
          windowDays,
          applications: toDashboardApplications(records),
          jobDecisions: z
            .array(decisionRowSchema)
            .parse(data(decisionsResponse) ?? [])
            .map((row) => ({
              decision: row.decision,
              decidedAt: row.updated_at,
            })),
          matchingJobs: feed.items.flatMap((item) => {
            const seenAt = firstSeen.get(item.job.id);
            return seenAt === undefined
              ? []
              : [
                  {
                    firstSeenAt: seenAt,
                    profileName: item.explanation.profileName,
                  },
                ];
          }),
          enabledSearchProfiles: feed.enabledProfileNames,
          explore: {
            enabled: explore.enabled,
            qualifyingCount: explore.items.length,
            dismissedCount: pathwayDecisions.filter(
              (row) => row.decision === "dismissed",
            ).length,
            promotedCount: pathwayDecisions.filter(
              (row) => row.decision === "promoted",
            ).length,
          },
          profile: {
            confirmedEvidenceCount: snapshot.evidence.filter(
              (item) => item.confirmationState === "confirmed",
            ).length,
            enabledSearchCount: snapshot.searches.filter(
              (search) => search.enabled,
            ).length,
            hasCv: snapshot.currentCv !== null,
            cvKind: snapshot.currentCv?.kind ?? null,
          },
          notificationDeliveries: z
            .array(deliveryRowSchema)
            .max(RECENT_DELIVERY_WINDOW)
            .parse(data(deliveriesResponse) ?? [])
            .map((row) => ({ status: row.status, createdAt: row.created_at })),
        };

        return { ...buildDashboard(input), dataMode: snapshot.dataMode };
      } catch {
        throw new Error("Unable to load your dashboard");
      }
    },
  };
}
