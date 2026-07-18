import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { RuntimeEnvironment } from "../ingest-jobs/contracts.ts";

export type RpcResponse = Promise<{ data: unknown; error: unknown }>;

export type IngestionRpcClient = {
  rpc(name: string, parameters?: Record<string, unknown>): RpcResponse;
};

type ClientFactory = (
  url: string,
  key: string,
  options: {
    auth: {
      autoRefreshToken: false;
      detectSessionInUrl: false;
      persistSession: false;
    };
  },
) => IngestionRpcClient;

export function createServiceRoleClient(
  environment: RuntimeEnvironment,
  createClient: ClientFactory = createSupabaseClient as unknown as ClientFactory,
): IngestionRpcClient {
  return createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
