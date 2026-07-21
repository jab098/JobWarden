import {
  AdapterError,
  AshbyAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  ReedAdapter,
  TeachingVacanciesAdapter,
} from "@jobwarden/ingestion";

import { readRuntimeEnvironment } from "../_shared/env.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { createIngestionHandler } from "./handler.ts";
import { createSupabaseIngestionRepository } from "./repository.ts";

const handler = createIngestionHandler({
  readEnvironment: () => readRuntimeEnvironment(Deno.env.toObject()),
  createRepository: (environment) =>
    createSupabaseIngestionRepository(createServiceRoleClient(environment)),
  createAdapter: (source, environment) => {
    if (source.provider === "greenhouse") return new GreenhouseAdapter();
    if (source.provider === "lever") return new LeverAdapter();
    if (source.provider === "ashby") return new AshbyAdapter();
    if (source.provider === "teaching_vacancies") {
      return new TeachingVacanciesAdapter();
    }
    if (!environment.reedApiKey) {
      throw new AdapterError(
        "configuration_error",
        "Reed API key is not configured.",
        0,
      );
    }
    return new ReedAdapter({ apiKey: environment.reedApiKey });
  },
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
  log: (record) => console.info(JSON.stringify(record)),
});

Deno.serve(handler);
