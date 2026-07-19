begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'uk_places', 'seeded place centroids exist');
select has_function(
  'public', 'miles_between', array['numeric', 'numeric', 'numeric', 'numeric'],
  'great-circle distance exists'
);
select has_function(
  'public', 'jobs_within_radius', array['text', 'integer'],
  'radius search exists'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class where oid = 'public.uk_places'::regclass),
  'place reference data still sits behind forced row level security'
);
select ok(
  not has_table_privilege('anon', 'public.uk_places', 'SELECT'),
  'place reference data is unreachable without an authenticated session'
);
select ok(
  not has_table_privilege('authenticated', 'public.uk_places', 'INSERT')
  and not has_table_privilege('authenticated', 'public.uk_places', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.uk_places', 'DELETE'),
  'reference data is read-only to the product'
);

-- Distance arithmetic, checked against figures that do not depend on the seed.
select ok(
  public.miles_between(53.4789, -2.2453, 53.4789, -2.2453) < 0.0001,
  'a point is zero miles from itself'
);
select ok(
  abs(public.miles_between(51.5074, -0.1278, 55.9533, -3.1883) - 331) < 12,
  'London to Edinburgh is about 331 miles'
);
select ok(
  public.miles_between(53.4789, -2.2453, 53.4806, -2.2950)
    = public.miles_between(53.4806, -2.2950, 53.4789, -2.2453),
  'distance is symmetric'
);

-- Name resolution, which is where a wrong answer is silent rather than loud.
select is(
  private.normalise_place_name('Stoke-on-Trent'),
  'stoke on trent',
  'normalisation folds punctuation and case'
);
-- The application strips combining marks rather than spacing them, so a name
-- carrying one has to normalise the same way here or it matches in one layer
-- and not the other.
select is(
  private.normalise_place_name('Ynys Mon'),
  'ynys mon',
  'an unaccented name is unchanged'
);
select is(
  private.normalise_place_name(U&'Ynys M\00F4n'),
  'ynys mon',
  'a combining mark is removed, not turned into a word break'
);

-- "Bangor" names a city in Gwynedd and another in County Down, both seeded.
-- Guessing one would write the wrong coordinates and the wrong nation onto
-- roughly half of all Bangor jobs, permanently and invisibly.
select ok(
  (select id from public.resolve_uk_place('Bangor')) is null,
  'an ambiguous place name resolves to nothing rather than to a guess'
);
select is(
  (select name from public.resolve_uk_place('Leeds, West Yorkshire (hybrid)')),
  'Leeds',
  'a place name is found inside advert prose'
);
select ok(
  (select id from public.resolve_uk_place('Bathgate')) is null
  or (select name from public.resolve_uk_place('Bathgate')) <> 'Bath',
  'a place name inside a longer word does not match'
);

select * from finish();

rollback;
