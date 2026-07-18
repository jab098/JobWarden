import { GreenhouseAdapter } from "@jobwarden/ingestion";

import { readRuntimeEnvironment } from "../_shared/env.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { createIngestionHandler } from "./handler.ts";
import { createSupabaseIngestionRepository } from "./repository.ts";

const handler = createIngestionHandler({
  readEnvironment: () => readRuntimeEnvironment(Deno.env.toObject()),
  createRepository: (environment) =>
    createSupabaseIngestionRepository(createServiceRoleClient(environment)),
  createAdapter: () => new GreenhouseAdapter(),
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
  log: (record) => console.info(JSON.stringify(record)),
});

Deno.serve(handler);
