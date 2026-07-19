import "server-only";

import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { createClient } from "@/lib/supabase/server";

export class ExportUnavailableError extends Error {
  constructor(readonly reason: "preview" | "unavailable") {
    super(`Export unavailable: ${reason}`);
    this.name = "ExportUnavailableError";
  }
}

export interface ExportRepository {
  exportOwnData(): Promise<unknown>;
}

type ExportClient = {
  rpc(name: string): Promise<{ data: unknown; error: unknown }>;
};

export function createSupabaseExportRepository(
  client: object,
): ExportRepository {
  const supabaseClient = client as ExportClient;

  return {
    async exportOwnData() {
      const { data, error } = await supabaseClient.rpc(
        "export_career_profile_data",
      );
      if (error !== null && error !== undefined) {
        throw new ExportUnavailableError("unavailable");
      }
      return data;
    },
  };
}

/**
 * The preview refuses rather than serving fictional data as if it were a real
 * subject-access response.
 */
export function createDevelopmentExportRepository(): ExportRepository {
  return {
    async exportOwnData() {
      throw new ExportUnavailableError("preview");
    },
  };
}

export async function getExportRepository(): Promise<ExportRepository> {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  if (developmentAccess.enabled) return createDevelopmentExportRepository();

  return createSupabaseExportRepository(await createClient());
}
