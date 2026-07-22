import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/lib/security-headers";

const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // The floating dev-tools badge photobombs local screenshots and the
  // owner's design review; errors still overlay when they happen.
  devIndicators: false,

  // Security response headers on every route. The hub serves private CV data
  // and had none of these — no CSP, and framable from any origin. Derived from
  // the environment because the CSP must name the live Supabase origin; see
  // src/lib/security-headers.ts for the reasoning behind each directive.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          isDevelopment,
        }),
      },
    ];
  },
};

export default nextConfig;
