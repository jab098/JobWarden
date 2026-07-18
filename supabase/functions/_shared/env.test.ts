import { describe, expect, it } from "vitest";

import { readRuntimeEnvironment } from "./env";

const validEnvironment = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key-with-adequate-length",
  INGESTION_CRON_SECRET: "cron-fixture-".repeat(3),
};

describe("ingestion runtime environment", () => {
  it.each([
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "INGESTION_CRON_SECRET",
  ] as const)("fails closed when %s is missing", (name) => {
    expect(() =>
      readRuntimeEnvironment({ ...validEnvironment, [name]: undefined }),
    ).toThrow("Invalid ingestion runtime configuration");
  });

  it.each([
    "javascript:alert(1)",
    "https://user:pass@fixture.supabase.co",
    "https://fixture.supabase.co/rest/v1",
    "https://fixture.supabase.co?secret=1",
    "https://fixture.supabase.co/#fragment",
  ])("rejects a non-origin Supabase URL: %s", (supabaseUrl) => {
    expect(() =>
      readRuntimeEnvironment({
        ...validEnvironment,
        SUPABASE_URL: supabaseUrl,
      }),
    ).toThrow("Invalid ingestion runtime configuration");
  });

  it("normalises an exact HTTP(S) origin without exposing source variables", () => {
    expect(
      readRuntimeEnvironment({
        ...validEnvironment,
        SUPABASE_URL: "https://FIXTURE.supabase.co:443/",
      }),
    ).toEqual({
      supabaseUrl: "https://fixture.supabase.co",
      serviceRoleKey: validEnvironment.SUPABASE_SERVICE_ROLE_KEY,
      cronSecret: validEnvironment.INGESTION_CRON_SECRET,
    });
  });

  it("keeps Reed optional globally but returns a configured provider key", () => {
    expect(readRuntimeEnvironment(validEnvironment)).not.toHaveProperty(
      "reedApiKey",
    );
    expect(
      readRuntimeEnvironment({
        ...validEnvironment,
        REED_API_KEY: "reed-fixture-key",
      }),
    ).toMatchObject({ reedApiKey: "reed-fixture-key" });
  });

  it.each(["x".repeat(513), "key\nwith-control"])(
    "rejects an unsafe Reed key without echoing it: %s",
    (reedApiKey) => {
      const error = (() => {
        try {
          readRuntimeEnvironment({
            ...validEnvironment,
            REED_API_KEY: reedApiKey,
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toEqual(
        new Error("Invalid ingestion runtime configuration."),
      );
      expect(JSON.stringify(error)).not.toContain(reedApiKey);
    },
  );
});
