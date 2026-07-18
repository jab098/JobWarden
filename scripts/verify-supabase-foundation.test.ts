import { describe, expect, it } from "vitest";

import {
  requiredMigrationFiles,
  verifyFoundationSql,
} from "./verify-supabase-foundation.mjs";

describe("Supabase foundation static verifier", () => {
  it("fails when a required migration is missing", () => {
    const failures = verifyFoundationSql(new Map());

    expect(failures).toContain(
      `missing required migration: ${requiredMigrationFiles[0]}`,
    );
  });

  it("rejects security-definer functions without an empty search path", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );
    files.set(
      requiredMigrationFiles[1],
      `
        create function public.insecure() returns boolean
        language sql stable security definer
        as $$ select true $$;
      `,
    );

    expect(verifyFoundationSql(files)).toContain(
      "security-definer function public.insecure must set search_path to empty",
    );
  });

  it("checks the real migration set when supplied by the caller", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table profiles must enable and force RLS",
        "missing exact approved-users active-jobs policy",
        "missing transaction-scoped source advisory lock",
      ]),
    );
  });

  it("requires the reviewed bootstrap, settings-read, and host-array boundaries", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "missing atomic service-role administrator bootstrap function",
        "missing narrow administrator app-settings getter",
        "job source host arrays must reject NULL entries",
      ]),
    );
  });

  it("requires the hardened source interval and coalesced administrator queue", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "job sources must enforce the 15-minute minimum interval",
        "source mutation must enforce the 15-minute minimum interval",
        "missing bounded administrator ingestion-request function",
        "missing active ingestion-request coalescing index",
        "missing administrator-only ingestion-request read policy",
      ]),
    );
  });

  it("requires the shared bounded queue, recovery lease, and secret-safe London scheduler", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "missing shared scheduled-ingestion enqueue function",
        "missing bounded service-role ingestion claim function",
        "ingestion claim must enforce the four-source global cap",
        "ingestion claims must have a five-minute recovery lease",
        "ingestion lease recovery must enforce the three-attempt ceiling",
        "missing service-role ingestion completion function",
        "scheduler must gate candidate hours in Europe/London",
        "scheduler must cover GMT and BST candidate hours",
        "scheduler must load the project URL from Vault",
        "scheduler must load the cron secret from Vault",
      ]),
    );
  });

  it("rejects literal hosted project URLs or bearer secrets in the schedule migration", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );
    files.set(
      "202607180002_shared_ingestion_runtime.sql",
      "select 'https://example-project.supabase.co', 'Bearer abcdefghijklmnopqrstuvwxyz';",
    );

    expect(verifyFoundationSql(files)).toContain(
      "ingestion schedule migration contains a literal secret or project URL",
    );
  });
});
