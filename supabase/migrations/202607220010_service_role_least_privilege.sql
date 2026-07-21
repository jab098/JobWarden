begin;

-- Found by the independent review of Task 29, 2026-07-21, and confirmed by
-- running it: **`service_role` could `truncate public.audit_log`**, destroying
-- the entire append-only audit record in one statement.
--
-- The append-only trigger is `before update or delete ... for each row`.
-- `truncate` fires neither, so the guarantee the trigger is supposed to give —
-- and which `202607220006_audit_log_actor_nulling.sql` and
-- `docs/project-status.md` both assert — did not hold against that one verb.
--
-- The privilege was never granted deliberately. `202607170001_foundation.sql`
-- revokes all on all public tables from `public`, `anon` and `authenticated`
-- but **omits `service_role`**, so Supabase's default ACL for that role
-- survived on every table: `service_role=Dxtm` — TRUNCATE, REFERENCES, TRIGGER
-- and MAINTAIN. Task 35 checked `select`/`insert`/`update`/`delete` and
-- correctly concluded `service_role` held none of them on the protected tables;
-- nobody checked the other four letters.
--
-- The blast radius was all 34 public tables, not only the audit log. It
-- included `user_roles`, so anything holding the service key could have removed
-- every administrator, and `jobs`, `profiles` and `access_requests`.
--
-- Nothing needs these four. Ingestion reaches the database only through
-- `security definer` RPCs owned by `postgres`; no product code truncates, adds
-- a trigger, or declares a foreign key at runtime; and maintenance runs as the
-- owner. The deliberate `arwd` grants — the career tables the extraction and
-- digest functions genuinely write, and `select` on `job_sources` and
-- `job_source_occurrences` — are untouched, because revoking these four verbs
-- does not disturb read or write.
revoke truncate, references, trigger, maintain
  on all tables in schema public
  from service_role;

-- Future tables inherit the same default, so revoking once is not enough. This
-- is the line whose absence caused the defect.
alter default privileges in schema public
  revoke truncate, references, trigger, maintain on tables from service_role;

commit;
