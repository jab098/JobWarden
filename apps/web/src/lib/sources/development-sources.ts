import "server-only";

import { developmentSourceIds } from "@/lib/jobs/development-jobs";
import type { SourcesRepository } from "./repository";

/** Fictional connected sources matching the fixture jobs' source ids. */
export function createDevelopmentSourcesRepository(): SourcesRepository {
  return {
    async listEnabled() {
      return {
        sources: [
          {
            id: developmentSourceIds.northstar,
            label: "Fictional Northstar careers board",
            provider: "greenhouse",
          },
          {
            id: developmentSourceIds.civic,
            label: "Fictional Civic Evidence board",
            provider: "greenhouse",
          },
        ],
        dataMode: "fixtures",
      };
    },
  };
}
