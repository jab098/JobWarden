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
        "public table career_profile_generations must enable and force RLS",
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
        "missing approved-owner career-profile read policy",
        "missing user-origin career-evidence insert policy",
        "authenticated users must not forge CV-derived evidence",
        "missing approved-owner search-profile read policy",
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

  it("forbids direct profile/search writes, evidence confirmation, and immutable owner-path updates", () => {
    const files = migrations();
    const profileMigration = migration("202607180004_career_profiles.sql");

    expect(profileMigration).not.toMatch(
      /grant update \([^)]*confirmation_state[^)]*\) on public\.career_evidence_items to authenticated/u,
    );
    expect(profileMigration).not.toContain(
      'create policy "approved users replace own career documents"',
    );
    expect(profileMigration).not.toMatch(
      /grant (?:insert|update|all)[^;]*on public\.search_profiles to authenticated/u,
    );
    expect(profileMigration).not.toMatch(
      /grant (?:insert|update|all)[^;]*on public\.career_profiles to authenticated/u,
    );

    const profileFile = "202607180004_career_profiles.sql";
    files.set(
      profileFile,
      `${files.get(profileFile)}
        grant update (confirmation_state) on public.career_evidence_items to authenticated;
        create policy "unsafe career document replacement"
        on storage.objects for update to authenticated
        using (bucket_id = 'career-documents');
        grant insert, update on public.search_profiles to authenticated;
        grant insert, update on public.career_profiles to authenticated;`,
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "authenticated callers must not directly update evidence confirmation state",
        "career-document owner paths must not have an UPDATE policy",
        "authenticated callers must save named searches through the evidence-bound RPC",
        "authenticated callers must save career profiles through the generation-fenced RPC",
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
        "missing transactionally consistent career profile snapshot",
        "career profile snapshot must return a durable generation tombstone",
        "career profile snapshot must return searches in stable creation and ID order",
        "career profile saves must lock and compare the snapshot generation",
        "profile deletion must advance the generation tombstone before cascading data",
        "career profile CV references must remain owner-bound and current",
        "missing owner-derived named search save",
        "named search saves must lock and compare the snapshot generation",
        "saved search evidence must be pruned after evidence removal",
        "evidence-only searches must be invalidated when their final signal is removed",
        "search skill arrays must enforce unique concepts",
        "search responsibility arrays must enforce unique concepts",
        "crafted named-search RPC input must reject duplicate evidence concepts",
        "evidence pruning must share the generation mutex with named search saves",
        "direct evidence deletion must lock the generation before row mutation",
        "evidence decisions must lock the generation before the evidence row",
        "inactive CV purge must lock the generation before checking Storage",
        "extraction completion must lock the generation before the run row",
        "named search saves must atomically establish the owner profile root",
        "missing race-safe current CV deletion",
        "missing owner-derived profile deletion",
        "career profile deletion must not bypass Storage-first cleanup",
        "CV uploads must use generation-bound upload intents",
        "career-document Storage inserts must hold the generation mutex",
        "CV registration must require matching generation-bound upload intent",
        "profile deletion must lock the generation before checking Storage",
      ]),
    );
  });

  it("requires one lock order for evidence, search, upload, registration, and deletion races", () => {
    const files = migrations();
    const profileFile = "202607180004_career_profiles.sql";
    const workflowFile = "202607180006_career_profile_workflow.sql";
    const retentionFile =
      "202607180007_career_profile_review_and_retention.sql";
    files.set(
      profileFile,
      (files.get(profileFile) ?? "")
        .replace(/career_cv_upload_intents/gu, "removed_upload_intents")
        .replace(/career_cv_upload_intent_allows/gu, "removed_upload_guard")
        .replace(/for update/gu, "for share"),
    );
    files.set(
      workflowFile,
      (files.get(workflowFile) ?? "")
        .replace(
          /insert into public\.career_profiles \(user_id\)/gu,
          "insert into public.removed_profile_root (user_id)",
        )
        .replace(/for update/gu, "for share"),
    );
    files.set(
      retentionFile,
      (files.get(retentionFile) ?? "").replace(/for update/gu, "for share"),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "evidence pruning must share the generation mutex with named search saves",
        "direct evidence deletion must lock the generation before row mutation",
        "evidence decisions must lock the generation before the evidence row",
        "inactive CV purge must lock the generation before checking Storage",
        "extraction completion must lock the generation before the run row",
        "named search saves must atomically establish the owner profile root",
        "CV uploads must use generation-bound upload intents",
        "career-document Storage inserts must hold the generation mutex",
        "CV registration must require matching generation-bound upload intent",
        "profile deletion must lock the generation before checking Storage",
      ]),
    );
  });

  it("requires both first-search sessions to overlap at a shared concurrency barrier", () => {
    const sql = readFileSync(
      new URL(
        "../supabase/tests/011_career_profile_concurrency.sql",
        import.meta.url,
      ),
      "utf8",
    )
      .toLowerCase()
      .replace(/\s+/gu, " ");

    expect(sql).toContain("pg_advisory_lock(20260718001100)");
    expect(
      sql.match(/pg_advisory_xact_lock_shared\(20260718001100\)/gu),
    ).toHaveLength(2);
    expect(sql).toContain("connection_name = 'first_search_a'");
    expect(sql).toContain("connection_name = 'first_search_b'");
    expect(sql).toContain("pg_advisory_unlock(20260718001100)");
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

  it("requires an owner-fenced, mutex-guarded job decisions table and RPC", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table career_job_decisions must enable and force RLS",
        "missing career job decisions table",
        "career job decisions must enforce one decision per owner and job",
        "career job decisions must use bounded decision values",
        "missing owner-fenced job decision RPC",
        "job decision RPC must validate decision value",
        "job decision RPC must have its narrow authenticated grant",
        "career profile deletion must also erase job decisions",
      ]),
    );
  });

  it("requires the job decision RPC to hold the generation mutex before validating the job", () => {
    const files = migrations();
    const targetFeedFile = "202607190001_target_feed.sql";
    files.set(
      targetFeedFile,
      (files.get(targetFeedFile) ?? "").replace(/for update/gu, "for share"),
    );

    expect(verifyFoundationSql(files)).toContain(
      "job decisions must lock the generation mutex before validating the job",
    );
  });

  it("forbids direct writes to career_job_decisions", () => {
    const files = migrations();
    const targetFeedFile = "202607190001_target_feed.sql";
    files.set(
      targetFeedFile,
      `${files.get(targetFeedFile) ?? ""}
        create policy "unsafe job decision write"
        on public.career_job_decisions for insert to authenticated
        with check (owner_id = auth.uid());`,
    );

    expect(verifyFoundationSql(files)).toContain(
      "browser mutation policy forbidden on public.career_job_decisions",
    );
  });

  it("requires the opt-in explore schema, RPCs, and deletion coverage", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table career_explore_settings must enable and force RLS",
        "public table career_pathway_decisions must enable and force RLS",
        "public table explore_pathway_analytics must enable and force RLS",
        "missing explore settings table",
        "missing pathway decisions table",
        "missing aggregate pathway analytics table",
        "pathway decisions must enforce one decision per owner and pathway",
        "missing explore opt-in RPC",
        "missing owner-fenced pathway decision RPC",
        "pathway decision RPC must validate decision value",
        "pathway decision RPC must have its narrow authenticated grant",
        "explore opt-in RPC must have its narrow authenticated grant",
        "career profile deletion must also erase pathway decisions",
        "career profile deletion must also erase explore settings",
        "missing curated explore pathway seed table",
        "pathway decision RPC must reject non-curated pathways",
        "pathway decisions must reference the curated taxonomy",
        "aggregate pathway analytics must reference the curated taxonomy",
        "pathway analytics must count decision transitions only",
      ]),
    );
  });

  it("requires the audited application tracker schema and RPCs", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table career_applications must enable and force RLS",
        "public table career_application_events must enable and force RLS",
        "missing career applications table",
        "missing append-only application events table",
        "applications must enforce one tracked application per owner and job",
        "missing owner-fenced application tracking RPC",
        "missing owner-fenced application transition RPC",
        "application transitions must be validated against the explicit map",
        "application transitions must append an audit event",
        "missing owner-fenced application plan RPC",
        "missing owner-fenced application deletion RPC",
        "career profile deletion must also erase applications",
        "career profile deletion must also erase application events",
      ]),
    );
  });

  it("forbids direct authenticated mutation of application state", () => {
    const files = migrations();
    const trackerFile = "202607190003_application_tracker.sql";
    files.set(
      trackerFile,
      `${files.get(trackerFile) ?? ""}
        grant insert, update on public.career_applications to authenticated;
        create policy "unsafe event write"
        on public.career_application_events for insert to authenticated
        with check (owner_id = auth.uid());`,
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "authenticated callers must change applications through the owner-fenced RPCs",
        "browser mutation policy forbidden on public.career_application_events",
      ]),
    );
  });

  it("keeps the SQL application transition map in lockstep with the domain", async () => {
    const { applicationTransitions } =
      await import("../packages/domain/src/applications.ts");
    const migrationSql = migration("202607190003_application_tracker.sql");
    const pairsMatch = migrationSql.match(
      /\(current_stage, target_stage\) in \((.*?\))\s*\)\s*then/u,
    );
    const sqlPairs = [
      ...(pairsMatch?.[1] ?? "").matchAll(/\('([a-z]+)', '([a-z]+)'\)/gu),
    ].map((entry) => `${entry[1]}->${entry[2]}`);

    const domainPairs = Object.entries(applicationTransitions).flatMap(
      ([from, targets]) => targets.map((to: string) => `${from}->${to}`),
    );

    expect(sqlPairs.toSorted()).toEqual(domainPairs.toSorted());
  });

  it("keeps the SQL pathway seed in lockstep with the domain taxonomy", async () => {
    const { careerPathways } =
      await import("../packages/domain/src/explore.ts");
    const migrationSql = migration("202607190002_explore_pathways.sql");
    const seedMatch = migrationSql.match(
      /insert into public\.explore_pathways \(pathway_concept\) values(.*?);/u,
    );
    const seeded = [...(seedMatch?.[1] ?? "").matchAll(/\('([^']+)'\)/gu)].map(
      (entry) => entry[1],
    );

    expect(seeded.toSorted()).toEqual(
      careerPathways.map((pathway) => pathway.normalizedConcept).toSorted(),
    );
  });

  it("requires aggregate pathway analytics to stay ownerless and grammar-bound", () => {
    const exploreFile = "202607190002_explore_pathways.sql";

    const withOwner = migrations();
    withOwner.set(
      exploreFile,
      (withOwner.get(exploreFile) ?? "").replace(
        "create table public.explore_pathway_analytics (",
        "create table public.explore_pathway_analytics (\n  owner_id uuid,",
      ),
    );
    expect(verifyFoundationSql(withOwner)).toContain(
      "aggregate pathway analytics must not carry an owner or user column",
    );

    const withoutGrammar = migrations();
    withoutGrammar.set(
      exploreFile,
      (withoutGrammar.get(exploreFile) ?? "").replace(
        /create table public\.explore_pathway_analytics \([\s\S]*?\);/u,
        `create table public.explore_pathway_analytics (
          pathway_concept text not null,
          event text not null,
          event_count bigint not null default 0,
          primary key (pathway_concept, event)
        );`,
      ),
    );
    expect(verifyFoundationSql(withoutGrammar)).toContain(
      "aggregate pathway analytics must constrain concepts to the normalised grammar",
    );
  });

  it("forbids direct authenticated mutation of explore state", () => {
    const files = migrations();
    const exploreFile = "202607190002_explore_pathways.sql";
    files.set(
      exploreFile,
      `${files.get(exploreFile) ?? ""}
        grant insert, update on public.career_pathway_decisions to authenticated;
        create policy "unsafe explore toggle"
        on public.career_explore_settings for update to authenticated
        using (owner_id = auth.uid());`,
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "authenticated callers must decide pathways through the owner-fenced RPC",
        "authenticated callers must toggle explore through the owner-fenced RPC",
        "browser mutation policy forbidden on public.career_explore_settings",
      ]),
    );
  });

  it("still closes every other definer function to anon", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );
    files.set(
      requiredMigrationFiles[1],
      `
        create function public.another_unsubscribe() returns boolean
        language sql security definer set search_path = ''
        as $$ select true $$;
        grant execute on function public.another_unsubscribe() to anon;
      `,
    );

    expect(verifyFoundationSql(files)).toContain(
      "security-definer function public.another_unsubscribe must revoke public and anon execution",
    );
  });

  it("requires the anon-executable unsubscribe function to revoke public", () => {
    const files = migrations();
    const notificationFile = "202607190004_scheduled_notifications.sql";
    files.set(
      notificationFile,
      (files.get(notificationFile) ?? "").replace(
        "revoke all on function public.unsubscribe_career_notifications(uuid) from public;",
        "",
      ),
    );

    expect(verifyFoundationSql(files)).toContain(
      "deliberately anon-executable function public.unsubscribe_career_notifications must still revoke public execution",
    );
  });

  it("forbids a direct authenticated mutation grant on the notification tables", () => {
    const files = migrations();
    const notificationFile = "202607190004_scheduled_notifications.sql";
    files.set(
      notificationFile,
      `${files.get(notificationFile) ?? ""}
        grant insert, update on public.career_notification_settings to authenticated;
        create policy "unsafe delivery write"
        on public.career_notification_deliveries for insert to authenticated
        with check (owner_id = auth.uid());`,
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "authenticated callers must change career_notification_settings through the owner-fenced RPC",
        "authenticated callers must change career_notification_deliveries through the owner-fenced RPC",
        "browser mutation policy forbidden on public.career_notification_deliveries",
      ]),
    );
  });

  it("forbids a direct authenticated mutation grant on career_job_decisions", () => {
    const files = migrations();
    const targetFeedFile = "202607190001_target_feed.sql";
    files.set(
      targetFeedFile,
      `${files.get(targetFeedFile) ?? ""}
        grant insert, update on public.career_job_decisions to authenticated;`,
    );

    expect(verifyFoundationSql(files)).toContain(
      "authenticated callers must decide career jobs through the owner-fenced RPC",
    );
  });
});
