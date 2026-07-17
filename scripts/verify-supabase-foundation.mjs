import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const requiredMigrationFiles = [
  "202607170001_foundation.sql",
  "202607170002_rls_and_functions.sql",
  "202607170003_audit_and_ingestion.sql",
  "202607180001_admin_operations.sql",
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
      "constraint jobs_provider_identity_unique unique (source_id, provider_job_id)",
      "missing provider identity uniqueness",
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
      "create policy \"administrators read ingestion requests\"",
      "missing administrator-only ingestion-request read policy",
    ],
    [
      "grant execute on function public.request_source_ingestion(uuid) to authenticated",
      "ingestion-request function must have its narrow authenticated grant",
    ],
  ];

  for (const [fragment, message] of requiredFragments) {
    if (!normalised.includes(fragment.toLowerCase())) failures.push(message);
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
