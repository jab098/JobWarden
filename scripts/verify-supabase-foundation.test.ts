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

  it("requires canonical occurrence provenance and incremental-safe lifecycle rules", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table job_source_occurrences must enable and force RLS",
        "missing exact source occurrence identity uniqueness",
        "missing compensation provenance constraint",
        "missing complete or incremental source coverage constraint",
        "Reed discovery sources must enforce a six-hour minimum interval",
        "incremental source completion must not advance omissions",
        "missing bounded closing-date lifecycle maintenance",
        "source occurrences must retain validated canonical candidates",
        "missing deterministic canonical rematerialisation",
        "shared queue must admit every database-supported provider",
        "source health must expose a bounded freshness state",
        "source health must count full-time roles",
        "canonical jobs must delegate provider identity uniqueness to occurrences",
        "batch persistence must recheck source state under lock",
        "source finalisation must only close affected canonical jobs",
        "source health must aggregate each source occurrence candidate",
      ]),
    );
  });

  it("requires private owner-only career profile and CV storage boundaries", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table career_profiles must enable and force RLS",
        "public table career_evidence_items must enable and force RLS",
        "public table profile_suggestions must enable and force RLS",
        "public table search_profiles must enable and force RLS",
        "public table cv_documents must enable and force RLS",
        "public table cv_extraction_runs must enable and force RLS",
        "missing private career-document Storage bucket",
        "career-document Storage bucket must be private and capped at 5 MiB",
        "career-document objects must be isolated by owner path",
        "missing approved-owner career-profile policy",
        "missing user-origin career-evidence insert policy",
        "authenticated users must not forge CV-derived evidence",
        "career-evidence review must use a column-limited update grant",
        "missing approved-owner search-profile policy",
        "missing approved-owner suggestion read policy",
        "missing approved-owner CV metadata policy",
        "missing approved-owner extraction-run read policy",
        "profile suggestions must use bounded review states",
        "CV metadata must allow only one current document per user",
        "CV extraction runs must use bounded statuses",
        "CV extraction runs must use bounded sanitised error codes",
        "missing atomic current-CV registration function",
        "missing owner-only suggestion decision function",
        "suggestion decisions must have a narrow authenticated grant",
      ]),
    );
  });
});
