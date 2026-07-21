import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const requiredMigrationFiles = [
  "202607170001_foundation.sql",
  "202607170002_rls_and_functions.sql",
  "202607170003_audit_and_ingestion.sql",
  "202607180001_admin_operations.sql",
  "202607180002_shared_ingestion_runtime.sql",
  "202607180003_uk_coverage_compensation.sql",
  "202607180004_career_profiles.sql",
  "202607180005_career_extraction_runtime.sql",
  "202607180006_career_profile_workflow.sql",
  "202607180007_career_profile_review_and_retention.sql",
  "202607190001_target_feed.sql",
  "202607190002_explore_pathways.sql",
  "202607190003_application_tracker.sql",
  "202607190004_scheduled_notifications.sql",
  "202607190005_cv_tailoring.sql",
  "202607190006_data_export.sql",
  "202607190007_onboarding_state.sql",
  "202607190008_onboarding_answers.sql",
  "202607190009_admin_observability.sql",
  "202607190010_onboarding_completion.sql",
  "202607200001_cv_upload_client.sql",
  "202607200002_location_radius.sql",
  "202607200003_job_locations_writer.sql",
  "202607200004_ingestion_drop_visibility.sql",
  "202607200005_digest_schedule.sql",
  "202607220001_early_access_list.sql",
  "202607220002_uk_places_seed.sql",
  "202607220003_drop_legacy_upsert_ingested_job.sql",
];

const publicTables = [
  "profiles",
  "access_requests",
  "user_roles",
  "audit_log",
  "job_sources",
  "jobs",
  "job_locations",
  "ingestion_runs",
  "ingestion_source_runs",
  "ingestion_requests",
  "job_source_occurrences",
  "career_profiles",
  "career_profile_generations",
  "career_cv_upload_intents",
  "career_evidence_items",
  "profile_suggestions",
  "search_profiles",
  "cv_documents",
  "cv_extraction_runs",
  "career_ai_daily_usage",
  "career_job_decisions",
  "career_explore_settings",
  "career_pathway_decisions",
  "explore_pathway_analytics",
  "explore_pathways",
  "career_applications",
  "career_application_events",
  "career_notification_settings",
  "career_notification_announcements",
  "career_notification_deliveries",
  "career_cv_variants",
  "career_onboarding_state",
  // Both were created before this list had a completeness check and so were
  // never verified here. Live inspection on 2026-07-21 confirmed each already
  // enables and forces RLS, and that no public table lacks it.
  "uk_places",
  "early_access_signups",
];

// Reviewed exceptions to the "definer functions are closed to anon" rule.
// Adding a name here is a security decision, not a convenience.
const anonExecutableDefinerFunctions = new Set([
  "public.unsubscribe_career_notifications",
  // The early-access dialog lives on the public landing page, so the caller is
  // anonymous by definition and there is no session to bind to. Reviewed on
  // 2026-07-21, when widening this file to read every migration made
  // `202607220001_early_access_list.sql` visible to these rules for the first
  // time; the grant itself shipped earlier, in PR #31.
  //
  // What makes it acceptable: `early_access_signups` revokes all from public,
  // anon and authenticated, so this function is the only way in and no caller
  // can read the list back. It returns void. The email is format-checked and
  // length-capped, free text is truncated, `heard_from` collapses to 'other'
  // outside a fixed allowlist, and the insert is `on conflict (email) do
  // update`, so a repeated submission updates one row instead of adding rows.
  // Volume from distinct addresses is a Turnstile concern at the app layer, not
  // something the grant can settle.
  "public.join_early_access",
]);

function compact(sql) {
  return sql.toLowerCase().replace(/\s+/g, " ").trim();
}

function securityDefinerFunctions(sql) {
  const functions = [];
  const pattern =
    /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_.]+)\s*\([^)]*\)[\s\S]*?\$\$;/gi;

  for (const match of sql.matchAll(pattern)) {
    if (/\bsecurity\s+definer\b/i.test(match[0])) {
      functions.push({ name: match[1].toLowerCase(), definition: match[0] });
    }
  }

  return functions;
}

