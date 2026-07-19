begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table('public', 'career_cv_variants', 'tailored variants are persisted');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'career_cv_variants'
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  1,
  'tailored variants enable and force RLS'
);

select policies_are(
  'public',
  'career_cv_variants',
  array['approved users read own cv variants'],
  'variants expose only the owner select policy'
);

select has_function(
  'public', 'save_cv_variant', array['uuid', 'uuid', 'text', 'jsonb'],
  'the owner-fenced variant save RPC exists'
);
select has_function(
  'public', 'promote_cv_variant', array['uuid'],
  'the draft promotion RPC exists'
);
select has_function(
  'public', 'delete_cv_variant', array['uuid'],
  'the variant deletion RPC exists'
);
select has_function(
  'public', 'expire_cv_variants', array[]::text[],
  'the retention sweep exists'
);
select is_definer(
  'public', 'save_cv_variant', array['uuid', 'uuid', 'text', 'jsonb'],
  'variant saves run as security definer'
);

select ok(
  not has_function_privilege('anon', 'public.save_cv_variant(uuid, uuid, text, jsonb)', 'EXECUTE'),
  'anonymous callers cannot save a variant'
);
select ok(
  not has_function_privilege('authenticated', 'public.expire_cv_variants()', 'EXECUTE'),
  'authenticated callers cannot run the retention sweep'
);

-- The operation vocabulary is enforced at the database boundary, so a crafted
-- payload cannot store an instruction the editor would later act on.
select ok(
  public.career_cv_operations_are_valid(
    '[{"paragraphIndex": 0, "kind": "omit"},
      {"paragraphIndex": 3, "kind": "replace", "text": "Analytics implementation"}]'::jsonb
  ),
  'a well-formed operation list is accepted'
);
select ok(
  public.career_cv_operations_are_valid('[]'::jsonb),
  'an empty operation list is accepted'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": 0, "kind": "reorder"}]'::jsonb),
  'operations outside the replace and omit vocabulary are rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": -1, "kind": "omit"}]'::jsonb),
  'a negative paragraph index is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": 1.5, "kind": "omit"}]'::jsonb),
  'a fractional paragraph index is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": "0", "kind": "omit"}]'::jsonb),
  'a non-numeric paragraph index is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": 0, "kind": "replace"}]'::jsonb),
  'a replacement without text is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": 0, "kind": "replace", "text": ""}]'::jsonb),
  'a replacement with empty text is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('[{"paragraphIndex": 0, "kind": "omit", "text": "sneaky"}]'::jsonb),
  'an omission carrying text is rejected'
);
select ok(
  not public.career_cv_operations_are_valid('["not an object"]'::jsonb),
  'a non-object operation is rejected'
);

select throws_ok(
  $$ insert into public.career_cv_variants
       (owner_id, cv_document_id, job_id, name, status, expires_at)
     values ('00000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-000000000003', 'Draft', 'draft', null) $$,
  '23514',
  null,
  'a draft without an expiry is rejected'
);
select throws_ok(
  $$ insert into public.career_cv_variants
       (owner_id, cv_document_id, job_id, name, status, expires_at)
     values ('00000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-000000000003', 'Saved', 'saved', now()) $$,
  '23514',
  null,
  'a saved variant carrying an expiry is rejected'
);
select throws_ok(
  $$ insert into public.career_cv_variants
       (owner_id, cv_document_id, job_id, name, status, expires_at)
     values ('00000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-000000000003', 'Bad', 'published', now()) $$,
  '23514',
  null,
  'a status outside draft and saved is rejected'
);
select throws_ok(
  $$ select public.save_cv_variant(
       '00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000003',
       'Draft',
       '[{"paragraphIndex": 0, "kind": "reorder"}]'::jsonb) $$,
  '42501',
  null,
  'an unauthenticated caller is refused before operation validation'
);

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'jobwarden-cv-variant-expiry'
  ),
  1,
  'the hourly variant expiry sweep is scheduled'
);

select * from finish();

rollback;
