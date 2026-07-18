begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(13);

select extensions.dblink_connect(
  'career_race_admin', format('dbname=%L', current_database())
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
  'first_search_a', format('dbname=%L', current_database())
);
select extensions.dblink_connect(
  'first_search_b', format('dbname=%L', current_database())
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

create temporary table first_search_race_pids (
  connection_name text primary key,
  pid integer
);
insert into first_search_race_pids
select 'first_search_a', pid
from extensions.dblink('first_search_a', 'select pg_backend_pid()') as connection(pid integer)
union all
select 'first_search_b', pid
from extensions.dblink('first_search_b', 'select pg_backend_pid()') as connection(pid integer);

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
select pg_catalog.pg_sleep(0.15);
select ok(
  exists (
    select 1 from pg_catalog.pg_stat_activity
    where pid = (
      select pid from first_search_race_pids
      where connection_name = 'first_search_a'
    ) and wait_event_type = 'Lock'
  ),
  'the first search-only transaction is held at the shared start barrier'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_stat_activity
    where pid = (
      select pid from first_search_race_pids
      where connection_name = 'first_search_b'
    ) and wait_event_type = 'Lock'
  ),
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
  'evidence_save', format('dbname=%L', current_database())
);
select extensions.dblink_connect(
  'evidence_delete', format('dbname=%L', current_database())
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

create temporary table career_race_pids (connection_name text primary key, pid integer);
insert into career_race_pids
select 'evidence_save', pid
from extensions.dblink('evidence_save', 'select pg_backend_pid()') as connection(pid integer)
union all
select 'evidence_delete', pid
from extensions.dblink('evidence_delete', 'select pg_backend_pid()') as connection(pid integer);

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
select pg_catalog.pg_sleep(0.15);
select ok(
  exists (
    select 1 from pg_catalog.pg_stat_activity
    where pid = (
      select pid from career_race_pids where connection_name = 'evidence_save'
    ) and wait_event_type = 'Lock'
  ),
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
select pg_catalog.pg_sleep(0.15);
select ok(
  exists (
    select 1 from pg_catalog.pg_stat_activity
    where pid = (
      select pid from career_race_pids where connection_name = 'evidence_delete'
    ) and wait_event_type = 'Lock'
  ),
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
select extensions.dblink_exec(
  'career_race_admin',
  $remote$
    delete from auth.users
    where id in (
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    )
  $remote$
);
select extensions.dblink_disconnect('career_race_admin');

select * from finish();
rollback;
