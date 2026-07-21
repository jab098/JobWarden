begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(13);

-- This file needs genuine second and third sessions, because the races it covers
-- are settled by an advisory mutex that a single session would take once and
-- never contend for. It therefore only runs where the server is reachable over
-- TCP, which is how `supabase test db` connects.

-- These two helpers replace a `pg_sleep(0.15)` followed by a lookup of a
-- remembered backend pid in `pg_stat_activity`. That approach was fragile on a
-- slow machine and, for the evidence connections, simply wrong: the pid returned
-- by `dblink('name', 'select pg_backend_pid()')` was already dead by the time it
-- was stored, so those assertions watched a backend that did not exist and could
-- only ever report "not waiting". Nothing about the product was involved.
--
-- What each test means is "a session is queued on this barrier", so `pg_locks`
-- is asked about the barrier directly and no pid has to stay valid. Polling to a
-- deadline keeps a barrier that is never reached a real failure rather than a
-- hang.

-- The generation mutex is not an advisory lock: `save_search_profile` holds the
-- owner's `career_profile_generations` row with `for update`, so a session
-- queued behind it waits on a transaction or tuple lock instead. That is the
-- wait this asserts.
create function pg_temp.await_row_lock_waiters(
  expected integer default 1,
  timeout_seconds numeric default 10
) returns boolean
language plpgsql as $$
declare
  deadline timestamptz := clock_timestamp()
    + make_interval(secs => timeout_seconds);
begin
  loop
    if (
      select count(*)
      from pg_catalog.pg_locks
      where not granted
        and locktype in ('transactionid', 'tuple')
    ) >= expected then
      return true;
    end if;
    if clock_timestamp() > deadline then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

create function pg_temp.await_advisory_waiters(
  lock_key bigint,
  expected integer default 1,
  timeout_seconds numeric default 10
) returns boolean
language plpgsql as $$
declare
  deadline timestamptz := clock_timestamp()
    + make_interval(secs => timeout_seconds);
begin
  loop
    if (
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and not granted
        and ((classid::bigint << 32) | objid::bigint) = lock_key
    ) >= expected then
      return true;
    end if;
    if clock_timestamp() > deadline then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;

-- `dbname=...` alone cannot open a second session. PostgreSQL refuses a
-- non-superuser dblink connection unless the server actually demands a
-- password, and this role is not a superuser. Local Supabase trusts 127.0.0.1,
-- so the loopback path is refused however the string is written, password or
-- not. The same server requires scram on its container network, so the
-- connection is aimed there: `inet_server_addr()` is the address this session
-- already reached the server on, which is that network under `supabase test
-- db`, so the host is derived at run time rather than pinned to an IP that
-- changes between machines.
--
-- The password is the Supabase CLI's fixed local default. It is not a secret:
-- it only ever authenticates against a throwaway local container, it is
-- published in Supabase's own documentation, and no deployed database accepts
-- it.
create function pg_temp.race_connstring() returns text
language plpgsql stable as $$
begin
  if inet_server_addr() is null then
    -- A unix-socket session (plain `psql -f`) cannot reach the scram path. An
    -- empty host would silently fall back to the trusted socket and fail many
    -- statements later with an unrelated-looking error, so refuse here instead.
    raise exception using
      errcode = '0A000',
      message = 'this file needs a TCP connection; run it via supabase test db';
  end if;
  return format(
    'dbname=%s user=%s password=postgres host=%s',
    current_database(),
    current_user,
    host(inet_server_addr())
  );
end;
$$;

select extensions.dblink_connect('career_race_admin', pg_temp.race_connstring());
-- Clear any residue before inserting. A run that fails partway commits its
-- fixtures over these connections and never reaches teardown, which would
-- otherwise leave this file permanently unable to start.
select extensions.dblink_exec(
  'career_race_admin',
  $remote$
    -- Replication role is stood down only for the append-only audit rows, and
    -- restored before the account delete so its cascades actually fire.
    set session_replication_role = replica;
    delete from public.audit_log
    where actor_user_id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    );
    set session_replication_role = origin;
    delete from auth.users
    where id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    );
  $remote$
);

