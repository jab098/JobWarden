import { describe, expect, it } from "vitest";

import { readNotificationEnvironment } from "./environment.ts";

const valid = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-000000000000",
  INGESTION_CRON_SECRET: "cron-fixture-".repeat(3),
  NOTIFICATION_SITE_URL: "https://jobwarden.example",
  NOTIFICATION_SENDER_ADDRESS: "JobWarden <digests@jobwarden.example>",
};

describe("readNotificationEnvironment", () => {
  it("reads a complete configuration", () => {
    expect(readNotificationEnvironment(valid)).toEqual({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "service-role-key-000000000000",
      cronSecret: "cron-fixture-".repeat(3),
      siteUrl: "https://jobwarden.example",
      senderAddress: "JobWarden <digests@jobwarden.example>",
      dailyLimit: 80,
      monthlyLimit: 2_500,
    });
  });

  it("defaults both ceilings below the documented free allowance", () => {
    const environment = readNotificationEnvironment(valid);
    expect(environment.dailyLimit).toBeLessThan(100);
    expect(environment.monthlyLimit).toBeLessThan(3_000);
  });

  it("accepts owner-configured ceilings", () => {
    expect(
      readNotificationEnvironment({
        ...valid,
        NOTIFICATION_DAILY_LIMIT: "10",
        NOTIFICATION_MONTHLY_LIMIT: "40",
      }),
    ).toMatchObject({ dailyLimit: 10, monthlyLimit: 40 });
  });

  it("accepts a zero ceiling as a deliberate pause", () => {
    expect(
      readNotificationEnvironment({ ...valid, NOTIFICATION_DAILY_LIMIT: "0" }),
    ).toMatchObject({ dailyLimit: 0 });
  });

  it("accepts a bare sender address", () => {
    expect(
      readNotificationEnvironment({
        ...valid,
        NOTIFICATION_SENDER_ADDRESS: "digests@jobwarden.example",
      }),
    ).toMatchObject({ senderAddress: "digests@jobwarden.example" });
  });

  it.each([
    ["a missing service role key", { SUPABASE_SERVICE_ROLE_KEY: "" }],
    ["a short cron secret", { INGESTION_CRON_SECRET: "too-short" }],
    ["a non-origin Supabase URL", { SUPABASE_URL: "https://a.co/path" }],
    ["a credentialled Supabase URL", { SUPABASE_URL: "https://u:p@a.co" }],
    ["a non-HTTP site URL", { NOTIFICATION_SITE_URL: "javascript:alert(1)" }],
    ["a site URL with a query", { NOTIFICATION_SITE_URL: "https://a.co/?x=1" }],
    ["a negative ceiling", { NOTIFICATION_DAILY_LIMIT: "-1" }],
    ["a non-numeric ceiling", { NOTIFICATION_DAILY_LIMIT: "many" }],
    ["a sender without a domain", { NOTIFICATION_SENDER_ADDRESS: "digests@" }],
    [
      "a sender without an address",
      { NOTIFICATION_SENDER_ADDRESS: "JobWarden" },
    ],
    [
      "a sender carrying a header injection",
      {
        NOTIFICATION_SENDER_ADDRESS:
          "a@b.co>\nbcc: victim@example.invalid <c@d.co",
      },
    ],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      readNotificationEnvironment({ ...valid, ...override }),
    ).toThrow("Invalid notification runtime configuration.");
  });
});
