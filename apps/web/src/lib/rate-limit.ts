import "server-only";

/** The minimum surface of a Supabase client the rate limiter needs. */
type RateLimitClient = {
  // PromiseLike, not Promise: the Supabase client returns an awaitable query
  // builder rather than a bare promise, and `await` handles both.
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Consumes one unit of the caller's per-user quota for `bucket` and returns
 * whether the request may proceed.
 *
 * Fail-open by design: a rate limiter is a guard, not a gate. If the RPC errors
 * — the migration is not yet applied, the database is briefly unavailable — the
 * request is allowed rather than blocked, so a broken limiter can never take an
 * expensive route offline. The database is the source of truth because the app
 * runs on many serverless instances and an in-memory counter would not be shared
 * between them.
 */
export async function withinRateLimit(
  client: RateLimitClient,
  bucket: string,
  maxPerWindow: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("consume_rate_limit", {
      bucket_name: bucket,
      max_per_window: maxPerWindow,
      window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}
