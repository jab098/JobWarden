begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select has_table('public', 'career_notification_settings', 'notification settings are persisted');
select has_table('public', 'career_notification_announcements', 'announced matches are persisted');
select has_table('public', 'career_notification_deliveries', 'delivery outcomes are persisted');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'career_notification_settings',
        'career_notification_announcements',
        'career_notification_deliveries'
      )
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  3,
  'all three notification tables enable and force RLS'
);

select policies_are(
  'public',
  'career_notification_settings',
  array['approved users read own notification settings'],
  'settings expose only the owner select policy'
);
select policies_are(
  'public',
  'career_notification_announcements',
  array['approved users read own notification announcements'],
  'announcements expose only the owner select policy'
);
select policies_are(
  'public',
  'career_notification_deliveries',
  array['approved users read own notification deliveries'],
  'deliveries expose only the owner select policy'
);

select col_default_is(
  'public', 'career_notification_settings', 'channel_enabled', 'false',
  'the notification channel is opt-in'
);

select has_function(
  'public', 'set_career_notification_settings', array['boolean'],
  'the owner-fenced settings RPC exists'
);
select has_function(
  'public', 'unsubscribe_career_notifications', array['uuid'],
  'the token unsubscribe RPC exists'
);
select has_function(
  'public', 'list_pending_notification_digests', array['text', 'integer'],
  'the service-role digest read exists'
);
select has_function(
  'public', 'begin_notification_digest',
  array['uuid', 'text', 'integer', 'integer', 'integer'],
  'the slot claim RPC exists'
);
select has_function(
  'public', 'finish_notification_digest',
  array['uuid', 'text', 'text', 'text', 'jsonb'],
  'the slot completion RPC exists'
);

select is_definer(
  'public', 'begin_notification_digest',
  array['uuid', 'text', 'integer', 'integer', 'integer'],
  'slot claims run as security definer'
);
select is_definer(
  'public', 'unsubscribe_career_notifications', array['uuid'],
  'unsubscribe runs as security definer'
);

-- The digest runtime is service-role only. An authenticated browser session
-- must never be able to read another owner's recipients or forge a delivery.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_pending_notification_digests(text, integer)',
    'EXECUTE'
  ),
  'authenticated callers cannot list digest recipients'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_notification_digest(uuid, text, integer, integer, integer)',
    'EXECUTE'
  ),
  'authenticated callers cannot claim a delivery slot'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.finish_notification_digest(uuid, text, text, text, jsonb)',
    'EXECUTE'
  ),
  'authenticated callers cannot complete a delivery slot'
);
select ok(
  not has_function_privilege(
    'anon', 'public.set_career_notification_settings(boolean)', 'EXECUTE'
  ),
  'anonymous callers cannot change notification settings'
);
select ok(
  has_function_privilege(
    'anon', 'public.unsubscribe_career_notifications(uuid)', 'EXECUTE'
  ),
  'unsubscribe remains reachable from an email client without a session'
);

select throws_ok(
  $$ select public.begin_notification_digest(
       '00000000-0000-4000-8000-000000000001', 'not-a-slot', 1, 10, 100) $$,
  '22023',
  null,
  'slot claims reject a malformed slot key'
);
select throws_ok(
  $$ select public.begin_notification_digest(
       '00000000-0000-4000-8000-000000000001', '2026-07-20T09', -1, 10, 100) $$,
  '22023',
  null,
  'slot claims reject a negative match count'
);
select throws_ok(
  $$ select public.list_pending_notification_digests('2026-07-20T09', 0) $$,
  '22023',
  null,
  'the digest read rejects a non-positive owner limit'
);
select throws_ok(
  $$ select public.list_pending_notification_digests('2026-07-20T09', 500) $$,
  '22023',
  null,
  'the digest read rejects an unbounded owner limit'
);
select throws_ok(
  $$ select public.finish_notification_digest(
       '00000000-0000-4000-8000-000000000001', 'sent', null, null, 'null'::jsonb) $$,
  '22023',
  null,
  'slot completion rejects a non-array announcement payload'
);
select throws_ok(
  $$ select public.finish_notification_digest(
       '00000000-0000-4000-8000-000000000001', 'queued', null, null, '[]'::jsonb) $$,
  '22023',
  null,
  'slot completion rejects a status outside sent and failed'
);
select throws_ok(
  $$ select public.finish_notification_digest(
       '00000000-0000-4000-8000-000000000001', 'sent', null, null, '[]'::jsonb) $$,
  'P0002',
  null,
  'slot completion rejects a delivery that was never claimed'
);

-- The bound must sit above the runtime's own worst case (200 candidate jobs
-- times 25 notifying searches), or a legitimate first digest would be sent and
-- then fail to record, re-announcing the same matches at the next slot.
select throws_ok(
  $$ select public.finish_notification_digest(
       '00000000-0000-4000-8000-000000000001', 'sent', null, null,
       (select jsonb_agg(jsonb_build_object(
          'search_profile_id', '00000000-0000-4000-8000-000000000002'::uuid,
          'job_id', '00000000-0000-4000-8000-000000000003'::uuid))
        from generate_series(1, 5001))) $$,
  '22023',
  null,
  'slot completion rejects an announcement payload beyond the runtime bound'
);
select lives_ok(
  $$ select 1 from jsonb_array_elements(
       (select jsonb_agg(jsonb_build_object(
          'search_profile_id', '00000000-0000-4000-8000-000000000002'::uuid,
          'job_id', '00000000-0000-4000-8000-000000000003'::uuid))
        from generate_series(1, 5000))) limit 1 $$,
  'the runtime worst case of 5000 announcements stays inside the bound'
);

select is(
  public.unsubscribe_career_notifications(
    '00000000-0000-4000-8000-0000000000ff'
  ),
  false,
  'an unknown unsubscribe token reports no match rather than raising'
);

select throws_ok(
  $$ insert into public.career_notification_deliveries (owner_id, slot_key, status)
     values ('00000000-0000-4000-8000-000000000001', '2026-07-20T09', 'queued') $$,
  '23514',
  null,
  'deliveries reject a status outside the explicit vocabulary'
);
select throws_ok(
  $$ insert into public.career_notification_deliveries (owner_id, slot_key, status)
     values ('00000000-0000-4000-8000-000000000001', 'monday morning', 'sent') $$,
  '23514',
  null,
  'deliveries reject a slot key outside the hour-resolution format'
);
select throws_ok(
  $$ insert into public.career_notification_deliveries
       (owner_id, slot_key, status, error_code)
     values ('00000000-0000-4000-8000-000000000001', '2026-07-20T09', 'failed',
             'Provider said: 429 Too Many Requests for user@example.com') $$,
  '23514',
  null,
  'deliveries reject an unsanitised provider error string'
);
select throws_ok(
  $$ insert into public.career_notification_deliveries (owner_id, slot_key, status, match_count)
     values ('00000000-0000-4000-8000-000000000001', '2026-07-20T09', 'sent', -3) $$,
  '23514',
  null,
  'deliveries reject a negative match count'
);

select * from finish();

rollback;
