import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  requiredMigrationFiles,
  verifyFoundationSql,
} from "./verify-supabase-foundation.mjs";

function migration(name: string): string {
  return readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    {
      encoding: "utf8",
    },
  )
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function migrations(): Map<string, string> {
  return new Map(
    requiredMigrationFiles.map((file) => [
      file,
      readFileSync(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    ]),
  );
}

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
        "real CV uploads must remain database-disabled by default",
        "missing server-derived career CV activation gate",
        "career-document writes must require the database activation gate",
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

  it("requires atomic owner claims, one-user concurrency, and auditable AI ceilings", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table career_ai_daily_usage must enable and force RLS",
        "missing auditable career AI daily usage counter",
        "career AI daily usage must have a hard free-tier ceiling",
        "career AI must reserve its application-wide daily ceiling atomically",
        "career AI must enforce the application-wide daily allowance",
        "missing atomic owner-derived career extraction claim",
        "career extraction claims must fail while real CV uploads are disabled",
        "career extraction claim must use a per-user transaction lock",
        "career extraction claim must enforce one concurrent run per user",
        "career extraction completion must be token-fenced and service-role only",
      ]),
    );
  });

  it("requires a service-only caller-free extraction claim contract", () => {
    const sql = migration("202607180005_career_extraction_runtime.sql");

    expect(sql).toContain(
      "claim_career_profile_extraction( target_user_id uuid, target_document_id uuid, idempotency_key_value text )",
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.claim_career_profile_extraction\([^;]+to authenticated/u,
    );
    expect(sql).toMatch(
      /grant execute on function public\.claim_career_profile_extraction\(uuid, uuid, text\) to service_role/u,
    );
  });

  it("requires durable owner-controlled UTC AI accounting", () => {
    const sql = migration("202607180005_career_extraction_runtime.sql");

    expect(sql).toMatch(
      /career_ai_daily_allowance integer not null default 0 check \( career_ai_daily_allowance between 0 and 25 \)/u,
    );
    expect(sql).toContain("usage_date date primary key");
    expect(sql).not.toContain(
      "references public.career_profiles (user_id) on delete cascade",
    );
    expect(sql).toContain("clock_timestamp() at time zone 'utc'");
  });

  it("requires lease-token fencing for renewal and every completion definition", () => {
    const runtime = migration("202607180005_career_extraction_runtime.sql");
    const retention = migration(
      "202607180007_career_profile_review_and_retention.sql",
    );

    expect(runtime).toContain("add column claim_token uuid");
    expect(runtime).toContain("add column lease_expires_at timestamptz");
    expect(runtime).toContain(
      "renew_career_profile_extraction_lease( target_run_id uuid, target_claim_token uuid )",
    );
    for (const sql of [runtime, retention]) {
      expect(sql).toContain(
        "complete_career_profile_extraction( target_run_id uuid, target_claim_token uuid",
      );
      expect(sql).toContain("run.claim_token = target_claim_token");
      expect(sql).toContain("run.lease_expires_at > clock_timestamp()");
      expect(sql).toContain("auth.role() is distinct from 'service_role'");
    }
  });

  it("fails when the real token-fenced completion grant is removed", () => {
    const files = migrations();
    const runtimeFile = "202607180005_career_extraction_runtime.sql";
    const runtime = files.get(runtimeFile);
    if (runtime === undefined) throw new Error("runtime migration missing");
    const tokenFencedGrant = `grant execute on function public.complete_career_profile_extraction(
  uuid, uuid, text, jsonb, text, integer, integer, integer
) to service_role;`;
    expect(runtime).toContain(tokenFencedGrant);
    files.set(runtimeFile, runtime.replace(tokenFencedGrant, ""));

    expect(verifyFoundationSql(files)).toContain(
      "career extraction completion must be token-fenced and service-role only",
    );
  });

  it("requires durable onboarding signals and owner-derived save and deletion RPCs", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "career profile must persist target role families",
        "missing owner-derived atomic career profile save",
        "career profile CV references must remain owner-bound and current",
        "missing owner-derived named search save",
        "missing race-safe current CV deletion",
        "missing owner-derived profile deletion",
        "career profile deletion must not bypass Storage-first cleanup",
      ]),
    );
  });

  it("requires materialised evidence review and 24-hour raw proposal expiry", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "successful extraction proposals must expire after 24 hours",
        "successful extraction must materialise reviewable evidence",
        "CV extraction must not overwrite explicit user evidence",
        "missing owner-only career evidence decision function",
        "missing bounded raw proposal expiry function",
        "missing storage-first inactive CV cleanup function",
        "missing hourly raw proposal expiry schedule",
        "failed CV replacement must restore the last usable document",
      ]),
    );
  });
});
