import { describe, expect, it } from "vitest";

import { exactOrigin, withCors } from "./cors.ts";

const site = "https://jobwarden.example";

function handler(calls: Request[] = []) {
  return async (request: Request) => {
    calls.push(request);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function post(origin?: string): Request {
  return new Request("https://project.supabase.co/functions/v1/extract", {
    method: "POST",
    ...(origin === undefined ? {} : { headers: { origin } }),
  });
}

function preflight(origin?: string): Request {
  return new Request("https://project.supabase.co/functions/v1/extract", {
    method: "OPTIONS",
    ...(origin === undefined ? {} : { headers: { origin } }),
  });
}

describe("exactOrigin", () => {
  it.each([
    ["https://jobwarden.example", "https://jobwarden.example"],
    ["http://localhost:3000", "http://localhost:3000"],
  ])("accepts the exact origin %s", (input, expected) => {
    expect(exactOrigin(input)).toBe(expected);
  });

  // Anything with more than an origin in it is a configuration mistake, and a
  // mistake that widened access would be the worst kind.
  it.each([
    undefined,
    "",
    "not a url",
    "ftp://jobwarden.example",
    "https://jobwarden.example/app",
    "https://jobwarden.example/?next=1",
    "https://jobwarden.example/#top",
    "https://user:pass@jobwarden.example",
  ])("refuses %s", (input) => {
    expect(exactOrigin(input as string | undefined)).toBeNull();
  });
});

describe("preflight", () => {
  // The bug this file exists for: an unanswered OPTIONS returned 405, so the
  // browser reported a failed preflight and the invoke threw before the
  // function ran.
  it("answers the preflight for the configured origin", async () => {
    const response = await withCors(handler(), site)(preflight(site));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(site);
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
  });

  it("answers, but allows nothing, for another origin", async () => {
    const response = await withCors(
      handler(),
      site,
    )(preflight("https://attacker.example"));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows nothing when no origin is configured", async () => {
    const response = await withCors(handler(), undefined)(preflight(site));
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not run the handler for a preflight", async () => {
    const calls: Request[] = [];
    await withCors(handler(calls), site)(preflight(site));
    expect(calls).toHaveLength(0);
  });
});

describe("actual requests", () => {
  it("returns the allow header to the configured origin", async () => {
    const response = await withCors(handler(), site)(post(site));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(site);
    expect(await response.json()).toEqual({ ok: true });
  });

  // The bearer token is the real boundary, so the handler still runs — but a
  // browser discards a response it cannot read, which is what stops another
  // site spending a signed-in user's extraction allowance.
  it("withholds the allow header from another origin", async () => {
    const response = await withCors(
      handler(),
      site,
    )(post("https://attacker.example"));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("withholds the allow header when the configured origin is malformed", async () => {
    const response = await withCors(handler(), "jobwarden.example")(post(site));
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  // A server-to-server caller sends no Origin at all and must be untouched.
  it("passes a request with no origin straight through", async () => {
    const calls: Request[] = [];
    const response = await withCors(handler(calls), site)(post());

    expect(calls).toHaveLength(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("marks the response as varying by origin so caches cannot cross them", async () => {
    const response = await withCors(handler(), site)(post(site));
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("preserves the handler's own status and headers", async () => {
    const failing = async () =>
      new Response(JSON.stringify({ error: "unauthorised" }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": "Bearer",
        },
      });

    const response = await withCors(failing, site)(post(site));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("access-control-allow-origin")).toBe(site);
  });
});