export function verifyFoundationSql(files) {
  const failures = [];

  for (const file of requiredMigrationFiles) {
    if (!files.has(file)) failures.push(`missing required migration: ${file}`);
  }

  // The reverse direction matters just as much. A migration present on disk but
  // absent from the list used to be invisible to every rule in this file, which
  // is how four of them — including one that creates a table and grants on it —
  // went unverified. Adding a migration must mean adding it here.
  for (const file of files.keys()) {
    if (!requiredMigrationFiles.includes(file)) {
      failures.push(
        `migration not listed in requiredMigrationFiles, so it is unverified: ${file}`,
      );
    }
  }

  // The revoke-after-drop check below compares offsets inside the concatenated
  // SQL, which only tracks execution order while this list is chronological.
  // It is sorted by construction — the names are timestamp-prefixed — but the
  // dependency is invisible at the append site, so state it here.
  const chronological = [...requiredMigrationFiles].sort();
  if (
    requiredMigrationFiles.some((file, index) => file !== chronological[index])
  ) {
    failures.push(
      "requiredMigrationFiles must stay in chronological order; ordering checks depend on it",
    );
  }

  const sql = [...files.values()].join("\n");
  const normalised = compact(sql);

  for (const table of publicTables) {
    const enable = `alter table public.${table} enable row level security;`;
    const force = `alter table public.${table} force row level security;`;
    if (!normalised.includes(enable) || !normalised.includes(force)) {
      failures.push(`public table ${table} must enable and force RLS`);
    }
  }

  // As with the migration list, the reverse direction is what stops the list
  // going quietly stale: a table created in a migration but never added to
  // `publicTables` had its RLS checked by nothing at all.
  for (const match of normalised.matchAll(
    /create table (?:if not exists )?public\.([a-z0-9_]+)/g,
  )) {
    const table = match[1];
    if (!publicTables.includes(table)) {
      failures.push(
        `table public.${table} is not listed in publicTables, so its RLS is unverified`,
      );
    }
  }

  const exactJobsPolicy = compact(`
    create policy "approved users read active jobs"
    on public.jobs for select to authenticated
    using (public.has_approved_access() and lifecycle_status = 'active');
  `);
  if (!normalised.includes(exactJobsPolicy)) {
    failures.push("missing exact approved-users active-jobs policy");
  }

  const requiredFragments = [
    [
      "proposal_expires_at = case when requested_status = 'succeeded' then clock_timestamp() + interval '24 hours' else null end",
      "successful extraction proposals must expire after 24 hours",
    ],
    [
      "insert into public.career_evidence_items ( id, user_id, cv_document_id",
      "successful extraction must materialise reviewable evidence",
    ],
    [
      "where public.career_evidence_items.origin = 'cv'",
      "CV extraction must not overwrite explicit user evidence",
    ],
    [
      "create or replace function public.decide_career_evidence(",
      "missing owner-only career evidence decision function",
    ],
    [
      "create or replace function public.expire_career_profile_proposals()",
      "missing bounded raw proposal expiry function",
    ],
    [
      "create or replace function public.purge_inactive_cv_document( target_document_id uuid, expected_storage_path text )",
      "missing storage-first inactive CV cleanup function",
    ],
    [
      "'jobwarden-career-proposal-expiry', '17 * * * *', 'select public.expire_career_profile_proposals()'",
      "missing hourly raw proposal expiry schedule",
    ],
    [
      "create trigger restore_cv_after_failed_extraction after update of status on public.cv_extraction_runs",
      "failed CV replacement must restore the last usable document",
    ],
    [
      "add column target_role_families jsonb not null default '[]'::jsonb",
      "career profile must persist target role families",
    ],
    [
      "create or replace function public.save_career_profile_draft( expected_generation bigint, draft_value jsonb )",
      "missing owner-derived atomic career profile save",
    ],
    [
      "create or replace function public.get_career_profile_snapshot()",
      "missing transactionally consistent career profile snapshot",
    ],
    [
      "'generation', coalesce(( select fence.generation from public.career_profile_generations as fence where fence.user_id = actor_user_id ), 0)",
      "career profile snapshot must return a durable generation tombstone",
    ],
    [
      "jsonb_agg(to_jsonb(search) order by search.created_at, search.id)",
      "career profile snapshot must return searches in stable creation and ID order",
    ],
    [
      "where document.id = cv_document_id_value and document.user_id = actor_user_id and document.is_current",
      "career profile CV references must remain owner-bound and current",
    ],
    [
      "create or replace function public.save_search_profile( target_search_id uuid, expected_generation bigint, draft_value jsonb )",
      "missing owner-derived named search save",
    ],
    [
      "create trigger prune_search_profile_evidence_after_change after delete or update of confirmation_state, category, normalized_concept on public.career_evidence_items",
      "saved search evidence must be pruned after evidence removal",
    ],
    [
      "delete from public.search_profiles as search",
      "evidence-only searches must be invalidated when their final signal is removed",
    ],
    [
      "public.text_array_has_unique_values(skill_concepts)",
      "search skill arrays must enforce unique concepts",
    ],
    [
      "public.text_array_has_unique_values(responsibility_concepts)",
      "search responsibility arrays must enforce unique concepts",
    ],
    [
      "message = 'search evidence concepts must be unique'",
      "crafted named-search RPC input must reject duplicate evidence concepts",
    ],
    [
      "using (public.lock_career_profile_generation(user_id))",
      "direct evidence deletion must lock the generation before row mutation",
    ],
    [
      "create table public.career_cv_upload_intents",
      "CV uploads must use generation-bound upload intents",
    ],
    [
      "create or replace function public.begin_career_cv_upload( expected_generation bigint, storage_path_value text )",
      "CV uploads must use generation-bound upload intents",
    ],
    [
      "and public.career_cv_upload_intent_allows(name)",
      "career-document Storage inserts must hold the generation mutex",
    ],
    [
      "create or replace function public.register_cv_document( expected_generation bigint",
      "CV registration must require matching generation-bound upload intent",
    ],
    [
      "create or replace function public.delete_current_cv( target_document_id uuid, expected_storage_path text )",
      "missing race-safe current CV deletion",
    ],
    [
      "create or replace function public.delete_career_profile_data()",
      "missing owner-derived profile deletion",
    ],
    [
      "grant select on public.career_profiles, public.career_profile_generations, public.search_profiles to authenticated",
      "career profile deletion must not bypass Storage-first cleanup",
    ],
    [
      "create table public.career_ai_daily_usage",
      "missing auditable career AI daily usage counter",
    ],
    [
      "attempt_count integer not null default 0 check (attempt_count between 0 and 25)",
      "career AI daily usage must have a hard free-tier ceiling",
    ],
    [
      "pg_catalog.hashtextextended('career-ai:' || current_date::text, 11)",
      "career AI must reserve its application-wide daily ceiling atomically",
    ],
    [
      "select coalesce(sum(usage.attempt_count), 0) < ai_daily_allowance",
      "career AI must enforce the application-wide daily allowance",
    ],
    [
      "create or replace function public.claim_career_profile_extraction(",
      "missing atomic owner-derived career extraction claim",
    ],
    [
      "if not public.career_cv_uploads_enabled() then raise exception using errcode = '42501', message = 'cv uploads disabled'",
      "career extraction claims must fail while real CV uploads are disabled",
    ],
    [
      "pg_catalog.hashtextextended(actor_user_id::text, 10)",
      "career extraction claim must use a per-user transaction lock",
    ],
    [
      "and run.status = 'running'",
      "career extraction claim must enforce one concurrent run per user",
    ],
    [
      "grant execute on function public.complete_career_profile_extraction( uuid, uuid, text, jsonb, text, integer, integer, integer ) to service_role",
      "career extraction completion must be token-fenced and service-role only",
    ],
    [
      "drop constraint jobs_provider_identity_unique",
      "canonical jobs must delegate provider identity uniqueness to occurrences",
    ],
    [
      "constraint jobs_country_gb check (country_code = 'gb')",
      "missing GB-only jobs constraint",
    ],
    [
      "constraint jobs_https_application check (application_url ~ '^https://')",
      "missing HTTPS application constraint",
    ],
    [
      "constraint jobs_omissions_nonnegative check (consecutive_successful_omissions >= 0)",
      "missing nonnegative omissions constraint",
    ],
    [
      "create index jobs_feed_idx on public.jobs (lifecycle_status, posted_at desc)",
      "missing jobs feed index",
    ],
    [
      "create index jobs_filter_idx on public.jobs (employment_type, working_time, workplace_type, ir35_status)",
      "missing jobs filter index",
    ],
    [
      "create index access_requests_status_idx on public.access_requests (status, requested_at)",
      "missing access-request status index",
    ],
    [
      "create index ingestion_runs_started_idx on public.ingestion_runs (started_at desc)",
      "missing ingestion-run index",
    ],
    ["create schema if not exists private", "missing private schema"],
    [
      "create table private.app_settings",
      "missing private app-settings singleton",
    ],
    ["create trigger on_auth_user_created", "missing auth identity trigger"],
    [
      "status in ('pending', 'approved', 'rejected', 'suspended')",
      "access status constraint does not match the domain package",
    ],
    [
      "'permanent', 'fixed_term', 'contract', 'temporary', 'apprenticeship'",
      "employment type constraint does not match the domain package",
    ],
    [
      "working_time in ('full_time', 'part_time', 'flexible', 'unknown')",
      "working-time constraint does not match the domain package",
    ],
    [
      "workplace_type in ('onsite', 'hybrid', 'remote', 'unknown')",
      "workplace-type constraint does not match the domain package",
    ],
    [
      "ir35_status in ('inside', 'outside', 'not_applicable', 'unknown')",
      "IR35 constraint does not match the domain package",
    ],
    [
      "provider_name is distinct from 'greenhouse'",
      "current source mutation boundary must reject unsupported providers",
    ],
    [
      "create trigger audit_log_append_only",
      "missing append-only audit trigger",
    ],
    [
      "last_seen_source_run_id is distinct from target_source_run_id",
      "missing omission comparison against the complete source run",
    ],
    [
      "if effective_status = 'succeeded' then",
      "omissions must be gated by a successful complete response",
    ],
    [
      "create or replace function public.bootstrap_admin(target_user_id uuid)",
      "missing atomic service-role administrator bootstrap function",
    ],
    [
      "create or replace function public.get_access_requests_enabled()",
      "missing narrow administrator app-settings getter",
    ],
    [
      "array_position(allowed_hosts, null) is null",
      "job source host arrays must reject NULL entries",
    ],
    [
      "array_position(allowed_hosts_value, null) is not null",
      "source mutation must reject NULL host entries",
    ],
    [
      "grant execute on function public.bootstrap_admin(uuid) to service_role",
      "administrator bootstrap must be granted only to service_role",
    ],
    [
      "grant execute on function public.get_access_requests_enabled() to authenticated",
      "app-settings getter must have its narrow authenticated grant",
    ],
    [
      "minimum_sync_interval >= interval '15 minutes'",
      "job sources must enforce the 15-minute minimum interval",
    ],
    [
      "minimum_sync_minutes < 15",
      "source mutation must enforce the 15-minute minimum interval",
    ],
    [
      "create or replace function public.request_source_ingestion(target_source_id uuid)",
      "missing bounded administrator ingestion-request function",
    ],
    [
      "create unique index ingestion_requests_one_active_per_source_idx",
      "missing active ingestion-request coalescing index",
    ],
    [
      'create policy "administrators read ingestion requests"',
      "missing administrator-only ingestion-request read policy",
    ],
    [
      "grant execute on function public.request_source_ingestion(uuid) to authenticated",
      "ingestion-request function must have its narrow authenticated grant",
    ],
    [
      "create or replace function public.enqueue_scheduled_ingestion()",
      "missing shared scheduled-ingestion enqueue function",
    ],
    [
      "create or replace function public.claim_ingestion_requests(maximum_requests integer)",
      "missing bounded service-role ingestion claim function",
    ],
    [
      "maximum_requests not between 1 and 4",
      "ingestion claim must enforce the four-source global cap",
    ],
    [
      "claim_expires_at = clock_timestamp() + interval '5 minutes'",
      "ingestion claims must have a five-minute recovery lease",
    ],
    [
      "attempt_count < 3",
      "ingestion lease recovery must enforce the three-attempt ceiling",
    ],
    [
      "create or replace function public.complete_ingestion_request(target_request_id uuid)",
      "missing service-role ingestion completion function",
    ],
    [
      "grant execute on function public.enqueue_scheduled_ingestion() to service_role",
      "scheduled enqueue must be service-role only",
    ],
    [
      "grant execute on function public.claim_ingestion_requests(integer) to service_role",
      "queue claiming must be service-role only",
    ],
    [
      "create or replace function public.upsert_ingested_jobs(",
      "missing bounded transactional ingestion batch function",
    ],
    [
      "jsonb_array_length(jobs_value) not between 1 and 500",
      "ingestion batch must enforce the per-source job ceiling",
    ],
    [
      "grant execute on function public.upsert_ingested_jobs(uuid, jsonb) to service_role",
      "ingestion batch persistence must be service-role only",
    ],
    [
      "grant execute on function public.complete_ingestion_request(uuid) to service_role",
      "queue completion must be service-role only",
    ],
    [
      "create extension if not exists supabase_vault with schema vault",
      "missing Supabase Vault extension",
    ],
    [
      "create extension if not exists pg_net with schema extensions",
      "missing pg_net extension",
    ],
    ["create extension if not exists pg_cron", "missing pg_cron extension"],
    [
      "at time zone 'europe/london'",
      "scheduler must gate candidate hours in Europe/London",
    ],
    [
      "'0 8,9,11,12,14,15,17,18 * * 1-5'",
      "scheduler must cover GMT and BST candidate hours",
    ],
    [
      "name = 'jobwarden_project_url'",
      "scheduler must load the project URL from Vault",
    ],
    [
      "name = 'jobwarden_ingestion_cron_secret'",
      "scheduler must load the cron secret from Vault",
    ],
    [
      "constraint job_source_occurrences_provider_identity_unique unique (source_id, provider_job_id)",
      "missing exact source occurrence identity uniqueness",
    ],
    [
      "candidate_data jsonb not null check (jsonb_typeof(candidate_data) = 'object')",
      "source occurrences must retain validated canonical candidates",
    ],
    [
      "create or replace function private.rematerialize_canonical_job(target_job_id uuid)",
      "missing deterministic canonical rematerialisation",
    ],
    [
      "case source.provider when 'greenhouse' then 0 else 1 end",
      "canonical ranking must prefer direct Greenhouse evidence after salary provenance",
    ],
    [
      "source.provider in ('greenhouse', 'reed')",
      "shared queue must admit every database-supported provider",
    ],
    [
      "source_record.provider not in ('greenhouse', 'reed')",
      "source-run startup must admit every database-supported provider",
    ],
    [
      "if not source_enabled or source_provider not in ('greenhouse', 'reed') then",
      "batch persistence must recheck source state under lock",
    ],
    [
      "where job.id = any(affected_job_ids)",
      "source finalisation must only close affected canonical jobs",
    ],
    [
      "compensation_provenance in ('advertised', 'estimated', 'unknown')",
      "missing compensation provenance constraint",
    ],
    [
      "coverage_mode in ('complete', 'incremental')",
      "missing complete or incremental source coverage constraint",
    ],
    [
      "provider <> 'reed' or minimum_sync_interval >= interval '6 hours'",
      "Reed discovery sources must enforce a six-hour minimum interval",
    ],
    [
      "coverage_mode_value = 'complete' and response_was_complete",
      "incremental source completion must not advance omissions",
    ],
    ["limit 500", "missing bounded closing-date lifecycle maintenance"],
    [
      "create or replace function public.get_job_source_health()",
      "missing bounded administrator source-health function",
    ],
    [
      "grant execute on function public.get_job_source_health() to authenticated",
      "source-health function must have its narrow authenticated grant",
    ],
    [
      "freshness_state text",
      "source health must expose a bounded freshness state",
    ],
    [
      "latest_error_code text",
      "source health must expose the sanitised latest error code",
    ],
    ["temporary_roles integer", "source health must count temporary roles"],
    ["full_time_roles integer", "source health must count full-time roles"],
    [
      "occurrence.candidate_data ->> 'compensationprovenance'",
      "source health must aggregate each source occurrence candidate",
    ],
    [
      "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)",
      "missing private career-document Storage bucket",
    ],
    [
      "add column career_cv_uploads_enabled boolean not null default false",
      "real CV uploads must remain database-disabled by default",
    ],
    [
      "create or replace function public.career_cv_uploads_enabled()",
      "missing server-derived career CV activation gate",
    ],
    [
      "and public.career_cv_uploads_enabled()",
      "career-document writes must require the database activation gate",
    ],
    [
      "'career-documents', 'career-documents', false, 5242880",
      "career-document Storage bucket must be private and capped at 5 MiB",
    ],
    [
      "(storage.foldername(name))[1] = auth.uid()::text",
      "career-document objects must be isolated by owner path",
    ],
    [
      'create policy "approved users read own career profiles"',
      "missing approved-owner career-profile read policy",
    ],
    [
      'create policy "approved users add own career evidence"',
      "missing user-origin career-evidence insert policy",
    ],
    [
      "origin = 'user' and user_id = auth.uid() and public.has_approved_access()",
      "authenticated users must not forge CV-derived evidence",
    ],
    [
      'create policy "approved users read own search profiles"',
      "missing approved-owner search-profile read policy",
    ],
    [
      'create policy "approved users read own profile suggestions"',
      "missing approved-owner suggestion read policy",
    ],
    [
      'create policy "approved users read own cv documents"',
      "missing approved-owner CV metadata policy",
    ],
    [
      'create policy "approved users read own cv extraction runs"',
      "missing approved-owner extraction-run read policy",
    ],
    [
      "state in ('proposed', 'accepted', 'rejected')",
      "profile suggestions must use bounded review states",
    ],
    [
      "create unique index cv_documents_one_current_per_user_idx",
      "CV metadata must allow only one current document per user",
    ],
    [
      "status in ('queued', 'running', 'succeeded', 'failed')",
      "CV extraction runs must use bounded statuses",
    ],
    [
      "'invalid_file', 'unsupported_type', 'file_too_large', 'unsafe_archive', 'encrypted_pdf', 'page_limit', 'extraction_timeout', 'storage_missing', 'internal_error'",
      "CV extraction runs must use bounded sanitised error codes",
    ],
    [
      "create or replace function public.register_cv_document(",
      "missing atomic current-CV registration function",
    ],
    [
      "create or replace function public.decide_profile_suggestion(",
      "missing owner-only suggestion decision function",
    ],
    [
      "grant execute on function public.decide_profile_suggestion(uuid, text) to authenticated",
      "suggestion decisions must have a narrow authenticated grant",
    ],
    [
      "create table public.career_job_decisions",
      "missing career job decisions table",
    ],
    [
      "constraint career_job_decisions_owner_job_unique unique (owner_id, job_id)",
      "career job decisions must enforce one decision per owner and job",
    ],
    [
      "decision text not null check (decision in ('saved', 'dismissed', 'considering'))",
      "career job decisions must use bounded decision values",
    ],
    [
      "create or replace function public.decide_career_job( target_job_id uuid, target_decision text )",
      "missing owner-fenced job decision RPC",
    ],
    [
      "target_decision not in ('saved', 'dismissed', 'considering', 'clear')",
      "job decision RPC must validate decision value",
    ],
    [
      "grant execute on function public.decide_career_job(uuid, text) to authenticated",
      "job decision RPC must have its narrow authenticated grant",
    ],
    [
      "delete from public.career_job_decisions where owner_id = actor_user_id",
      "career profile deletion must also erase job decisions",
    ],
    [
      "grant select on public.career_job_decisions to authenticated",
      "career job decisions must have a narrow authenticated select grant",
    ],
    [
      "create table public.career_explore_settings",
      "missing explore settings table",
    ],
    [
      "create table public.career_pathway_decisions",
      "missing pathway decisions table",
    ],
    [
      "create table public.explore_pathway_analytics",
      "missing aggregate pathway analytics table",
    ],
    [
      "constraint career_pathway_decisions_owner_concept_unique unique (owner_id, pathway_concept)",
      "pathway decisions must enforce one decision per owner and pathway",
    ],
    [
      "create or replace function public.set_explore_enabled( target_enabled boolean )",
      "missing explore opt-in RPC",
    ],
    [
      "create or replace function public.decide_career_pathway( target_pathway_concept text, target_decision text )",
      "missing owner-fenced pathway decision RPC",
    ],
    [
      "target_decision not in ('dismissed', 'promoted', 'clear')",
      "pathway decision RPC must validate decision value",
    ],
    [
      "grant execute on function public.decide_career_pathway(text, text) to authenticated",
      "pathway decision RPC must have its narrow authenticated grant",
    ],
    [
      "grant execute on function public.set_explore_enabled(boolean) to authenticated",
      "explore opt-in RPC must have its narrow authenticated grant",
    ],
    [
      "delete from public.career_pathway_decisions where owner_id = actor_user_id",
      "career profile deletion must also erase pathway decisions",
    ],
    [
      "delete from public.career_explore_settings where owner_id = actor_user_id",
      "career profile deletion must also erase explore settings",
    ],
    [
      "insert into public.explore_pathways (pathway_concept) values",
      "missing curated explore pathway seed table",
    ],
    [
      "select 1 from public.explore_pathways where pathway_concept = target_pathway_concept",
      "pathway decision RPC must reject non-curated pathways",
    ],
    [
      "create table public.career_pathway_decisions ( id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade, pathway_concept text not null references public.explore_pathways (pathway_concept)",
      "pathway decisions must reference the curated taxonomy",
    ],
    [
      "create table public.explore_pathway_analytics ( pathway_concept text not null references public.explore_pathways (pathway_concept)",
      "aggregate pathway analytics must reference the curated taxonomy",
    ],
    [
      "where public.career_pathway_decisions.decision is distinct from excluded.decision",
      "pathway analytics must count decision transitions only",
    ],
    [
      "create table public.career_applications",
      "missing career applications table",
    ],
    [
      "create table public.career_application_events",
      "missing append-only application events table",
    ],
    [
      "constraint career_applications_owner_job_unique unique (owner_id, job_id)",
      "applications must enforce one tracked application per owner and job",
    ],
    [
      "create or replace function public.track_career_application( target_job_id uuid )",
      "missing owner-fenced application tracking RPC",
    ],
    [
      "create or replace function public.transition_career_application( target_application_id uuid, target_stage text )",
      "missing owner-fenced application transition RPC",
    ],
    [
      "(current_stage, target_stage) in (",
      "application transitions must be validated against the explicit map",
    ],
    [
      "insert into public.career_application_events ( application_id, owner_id, from_stage, to_stage )",
      "application transitions must append an audit event",
    ],
    [
      "create or replace function public.update_career_application_plan( target_application_id uuid, target_next_action text, target_due_on date, target_notes text )",
      "missing owner-fenced application plan RPC",
    ],
    [
      "create or replace function public.delete_career_application( target_application_id uuid )",
      "missing owner-fenced application deletion RPC",
    ],
    [
      "delete from public.career_applications where owner_id = actor_user_id",
      "career profile deletion must also erase applications",
    ],
    [
      "delete from public.career_application_events where owner_id = actor_user_id",
      "career profile deletion must also erase application events",
    ],
    [
      "channel_enabled boolean not null default false",
      "notification digests must be opt-in",
    ],
    [
      "constraint career_notification_announcements_unique unique (owner_id, search_profile_id, job_id)",
      "notification announcements must be deduplicated per owner, profile, and job",
    ],
    [
      "constraint career_notification_deliveries_slot_unique unique (owner_id, slot_key)",
      "notification delivery must be idempotent per owner and slot",
    ],
    [
      "on conflict (owner_id, slot_key) do nothing",
      "a repeated digest invocation must not claim a slot twice",
    ],
    [
      "delivery.status in ('pending', 'sent')",
      "in-flight deliveries must count towards the free-tier ceiling",
    ],
    [
      "where id = target_delivery_id and status = 'pending'",
      "only a claimed digest slot may be completed",
    ],
    [
      "if target_status <> 'sent' then return; end if;",
      "a failed send must not record announcements",
    ],
    [
      "'evidence_reference', item.evidence_reference, 'proficiency_signal'",
      "the notification runtime must receive career evidence without its excerpt",
    ],
    [
      "order by candidate.created_at, candidate.id limit 25",
      "the digest read must bound searches per owner so one owner cannot fail the batch",
    ],
    [
      "order by candidate.created_at, candidate.id limit 250",
      "the digest read must bound evidence per owner so one owner cannot fail the batch",
    ],
    [
      "jsonb_array_length(target_announcements) > 5000",
      "the announcement bound must admit the runtime's own worst case",
    ],
    [
      "delete from public.career_notification_deliveries where owner_id = actor_user_id",
      "career profile deletion must also erase notification deliveries",
    ],
    [
      "delete from public.career_notification_announcements where owner_id = actor_user_id",
      "career profile deletion must also erase notification announcements",
    ],
    [
      "delete from public.career_notification_settings where owner_id = actor_user_id",
      "career profile deletion must also erase notification settings",
    ],
    [
      "delete from public.career_cv_variants where owner_id = actor_user_id",
      "career profile deletion must also erase tailored CV variants",
    ],
    [
      "create or replace function public.list_audit_log(",
      "the audit log must be readable by an administrator",
    ],
    [
      "if not public.is_admin() then raise exception using errcode = '42501', message = 'administrator access required'",
      "operational reads must require administrator access",
    ],
    [
      "delivery.status in ('pending', 'sent') and delivery.created_at >= daily_start",
      "administrator headroom must count in-flight rows exactly as the send path does",
    ],
    [
      "set answers = public.career_onboarding_state.answers || excluded.answers",
      "revisiting an onboarding step must merge answers rather than wipe later ones",
    ],
    [
      "where not (required = any (current_state.completed_steps))",
      "onboarding completion must be decided by the database, not the client",
    ],
    [
      "delete from public.career_onboarding_state where owner_id = actor_user_id",
      "career profile deletion must also reset onboarding",
    ],
    [
      "where step = any (public.onboarding_steps_for_path(excluded.path))",
      "switching onboarding path must drop steps the new path never asks",
    ],
    [
      "create or replace function public.export_career_profile_data()",
      "owners must be able to export their own data, not only delete it",
    ],
    [
      "'sha256', document.sha256, 'lifecycle_status'",
      "the export must return CV metadata rather than file bytes",
    ],
    [
      "(status = 'draft' and expires_at is not null) or (status = 'saved' and expires_at is null)",
      "unsaved CV variants must carry an expiry and saved variants must not",
    ],
    [
      "clock_timestamp() + interval '24 hours'",
      "unsaved CV variants must expire after 24 hours",
    ],
    [
      "'jobwarden-cv-variant-expiry', '23 * * * *', 'select public.expire_cv_variants()'",
      "missing hourly tailored variant expiry schedule",
    ],
    [
      "and document.file_kind = 'docx' and document.is_current",
      "layout-preserving output must require the owner's current DOCX source",
    ],
  ];

  for (const [fragment, message] of requiredFragments) {
    if (!normalised.includes(fragment.toLowerCase())) failures.push(message);
  }

  const definerFunctions = securityDefinerFunctions(sql);
  const profileSaveDefinition = definerFunctions.find(
    ({ name }) => name === "public.save_career_profile_draft",
  )?.definition;
  const searchSaveDefinition = definerFunctions.find(
    ({ name }) => name === "public.save_search_profile",
  )?.definition;
  const deleteProfileDefinition = definerFunctions.find(
    ({ name }) => name === "public.delete_career_profile_data",
  )?.definition;
  const pruneEvidenceDefinition = definerFunctions.find(
    ({ name }) => name === "private.prune_search_profile_evidence",
  )?.definition;
  const uploadIntentGuardDefinition = definerFunctions.find(
    ({ name }) => name === "public.career_cv_upload_intent_allows",
  )?.definition;
  const registerCvDefinition = definerFunctions.find(
    ({ name }) => name === "public.register_cv_document",
  )?.definition;
  const lockGenerationDefinition = definerFunctions.find(
    ({ name }) => name === "public.lock_career_profile_generation",
  )?.definition;
  const decideEvidenceDefinition = definerFunctions.find(
    ({ name }) => name === "public.decide_career_evidence",
  )?.definition;
  const purgeInactiveCvDefinition = definerFunctions.find(
    ({ name }) => name === "public.purge_inactive_cv_document",
  )?.definition;
  const decideJobDefinition = definerFunctions.find(
    ({ name }) => name === "public.decide_career_job",
  )?.definition;
  const decideJob = compact(decideJobDefinition ?? "");
  const jobLockIndex = decideJob.indexOf("for update");
  const jobExistsIndex = decideJob.indexOf(
    "if not exists ( select 1 from public.jobs where id = target_job_id ) then",
  );
  if (
    jobLockIndex === -1 ||
    jobExistsIndex === -1 ||
    jobLockIndex > jobExistsIndex
  ) {
    failures.push(
      "job decisions must lock the generation mutex before validating the job",
    );
  }

  const completeExtractionDefinition = definerFunctions
    .filter(({ name }) => name === "public.complete_career_profile_extraction")
    .at(-1)?.definition;
  const generationFenceFragments = [
    "insert into public.career_profile_generations",
    "fence.generation = expected_generation",
    "for update",
    "message = 'stale career profile snapshot'",
  ];
  if (
    !profileSaveDefinition ||
    !generationFenceFragments.every((fragment) =>
      compact(profileSaveDefinition).includes(fragment),
    )
  ) {
    failures.push(
      "career profile saves must lock and compare the snapshot generation",
    );
  }
  if (
    !searchSaveDefinition ||
    !generationFenceFragments.every((fragment) =>
      compact(searchSaveDefinition).includes(fragment),
    )
  ) {
    failures.push(
      "named search saves must lock and compare the snapshot generation",
    );
  }
  const pruneEvidence = compact(pruneEvidenceDefinition ?? "");
  const pruneFenceIndex = pruneEvidence.indexOf(
    "insert into public.career_profile_generations",
  );
  const pruneLockIndex = pruneEvidence.indexOf("for update");
  const pruneSearchIndex = pruneEvidence.indexOf(
    "delete from public.search_profiles",
  );
  if (
    pruneFenceIndex === -1 ||
    pruneLockIndex < pruneFenceIndex ||
    pruneSearchIndex < pruneLockIndex
  ) {
    failures.push(
      "evidence pruning must share the generation mutex with named search saves",
    );
  }

  const lockGeneration = compact(lockGenerationDefinition ?? "");
  if (
    ![
      "insert into public.career_profile_generations",
      "where fence.user_id = actor_user_id",
      "for update",
    ].every((fragment) => lockGeneration.includes(fragment))
  ) {
    failures.push(
      "direct evidence deletion must lock the generation before row mutation",
    );
  }

  const decideEvidence = compact(decideEvidenceDefinition ?? "");
  const decisionLockIndex = decideEvidence.indexOf("for update");
  const evidenceRowIndex = decideEvidence.indexOf(
    "select confirmation_state into current_state",
  );
  if (
    decisionLockIndex === -1 ||
    evidenceRowIndex === -1 ||
    decisionLockIndex > evidenceRowIndex
  ) {
    failures.push(
      "evidence decisions must lock the generation before the evidence row",
    );
  }

  const purgeInactiveCv = compact(purgeInactiveCvDefinition ?? "");
  const purgeLockIndex = purgeInactiveCv.indexOf("for update");
  const purgeStorageIndex = purgeInactiveCv.indexOf(
    "if exists ( select 1 from storage.objects",
  );
  if (
    purgeLockIndex === -1 ||
    purgeStorageIndex === -1 ||
    purgeLockIndex > purgeStorageIndex
  ) {
    failures.push(
      "inactive CV purge must lock the generation before checking Storage",
    );
  }

  const completeExtraction = compact(completeExtractionDefinition ?? "");
  const completionLockIndex = completeExtraction.indexOf("for update");
  const completionRunRowIndex = completeExtraction.indexOf(
    "select run.* into run_record",
  );
  if (
    completionLockIndex === -1 ||
    completionRunRowIndex === -1 ||
    completionLockIndex > completionRunRowIndex
  ) {
    failures.push(
      "extraction completion must lock the generation before the run row",
    );
  }

  const searchSave = compact(searchSaveDefinition ?? "");
  const searchLockIndex = searchSave.indexOf("for update");
  const profileRootIndex = searchSave.indexOf(
    "insert into public.career_profiles (user_id)",
  );
  const searchInsertIndex = searchSave.indexOf(
    "insert into public.search_profiles",
  );
  if (
    searchLockIndex === -1 ||
    profileRootIndex < searchLockIndex ||
    searchInsertIndex < profileRootIndex
  ) {
    failures.push(
      "named search saves must atomically establish the owner profile root",
    );
  }

  const uploadIntentGuard = compact(uploadIntentGuardDefinition ?? "");
  if (
    ![
      "insert into public.career_profile_generations",
      "for update",
      "from public.career_cv_upload_intents",
      "intent.generation = current_generation",
    ].every((fragment) => uploadIntentGuard.includes(fragment))
  ) {
    failures.push(
      "career-document Storage inserts must hold the generation mutex",
    );
  }

  const registerCv = compact(registerCvDefinition ?? "");
  if (
    ![
      "fence.generation = expected_generation",
      "for update",
      "from public.career_cv_upload_intents",
      "intent.generation = expected_generation",
      "from storage.objects",
    ].every((fragment) => registerCv.includes(fragment))
  ) {
    failures.push(
      "CV registration must require matching generation-bound upload intent",
    );
  }
  if (deleteProfileDefinition) {
    const deletion = compact(deleteProfileDefinition);
    const lockIndex = deletion.indexOf("for update");
    const storageCheckIndex = deletion.indexOf(
      "if exists ( select 1 from storage.objects",
    );
    if (
      lockIndex === -1 ||
      storageCheckIndex === -1 ||
      lockIndex > storageCheckIndex
    ) {
      failures.push(
        "profile deletion must lock the generation before checking Storage",
      );
    }
    const advanceIndex = deletion.indexOf(
      "update public.career_profile_generations set generation = generation + 1",
    );
    const cascadeIndex = deletion.indexOf(
      "delete from public.career_profiles where user_id = actor_user_id",
    );
    if (
      advanceIndex === -1 ||
      cascadeIndex === -1 ||
      advanceIndex > cascadeIndex
    ) {
      failures.push(
        "profile deletion must advance the generation tombstone before cascading data",
      );
    }
  } else {
    failures.push(
      "profile deletion must lock the generation before checking Storage",
    );
    failures.push(
      "profile deletion must advance the generation tombstone before cascading data",
    );
  }

  if (
    /grant\s+update\s*\([^)]*\bconfirmation_state\b[^)]*\)\s+on\s+public\.career_evidence_items\s+to\s+authenticated/i.test(
      sql,
    )
  ) {
    failures.push(
      "authenticated callers must not directly update evidence confirmation state",
    );
  }

  const hasAuthenticatedMutationGrant = (table) => {
    const grants = [
      ...sql.matchAll(
        /grant\s+([^;]+?)\s+on\s+([^;]+?)\s+to\s+authenticated/gi,
      ),
    ];
    return grants.some(
      (grant) =>
        /(?:^|[\s,])(all|insert|update)(?:[\s,(]|$)/i.test(grant[1] ?? "") &&
        new RegExp(`\\bpublic\\.${table}\\b`, "i").test(grant[2] ?? ""),
    );
  };
  const hasAuthenticatedMutationPolicy = (table) =>
    new RegExp(
      `create\\s+policy[\\s\\S]*?on\\s+public\\.${table}\\s+for\\s+(?:all|insert|update)\\b`,
      "i",
    ).test(sql);

  if (
    hasAuthenticatedMutationGrant("search_profiles") ||
    hasAuthenticatedMutationPolicy("search_profiles")
  ) {
    failures.push(
      "authenticated callers must save named searches through the evidence-bound RPC",
    );
  }
  if (
    hasAuthenticatedMutationGrant("career_profiles") ||
    hasAuthenticatedMutationPolicy("career_profiles")
  ) {
    failures.push(
      "authenticated callers must save career profiles through the generation-fenced RPC",
    );
  }
  for (const table of [
    "career_onboarding_state",
    "career_cv_variants",
    "career_notification_settings",
    "career_notification_announcements",
    "career_notification_deliveries",
  ]) {
    if (
      hasAuthenticatedMutationGrant(table) ||
      hasAuthenticatedMutationPolicy(table)
    ) {
      failures.push(
        `authenticated callers must change ${table} through the owner-fenced RPC`,
      );
    }
  }
  if (
    hasAuthenticatedMutationGrant("career_job_decisions") ||
    hasAuthenticatedMutationPolicy("career_job_decisions")
  ) {
    failures.push(
      "authenticated callers must decide career jobs through the owner-fenced RPC",
    );
  }
  if (
    hasAuthenticatedMutationGrant("career_pathway_decisions") ||
    hasAuthenticatedMutationPolicy("career_pathway_decisions")
  ) {
    failures.push(
      "authenticated callers must decide pathways through the owner-fenced RPC",
    );
  }
  if (
    hasAuthenticatedMutationGrant("career_explore_settings") ||
    hasAuthenticatedMutationPolicy("career_explore_settings")
  ) {
    failures.push(
      "authenticated callers must toggle explore through the owner-fenced RPC",
    );
  }
  if (
    hasAuthenticatedMutationGrant("career_applications") ||
    hasAuthenticatedMutationPolicy("career_applications") ||
    hasAuthenticatedMutationGrant("career_application_events") ||
    hasAuthenticatedMutationPolicy("career_application_events")
  ) {
    failures.push(
      "authenticated callers must change applications through the owner-fenced RPCs",
    );
  }

  const analyticsTable =
    sql.match(
      /create\s+table\s+public\.explore_pathway_analytics[\s\S]*?;/i,
    )?.[0] ?? "";
  if (analyticsTable) {
    if (/\b(owner_id|user_id|owner|actor)\b/i.test(analyticsTable)) {
      failures.push(
        "aggregate pathway analytics must not carry an owner or user column",
      );
    }
    if (!/pathway_concept\s*~\s*'\^\[a-z0-9\]/i.test(analyticsTable)) {
      failures.push(
        "aggregate pathway analytics must constrain concepts to the normalised grammar",
      );
    }
  }

  const storageUpdatePolicies =
    sql.match(
      /create\s+policy[\s\S]*?on\s+storage\.objects\s+for\s+update\s+to\s+authenticated[\s\S]*?;/gi,
    ) ?? [];
  if (
    storageUpdatePolicies.some((policy) =>
      /bucket_id\s*=\s*'career-documents'/i.test(policy),
    )
  ) {
    failures.push("career-document owner paths must not have an UPDATE policy");
  }

  const runtimeMigration = files.get(
    "202607180002_shared_ingestion_runtime.sql",
  );
  if (
    runtimeMigration &&
    /https:\/\/[a-z0-9-]+\.supabase\.co|bearer\s+[a-z0-9._~-]{16,}/i.test(
      runtimeMigration,
    )
  ) {
    failures.push(
      "ingestion schedule migration contains a literal secret or project URL",
    );
  }

  if (!/pg_catalog\.pg_advisory_xact_lock\s*\(/i.test(sql)) {
    failures.push("missing transaction-scoped source advisory lock");
  }

  const bootstrapDefinition = securityDefinerFunctions(sql).find(
    ({ name }) => name === "public.bootstrap_admin",
  )?.definition;
  if (
    bootstrapDefinition &&
    ![
      "from auth.users",
      "from auth.identities",
      "insert into public.user_roles",
      "insert into public.audit_log",
    ].every((fragment) => compact(bootstrapDefinition).includes(fragment))
  ) {
    failures.push(
      "administrator bootstrap must verify identity and atomically write role and audit",
    );
  }

  if (
    /grant\s+(?:select\s*,\s*)?insert\s+on\s+public\.(?:user_roles|audit_log)\s+to\s+service_role/i.test(
      sql,
    )
  ) {
    failures.push(
      "service role must use the atomic bootstrap RPC instead of direct role or audit inserts",
    );
  }

  if (
    /create\s+table\s+public\.job_sources[\s\S]*?provider[^,;]*greenhouse/i.test(
      sql.match(/create\s+table\s+public\.job_sources[\s\S]*?;/i)?.[0] ?? "",
    )
  ) {
    failures.push(
      "job_sources table hard-codes the current provider instead of remaining extensible",
    );
  }

  for (const { name, definition } of definerFunctions) {
    if (!/set\s+search_path\s*=\s*''/i.test(definition)) {
      failures.push(
        `security-definer function ${name} must set search_path to empty`,
      );
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // An unsubscribe link has to work from an email client, so this one
    // function is reachable without a session. It stays safe because a token is
    // its only input, it returns nothing but whether a row matched, and it can
    // only clear a boolean flag. It must still be revoked from public, and no
    // other definer function may join this list without the same review.
    if (anonExecutableDefinerFunctions.has(name)) {
      const revokePublicPattern = new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+${escapedName}\\s*\\([^)]*\\)\\s*from\\s+public\\s*;`,
        "i",
      );
      if (!revokePublicPattern.test(sql)) {
        failures.push(
          `deliberately anon-executable function ${name} must still revoke public execution`,
        );
      }
      continue;
    }

    const revokePattern = new RegExp(
      // The `\(` anchor matters: without it the name is a prefix match, so
      // `upsert_ingested_jobs`'s revoke would satisfy `upsert_ingested_job`.
      `revoke\\s+all\\s+on\\s+function\\s+${escapedName}\\s*\\([^;]*\\sfrom\\s[^;]*\\bpublic\\b[^;]*\\banon\\b`,
      "gi",
    );
    const revokeOffsets = [...sql.matchAll(revokePattern)].map(
      (match) => match.index ?? -1,
    );

    // `create or replace` keeps a function's privileges, so an earlier revoke
    // still holds. `drop function` does not: the recreated function starts from
    // PostgreSQL's default ACL, which grants EXECUTE to PUBLIC. Matching on the
    // name alone would accept a revoke written for the dropped overload — which
    // is exactly what happened when finish_source_ingestion was first widened,
    // and it passed this check while leaving the RPC open to anon.
    const dropPattern = new RegExp(
      `drop\\s+function\\s+(?:if\\s+exists\\s+)?${escapedName}\\s*\\(`,
      "gi",
    );
    const lastDropOffset = [...sql.matchAll(dropPattern)].reduce(
      (latest, match) => Math.max(latest, match.index ?? -1),
      -1,
    );

    // A drop with no create after it is a removal, not a recreation, and there
    // is nothing left to revoke on. Without this the rule demanded a revoke for
    // a function that no longer exists, which is unsatisfiable — the only way to
    // silence it would have been to keep the dead function alive.
    const createPattern = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+${escapedName}\\s*\\(`,
      "gi",
    );
    const lastCreateOffset = [...sql.matchAll(createPattern)].reduce(
      (latest, match) => Math.max(latest, match.index ?? -1),
      -1,
    );
    if (lastDropOffset > lastCreateOffset) {
      continue;
    }

    if (!revokeOffsets.some((offset) => offset > lastDropOffset)) {
      failures.push(
        lastDropOffset === -1
          ? `security-definer function ${name} must revoke public and anon execution`
          : `security-definer function ${name} is dropped and recreated, so it must revoke public and anon execution again afterwards`,
      );
    }
  }

  const forbiddenMutationPolicy =
    /create\s+policy[\s\S]*?on\s+public\.(jobs|user_roles|audit_log|access_requests|career_job_decisions|career_pathway_decisions|career_explore_settings|explore_pathway_analytics|career_applications|career_application_events|career_notification_settings|career_notification_announcements|career_notification_deliveries|career_cv_variants|career_onboarding_state)\s+for\s+(insert|update|delete|all)\b/gi;
  for (const match of sql.matchAll(forbiddenMutationPolicy)) {
    failures.push(
      `browser mutation policy forbidden on public.${match[1].toLowerCase()}`,
    );
  }

  return [...new Set(failures)];
}

function loadMigrations(migrationsDirectory) {
  // Every migration on disk, not just the required list. Reading only the list
  // meant a migration that nobody added to it was never opened at all, so none
  // of the rules below — forced RLS, definer-function grants, anon-executable
  // exceptions — ever saw it. `verifyFoundationSql` separately fails when a file
  // on disk is missing from the list, so the two cannot drift apart again.
  return new Map(
    readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .toSorted()
      .map((file) => [
        file,
        readFileSync(join(migrationsDirectory, file), "utf8"),
      ]),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (invokedPath === import.meta.url) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationsDirectory =
    process.argv[2] ?? join(scriptDirectory, "..", "supabase", "migrations");

  try {
    const failures = verifyFoundationSql(loadMigrations(migrationsDirectory));
    if (failures.length > 0) {
      for (const failure of failures) process.stderr.write(`- ${failure}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Supabase foundation static verification passed (${requiredMigrationFiles.length} migrations, ${publicTables.length} forced-RLS tables).\n`,
      );
    }
  } catch {
    process.stderr.write(
      "Supabase foundation static verification could not read the migration set.\n",
    );
    process.exitCode = 1;
  }
}
