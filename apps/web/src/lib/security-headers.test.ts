import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "./security-headers";

const supabaseUrl = "https://abcdefgh.supabase.co";

describe("buildContentSecurityPolicy", () => {
  it("names the Supabase https and wss origins in connect-src", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl,
      isDevelopment: false,
    });
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://abcdefgh.supabase.co");
    expect(csp).toContain("wss://abcdefgh.supabase.co");
  });

  it("allows the Cloudflare Turnstile script and frame", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl,
      isDevelopment: false,
    });
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  });

  it("refuses framing and plugin/base/form injection", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl,
      isDevelopment: false,
    });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("adds the dev-only eval and HMR socket sources only in development", () => {
    const dev = buildContentSecurityPolicy({
      supabaseUrl,
      isDevelopment: true,
    });
    const prod = buildContentSecurityPolicy({
      supabaseUrl,
      isDevelopment: false,
    });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("ws://localhost:*");
  });

  it("degrades to no Supabase origin rather than emitting a broken directive", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: undefined,
      isDevelopment: false,
    });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("undefined");
  });
});

describe("buildSecurityHeaders", () => {
  it("sends HSTS in production and never in development", () => {
    const prod = buildSecurityHeaders({ supabaseUrl, isDevelopment: false });
    const dev = buildSecurityHeaders({ supabaseUrl, isDevelopment: true });
    expect(prod.map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(dev.map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });

  it("never uses preload, which is a deliberate owner opt-in", () => {
    const hsts = buildSecurityHeaders({
      supabaseUrl,
      isDevelopment: false,
    }).find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).not.toContain("preload");
  });

  it("denies sensors and capture without naming a pricing-guardrail word", () => {
    const permissions = buildSecurityHeaders({
      supabaseUrl,
      isDevelopment: false,
    }).find((h) => h.key === "Permissions-Policy");
    expect(permissions?.value).toContain("camera=()");
    expect(permissions?.value).toContain("microphone=()");
    // The pricing guardrail rejects "payment"; the directive must stay absent.
    expect(permissions?.value).not.toContain("payment");
  });

  it("sets clickjacking, sniffing, and referrer headers", () => {
    const keys = buildSecurityHeaders({
      supabaseUrl,
      isDevelopment: false,
    }).map((h) => h.key);
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Content-Security-Policy");
  });
});
