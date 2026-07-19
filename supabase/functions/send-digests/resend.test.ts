import { afterEach, describe, expect, it, vi } from "vitest";

import { createResendSender, readResendApiKey } from "./resend.ts";

const message = {
  subject: "2 new UK matches in JobWarden",
  text: "plain text body",
  html: "<h1>html body</h1>",
};

function send(signal = new AbortController().signal) {
  return createResendSender("rw_test_key_000000000000000000").send({
    to: "person@example.invalid",
    from: "JobWarden <digests@jobwarden.example>",
    message,
    signal,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readResendApiKey", () => {
  it("accepts a plausible credential", () => {
    expect(
      readResendApiKey({ RESEND_API_KEY: "re_abcdefghijklmnopqrst" }),
    ).toBe("re_abcdefghijklmnopqrst");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["too short", "re_short"],
    ["containing whitespace", "re_abcdefghij klmnopqrst"],
    ["containing a control character", "re_abcdefghijklmnop\nqrst"],
  ])("returns null for a %s credential", (_label, value) => {
    expect(readResendApiKey({ RESEND_API_KEY: value })).toBeNull();
  });
});

describe("createResendSender", () => {
  it("posts the digest and returns the provider message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(send()).resolves.toEqual({
      status: "sent",
      providerMessageId: "message-1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(
      "Bearer rw_test_key_000000000000000000",
    );
    expect(JSON.parse(init.body)).toEqual({
      from: "JobWarden <digests@jobwarden.example>",
      to: ["person@example.invalid"],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  });

  it("succeeds without a message id when the provider body is unexpected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(send()).resolves.toEqual({
      status: "sent",
      providerMessageId: null,
    });
  });

  it.each([
    [401, "provider_unauthorised"],
    [403, "provider_unauthorised"],
    [422, "provider_rejected_payload"],
    [429, "provider_rate_limited"],
    [500, "provider_unavailable"],
    [418, "provider_error"],
  ])("maps status %i to the sanitised code %s", async (status, errorCode) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("person@example.invalid is not permitted", { status }),
        ),
    );

    await expect(send()).resolves.toEqual({ status: "failed", errorCode });
  });

  it("never leaks the provider body into the recorded outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("rejected recipient person@example.invalid", {
          status: 422,
        }),
      ),
    );

    const outcome = await send();

    expect(JSON.stringify(outcome)).not.toContain("person@example.invalid");
  });

  it("reports an unreachable provider without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network down")),
    );

    await expect(send()).resolves.toEqual({
      status: "failed",
      errorCode: "provider_unreachable",
    });
  });

  it("reports an aborted send without throwing", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(send()).resolves.toEqual({
      status: "failed",
      errorCode: "provider_timed_out",
    });
  });

  it("honours the caller's deadline signal", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        if (init.signal?.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          return Promise.reject(error);
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );

    await expect(send(controller.signal)).resolves.toEqual({
      status: "failed",
      errorCode: "provider_timed_out",
    });
  });
});