select extensions.dblink_exec(
  'career_race_admin',
  $remote$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (
        '93000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'concurrent-first@example.test', '', now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Concurrent first save"}', now(), now()
      ),
      (
        '93000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'evidence-race@example.test', '', now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Evidence race"}', now(), now()
      );
    update public.access_requests
    set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
    where user_id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    );
    insert into public.career_profiles (user_id)
    values ('93000000-0000-4000-8000-000000000002');
    insert into public.career_profile_generations (user_id)
    values ('93000000-0000-4000-8000-000000000002');
    insert into public.career_evidence_items (
      id, user_id, normalized_concept, label, category, origin, confidence,
      proficiency_signal, confirmation_state
    ) values (
      '93100000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      'sql', 'SQL', 'tool', 'user', 1, 'working', 'confirmed'
    );
  $remote$
);

select extensions.dblink_connect(
  'first_search_a', pg_temp.race_connstring()
);
select extensions.dblink_connect(
  'first_search_b', pg_temp.race_connstring()
);
select extensions.dblink_exec('first_search_a', 'set role authenticated');
select extensions.dblink_exec('first_search_b', 'set role authenticated');
select extensions.dblink_exec(
  'first_search_a',
  $remote$set request.jwt.claim.sub = '93000000-0000-4000-8000-000000000001'$remote$
);
select extensions.dblink_exec(
  'first_search_b',
  $remote$set request.jwt.claim.sub = '93000000-0000-4000-8000-000000000001'$remote$
);

select pg_catalog.pg_advisory_lock(20260718001100);

select is(
  extensions.dblink_send_query(
    'first_search_a',
    $remote$
      with barrier as materialized (
        select pg_catalog.pg_advisory_xact_lock_shared(20260718001100)
      ),
      saved as materialized (
        select public.save_search_profile(
          null, 0,
          '{"name":"First concurrent search","enabled":true,"roleFamilies":[],"includeTerms":["first"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":[],"responsibilityConcepts":[],"currentSeniority":"unspecified","targetSeniority":"unspecified","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
        ) as id
        from barrier
      )
      select id::text from saved
    $remote$
  ),
  1,
  'the first search-only onboarding save is dispatched on one connection'
);
select is(
  extensions.dblink_send_query(
    'first_search_b',
    $remote$
      with barrier as materialized (
        select pg_catalog.pg_advisory_xact_lock_shared(20260718001100)
      ),
      saved as materialized (
        select public.save_search_profile(
          null, 0,
          '{"name":"Second concurrent search","enabled":true,"roleFamilies":[],"includeTerms":["second"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":[],"responsibilityConcepts":[],"currentSeniority":"unspecified","targetSeniority":"unspecified","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
        ) as id
        from barrier
      )
      select id::text from saved
    $remote$
  ),
  1,
  'a concurrent search-only onboarding save is dispatched independently'
);
select ok(
  pg_temp.await_advisory_waiters(20260718001100, 1),
  'the first search-only transaction is held at the shared start barrier'
);
select ok(
  pg_temp.await_advisory_waiters(20260718001100, 2),
  'both first-search transactions overlap before the shared barrier releases'
);
select pg_catalog.pg_advisory_unlock(20260718001100);
select lives_ok(
  $$ select * from extensions.dblink_get_result('first_search_a') as saved(id text) $$,
  'the first search-only save atomically establishes its profile root'
);
select lives_ok(
  $$ select * from extensions.dblink_get_result('first_search_b') as saved(id text) $$,
  'the concurrent first save reuses the same profile root'
);
select is(
  (
    select count(*)::integer from public.career_profiles
    where user_id = '93000000-0000-4000-8000-000000000001'
  ),
  1,
  'concurrent first saves create exactly one owner profile root'
);
select is(
  (
    select count(*)::integer from public.search_profiles
    where user_id = '93000000-0000-4000-8000-000000000001'
  ),
  2,
  'both concurrent search-only onboarding saves persist'
);

