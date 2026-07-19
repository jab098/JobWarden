import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Only the two fields a client actually needs. Depending on one function's full
 * runtime contract here would drag that function's whole import graph into
 * every other function that shares this module.
 */
export type ServiceRoleCredentials = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

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
  environment: ServiceRoleCredentials,
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
