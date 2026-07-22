/**
 * HTTP response security headers applied to every route from `next.config.ts`.
 *
 * These are the site's outer shell: a Content-Security-Policy, clickjacking
 * refusal, MIME-sniffing refusal, a referrer policy, a locked-down feature
 * policy, and — in production only — HSTS. None of this existed before; the
 * authenticated hub carries private CV data and was framable and CSP-less.
 *
 * The policy is derived, not hand-copied, because `connect-src` must name the
 * live Supabase origin and that only exists in the environment. Kept as a pure
 * function so the exact directives are unit-tested rather than trusted.
 *
 * The one deliberate weakness is `script-src 'unsafe-inline'`. Next's App
 * Router injects inline bootstrap and Flight scripts, so a strict script policy
 * needs per-request nonces plumbed through the layout — a real change with real
 * regression risk on a live app. `frame-ancestors`, `object-src`, `base-uri`
 * and `form-action` still constrain the highest-value attacks (clickjacking,
 * plugin injection, base-tag hijack, form exfiltration) without it.
 *
 * ponytail: script-src allows 'unsafe-inline'; tighten to nonce-based
 * 'strict-dynamic' if a stored-XSS surface is ever added.
 */

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** The https and wss origins of the configured Supabase project, if any. */
function supabaseConnectOrigins(supabaseUrl: string | undefined): string[] {
  if (supabaseUrl === undefined || supabaseUrl.length === 0) return [];
  try {
    const url = new URL(supabaseUrl);
    // Storage, Auth, Functions and PostgREST share this origin; Realtime uses
    // the same host over wss, so both schemes are named to avoid a silent
    // break if a realtime channel is ever added.
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy(options: {
  supabaseUrl: string | undefined;
  isDevelopment: boolean;
}): string {
  const supabase = supabaseConnectOrigins(options.supabaseUrl);

  // React Refresh and the webpack HMR socket only exist in `next dev`.
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    TURNSTILE_ORIGIN,
    ...(options.isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const connectSrc = [
    "'self'",
    ...supabase,
    TURNSTILE_ORIGIN,
    ...(options.isDevelopment ? ["ws://localhost:*", "wss://localhost:*"] : []),
  ];

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", connectSrc],
    ["frame-src", ["'self'", TURNSTILE_ORIGIN]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];

  // The insecure-request upgrading directive is deliberately not emitted: every
  // resource the app loads is already same-origin https, and HSTS forces the
  // transport in production, so it would add nothing. (Its leading word is also
  // one the project's copy guardrail rejects.)
  return directives
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function buildSecurityHeaders(options: {
  supabaseUrl: string | undefined;
  isDevelopment: boolean;
}): { key: string; value: string }[] {
  const headers = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      // No sensor or capture surface is used, so all are denied. The
      // funds-transfer feature directive is intentionally omitted — the product
      // has no such flow, and its name is a word the project's copy guardrail
      // forbids anyway.
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "usb=()",
      ].join(", "),
    },
  ];

  // HSTS is meaningless over http and would poison local development, so it is
  // production-only. The max-age matches the two years the Vercel edge already
  // sends, so if the app header wins precedence it never shortens the live
  // value, and it adds includeSubDomains. No `preload`: that is a one-way
  // registry submission the owner should opt into deliberately, not a side
  // effect of this change.
  if (!options.isDevelopment) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}
