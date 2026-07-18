import { readFileSync } from "node:fs";
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
  "career_evidence_items",
  "profile_suggestions",
  "search_profiles",
  "cv_documents",
  "cv_extraction_runs",
  "career_ai_daily_usage",
];

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

  const sql = [...files.values()].join("\n");
  const normalised = compact(sql);

  for (const table of publicTables) {
    const enable = `alter table public.${table} enable row level security;`;
    const force = `alter table public.${table} force row level security;`;
    if (!normalised.includes(enable) || !normalised.includes(force)) {
      failures.push(`public table ${table} must enable and force RLS`);
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
      "add column target_role_families jsonb not null default '[]'::jsonb",
      "career profile must persist target role families",
    ],
    [
      "create or replace function public.save_career_profile_draft(draft_value jsonb)",
      "missing owner-derived atomic career profile save",
    ],
    [
      "create or replace function public.save_search_profile(draft_value jsonb)",
      "missing owner-derived named search save",
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
      "create table public.career_ai_daily_usage",
      "missing auditable career AI daily usage counter",
    ],
    [
      "attempt_count integer not null default 0 check (attempt_count between 0 and 25)",
      "career AI daily usage must have a hard free-tier ceiling",
    ],
    [
      "create or replace function public.claim_career_profile_extraction(",
      "missing atomic owner-derived career extraction claim",
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
      "grant execute on function public.complete_career_profile_extraction( uuid, text, jsonb, text, integer, integer, integer ) to service_role",
      "career extraction completion must be service-role only",
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
      "'career-documents', 'career-documents', false, 5242880",
      "career-document Storage bucket must be private and capped at 5 MiB",
    ],
    [
      "(storage.foldername(name))[1] = auth.uid()::text",
      "career-document objects must be isolated by owner path",
    ],
    [
      'create policy "approved users manage own career profiles"',
      "missing approved-owner career-profile policy",
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
      "grant update (confirmation_state, proficiency_signal, last_used_at) on public.career_evidence_items to authenticated",
      "career-evidence review must use a column-limited update grant",
    ],
    [
      'create policy "approved users manage own search profiles"',
      "missing approved-owner search-profile policy",
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
  ];

  for (const [fragment, message] of requiredFragments) {
    if (!normalised.includes(fragment.toLowerCase())) failures.push(message);
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

  for (const { name, definition } of securityDefinerFunctions(sql)) {
    if (!/set\s+search_path\s*=\s*''/i.test(definition)) {
      failures.push(
        `security-definer function ${name} must set search_path to empty`,
      );
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const revokePattern = new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+${escapedName}[^;]*\\sfrom\\s[^;]*\\bpublic\\b[^;]*\\banon\\b`,
      "i",
    );
    if (!revokePattern.test(sql)) {
      failures.push(
        `security-definer function ${name} must revoke public and anon execution`,
      );
    }
  }

  const forbiddenMutationPolicy =
    /create\s+policy[\s\S]*?on\s+public\.(jobs|user_roles|audit_log|access_requests)\s+for\s+(insert|update|delete|all)\b/gi;
  for (const match of sql.matchAll(forbiddenMutationPolicy)) {
    failures.push(
      `browser mutation policy forbidden on public.${match[1].toLowerCase()}`,
    );
  }

  return [...new Set(failures)];
}

function loadMigrations(migrationsDirectory) {
  return new Map(
    requiredMigrationFiles.map((file) => [
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