select extensions.dblink_connect(
  'evidence_save', pg_temp.race_connstring()
);
select extensions.dblink_connect(
  'evidence_delete', pg_temp.race_connstring()
);
select extensions.dblink_exec('evidence_save', 'set role authenticated');
select extensions.dblink_exec('evidence_delete', 'set role authenticated');
select extensions.dblink_exec(
  'evidence_save',
  $remote$set request.jwt.claim.sub = '93000000-0000-4000-8000-000000000002'$remote$
);
select extensions.dblink_exec(
  'evidence_delete',
  $remote$set request.jwt.claim.sub = '93000000-0000-4000-8000-000000000002'$remote$
);

select pg_catalog.pg_advisory_lock(20260718001101);
select extensions.dblink_send_query(
  'evidence_save',
  $remote$
    with saved as materialized (
      select public.save_search_profile(
        null, 0,
        '{"name":"Evidence race search","enabled":true,"roleFamilies":[],"includeTerms":["fallback"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["sql"],"responsibilityConcepts":[],"currentSeniority":"unspecified","targetSeniority":"unspecified","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
      ) as id
    ),
    barrier as materialized (
      select pg_catalog.pg_advisory_xact_lock(20260718001101) from saved
    )
    select saved.id::text from saved cross join barrier
  $remote$
);
select ok(
  pg_temp.await_advisory_waiters(20260718001101, 1),
  'the search save reaches the barrier while retaining its generation lock'
);

select extensions.dblink_send_query(
  'evidence_delete',
  $remote$
    delete from public.career_evidence_items
    where id = '93100000-0000-4000-8000-000000000001'
    returning id::text
  $remote$
);
select ok(
  pg_temp.await_row_lock_waiters(1),
  'evidence removal waits for an in-flight search validation transaction'
);

select pg_catalog.pg_advisory_unlock(20260718001101);
select lives_ok(
  $$ select * from extensions.dblink_get_result('evidence_save') as saved(id text) $$,
  'the generation-fenced search save completes'
);
select lives_ok(
  $$ select * from extensions.dblink_get_result('evidence_delete') as removed(id text) $$,
  'the serialized evidence removal completes after the save'
);
select is(
  (
    select skill_concepts from public.search_profiles
    where user_id = '93000000-0000-4000-8000-000000000002'
      and name = 'Evidence race search'
  ),
  array[]::text[],
  'the later evidence removal cannot leave a newly committed stale concept'
);

select extensions.dblink_disconnect('first_search_a');
select extensions.dblink_disconnect('first_search_b');
select extensions.dblink_disconnect('evidence_save');
select extensions.dblink_disconnect('evidence_delete');
-- Teardown has to be explicit and forceful. Everything these connections did was
-- committed by a separate session, so the enclosing `rollback` does not reach
-- it, and any residue collides with `users_pkey` on the next run.
--
-- `delete from auth.users` alone cannot succeed. Every account gets an
-- `access.requested` audit row from `handle_new_user`, `audit_log.actor_user_id`
-- is `on delete set null`, and `audit_log_append_only` refuses that update — so
-- the FK's own action is blocked and the delete always fails. The audit rows are
-- therefore removed first, under a replication role that stands the append-only
-- trigger down, leaving no row pointing at a deleted account.
--
-- That contradiction between the FK and the trigger is a schema defect, not a
-- test concern; it is recorded in docs/project-status.md rather than papered
-- over here.
select extensions.dblink_exec(
  'career_race_admin',
  $remote$
    -- Replication role is stood down only for the append-only audit rows, and
    -- restored before the account delete so its cascades actually fire.
    set session_replication_role = replica;
    delete from public.audit_log
    where actor_user_id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    );
    set session_replication_role = origin;
    delete from auth.users
    where id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    );
  $remote$
);
select extensions.dblink_disconnect('career_race_admin');

select * from finish();
rollback;
