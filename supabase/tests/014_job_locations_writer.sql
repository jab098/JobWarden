begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- This migration rewrites the whole body of the function that materialises a
-- canonical job, so the assertions below check both that the location rows now
-- get written and that nothing the function already did was lost on the way.

select has_function(
  'private', 'rematerialize_canonical_job', array['uuid'],
  'the canonical materialiser still exists'
);

select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    like '%insert into public.job_locations%',
  'the location table finally has a writer'
);

select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    like '%delete from public.job_locations%',
  'location rows are replaced rather than accumulated across winners'
);

-- The delete must precede the backward-compatibility return, or a winner that
-- regresses to an occurrence predating this migration keeps the previous
-- winner's location and the job is matchable somewhere it is not advertised.
select ok(
  position(
    'delete from public.job_locations'
    in pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
  ) < position(
    'inventing one would be worse'
    in pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
  ),
  'the stale row is cleared before the pre-migration occurrence returns early'
);

select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    not like '%latitude%',
  'coordinates are left to the resolver rather than set at write time'
);

-- Everything the function did before must still be there.
select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    like '%uk_eligibility_evidence = eligibility_evidence%',
  'UK eligibility evidence is still materialised'
);
select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    like '%lifecycle_status = case when has_active_occurrence%',
  'lifecycle still follows whether an active occurrence remains'
);

select ok(
  not has_function_privilege(
    'authenticated', 'private.rematerialize_canonical_job(uuid)', 'EXECUTE'
  ),
  'materialisation stays unreachable from the product'
);

-- The writer must not be able to violate the column's own constraints.
select ok(
  pg_get_functiondef('private.rematerialize_canonical_job(uuid)'::regprocedure)
    like '%left(btrim(winning_location), 1000)%',
  'a long provider location is truncated to what the column accepts'
);

select * from finish();

rollback;
