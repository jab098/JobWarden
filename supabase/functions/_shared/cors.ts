/**
 * Cross-origin access for a function a browser calls directly.
 *
 * **Supabase adds no CORS handling of its own.** Every function must answer its
 * own preflight, and `extract-career-profile` did not — so a browser's
 * `OPTIONS` request got `405` with no `Access-Control-*` headers, the preflight
 * failed, and `client.functions.invoke` threw before the function ever ran. An
 * owner uploading their first CV saw the document register and then sit at
 * `uploaded` forever, because the caller swallowed that rejection.
 *
 * The function was only ever exercised server-side, where no preflight happens.
 *
 * **Exact origin, never a wildcard.** This endpoint acts on a bearer token, so
 * `Access-Control-Allow-Origin: *` would let any page a signed-in user visits
 * spend their extraction allowance with a token it had obtained. The allowed
 * origin is configured, compared exactly, and echoed back only on a match —
 * the same exact-origin discipline `isTrustedMutationOrigin` applies to the web
 * app's server actions.
 *
 * **It fails closed.** With no configured origin, or an origin that does not
 * match, no `Access-Control-Allow-Origin` is returned and the browser refuses
 * the call. That is the safe direction, and it is safe to rely on *because* the
 * caller now surfaces the failure instead of discarding it.
 */

/** An exact `scheme://host[:port]` origin, with nothing trailing. */
export function exactOrigin(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    return null;
  }
  return parsed.origin;
}

function allowHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "access-control-allow-origin": allowedOrigin,
    // `authorization` carries the caller's session; `apikey` and
    // `x-client-info` are what supabase-js sends on every invoke.
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "600",
    // The allowed origin varies by request, so a shared cache must not serve
    // one origin's response to another.
    vary: "Origin",
  };
}

/**
 * Wraps a handler so a browser can reach it from exactly one configured origin.
 *
 * A request whose `Origin` does not match is still executed — this is not an
 * access control, and the bearer token remains the real one — but it receives
 * no `Access-Control-Allow-Origin`, so a browser discards the response. A
 * server-to-server caller sends no `Origin` and is unaffected.
 */
export function withCors(
  handler: (request: Request) => Promise<Response>,
  configuredOrigin: string | undefined,
): (request: Request) => Promise<Response> {
  const allowed = exactOrigin(configuredOrigin);

  return async (request) => {
    const requestOrigin = request.headers.get("origin");
    const matches =
      allowed !== null && requestOrigin !== null && requestOrigin === allowed;

    if (request.method === "OPTIONS") {
      // 204 either way. Answering the preflight without the allow header is
      // what a browser needs to see to report a CORS refusal rather than a
      // confusing 405 for a method the function does support.
      return new Response(null, {
        status: 204,
        headers: matches ? allowHeaders(allowed) : { vary: "Origin" },
      });
    }

    const result = await handler(request);
    if (!matches) return result;

    const headers = new Headers(result.headers);
    for (const [key, value] of Object.entries(allowHeaders(allowed))) {
      headers.set(key, value);
    }
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  };
}
