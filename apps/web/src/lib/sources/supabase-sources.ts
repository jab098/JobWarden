import "server-only";

import { z } from "zod";

import type { SourcesRepository } from "./repository";

const rowSchema = z.object({
  id: z.string().uuid(),
  provider: z.string().min(1),
  employer_name: z.string().min(1),
});

type SupabaseSourcesClient = {
  from(table: "job_sources"): {
    select(columns: string): {
      eq(
        column: string,
        value: boolean,
      ): Promise<{ data: unknown; error: unknown }>;
    };
  };
};

function label(row: z.infer<typeof rowSchema>): string {
  return row.provider === "reed" ? "Reed" : row.employer_name;
}

/**
 * Reads the enabled source registry for the filter control. RLS may not
 * grant the signed-in member this table; an empty list is the honest
 * degraded state and simply hides the source filter, it never fails a page.
 */
export function createSupabaseSourcesRepository(
  client: object,
): SourcesRepository {
  const supabaseClient = client as SupabaseSourcesClient;
  return {
    async listEnabled() {
      try {
        const response = await supabaseClient
          .from("job_sources")
          .select("id,provider,employer_name")
          .eq("enabled", true);
        if (response.error) return { sources: [], dataMode: "supabase" };
        const rows = z.array(rowSchema).parse(response.data ?? []);
        return {
          sources: rows
            .map((row) => ({
              id: row.id,
              label: label(row),
              provider: row.provider,
            }))
            .toSorted((a, b) => a.label.localeCompare(b.label, "en-GB")),
          dataMode: "supabase",
        };
      } catch {
        return { sources: [], dataMode: "supabase" };
      }
    },
  };
}
