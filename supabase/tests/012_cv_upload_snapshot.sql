begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- The upload client decides whether to render a file input from the snapshot
-- alone. If the flag ever stops travelling with the generation, the client can
-- offer an upload the Storage policy will then refuse, so assert the payload
-- shape rather than trusting it.

select has_function(
  'public', 'get_career_profile_snapshot', array[]::text[],
  'the snapshot RPC the upload client reads still exists'
);

select ok(
  pg_get_functiondef('public.get_career_profile_snapshot()'::regprocedure)
    like '%uploadsEnabled%',
  'the snapshot reports whether CV uploads are open'
);

select ok(
  pg_get_functiondef('public.get_career_profile_snapshot()'::regprocedure)
    like '%career_cv_uploads_enabled()%',
  'the reported flag is the server-controlled switch, not a literal'
);

select ok(
  not has_function_privilege(
    'anon', 'public.get_career_profile_snapshot()', 'EXECUTE'
  ),
  'the snapshot stays unreachable without an authenticated session'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.get_career_profile_snapshot()', 'EXECUTE'
  ),
  'an approved signed-in owner can read their own snapshot'
);

-- Uploads must stay closed until an administrator opens them. A default of true
-- would open the upload path on every fresh environment.
select is(
  public.career_cv_uploads_enabled(),
  false,
  'CV uploads are closed until an administrator opens them'
);

select * from finish();

rollback;
