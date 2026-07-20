begin;

-- `job_locations` has existed since Task 1 and has never had a writer. Nothing
-- in the ingestion path inserts a row: the normaliser computed the advert's
-- location text, used it to classify UK eligibility and workplace type, and
-- then discarded it.
--
-- The table being empty is why both location features are inert. The text
-- filter in Search Jobs inner-joins it, and Task 25's radius search reads its
-- coordinates, so today both correctly return nothing — a job with no location
-- row cannot be shown to be anywhere. That is the safe failure, but it is still
-- a whole feature with no data behind it.
--
-- The normalised job now carries `rawLocation` and `remoteEligibility`, and
-- this gives them a home. The rows are written where the canonical job is
-- materialised, which is already the one transactional point that projects a
-- winning occurrence onto `public.jobs`, so a job and its location can never
-- disagree about which occurrence won.
--
-- Coordinates are deliberately not set here. The trigger added in Task 25
-- resolves them from `raw_location` on insert, so this function states what the
-- advert said and the resolver decides where that is.

create or replace function private.rematerialize_canonical_job(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  winner record;
  eligibility_evidence text[];
  has_active_occurrence boolean;
  winning_location text;
  winning_remote_eligibility text;
begin
  select
    occurrence.candidate_data,
    occurrence.content_hash,
    occurrence.source_id,
    occurrence.provider_job_id,
    occurrence.last_seen_at,
    occurrence.last_seen_source_run_id,
    occurrence.closes_at
  into winner
  from public.job_source_occurrences as occurrence
  join public.job_sources as source on source.id = occurrence.source_id
  where occurrence.job_id = target_job_id
  order by
    case when occurrence.lifecycle_status = 'active' then 0 else 1 end,
    case occurrence.candidate_data ->> 'compensationProvenance'
      when 'advertised' then 0
      when 'estimated' then 1
      else 2
    end,
    case source.provider when 'greenhouse' then 0 else 1 end,
    occurrence.last_seen_at desc,
    occurrence.source_id,
    occurrence.provider_job_id
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(array_agg(evidence_value), '{}'::text[])
  into eligibility_evidence
  from jsonb_array_elements_text(
    winner.candidate_data -> 'ukEligibilityEvidence'
  ) as evidence(evidence_value);

  select exists (
    select 1
    from public.job_source_occurrences
    where job_id = target_job_id and lifecycle_status = 'active'
  ) into has_active_occurrence;

  update public.jobs
  set
    source_id = winner.source_id,
    provider_job_id = winner.provider_job_id,
    title = winner.candidate_data ->> 'title',
    employer = winner.candidate_data ->> 'employer',
    description_text = winner.candidate_data ->> 'descriptionText',
    application_url = winner.candidate_data ->> 'applicationUrl',
    country_code = winner.candidate_data ->> 'countryCode',
    uk_eligibility_evidence = eligibility_evidence,
    employment_type = winner.candidate_data ->> 'employmentType',
    working_time = winner.candidate_data ->> 'workingTime',
    workplace_type = winner.candidate_data ->> 'workplaceType',
    ir35_status = winner.candidate_data ->> 'ir35Status',
    compensation_raw = winner.candidate_data ->> 'compensationRaw',
    compensation_minimum = (winner.candidate_data ->> 'compensationMinimum')::integer,
    compensation_maximum = (winner.candidate_data ->> 'compensationMaximum')::integer,
    compensation_currency = winner.candidate_data ->> 'compensationCurrency',
    compensation_period = winner.candidate_data ->> 'compensationPeriod',
    compensation_provenance = winner.candidate_data ->> 'compensationProvenance',
    compensation_observed_at = (winner.candidate_data ->> 'compensationObservedAt')::timestamptz,
    posted_at = (winner.candidate_data ->> 'postedAt')::timestamptz,
    closes_at = winner.closes_at,
    deduplication_key = winner.candidate_data ->> 'deduplicationKey',
    content_hash = winner.content_hash,
    last_seen_at = winner.last_seen_at,
    last_seen_source_run_id = winner.last_seen_source_run_id,
    lifecycle_status = case when has_active_occurrence then 'active' else 'closed' end,
    closed_at = case
      when has_active_occurrence then null
      else coalesce(closed_at, clock_timestamp())
    end,
    updated_at = clock_timestamp()
  where id = target_job_id;

  winning_location := winner.candidate_data ->> 'rawLocation';

  -- The delete happens before the backward-compatibility check, not after it.
  -- Every other column here is unconditionally overwritten from the current
  -- winner, and location has to behave the same way. Returning early with the
  -- old rows still in place would leave a job advertised at a location only a
  -- previous winner ever claimed -- reachable whenever the winner regresses to
  -- an occurrence persisted before this migration, since the provider and
  -- compensation tie-breaks outrank recency.
  --
  -- Having no location is the honest state for such a job. It stays matchable
  -- by nothing rather than by somewhere it is not, until its source runs again
  -- and supplies a real one.
  delete from public.job_locations where job_id = target_job_id;

  -- An occurrence written before this migration carries no `rawLocation`, and
  -- inventing one would be worse than having none.
  if winning_location is null or btrim(winning_location) = '' then
    return;
  end if;

  winning_remote_eligibility := coalesce(
    winner.candidate_data ->> 'remoteEligibility', 'unknown'
  );
  if winning_remote_eligibility
     not in ('uk', 'not_remote', 'ambiguous', 'unknown') then
    winning_remote_eligibility := 'unknown';
  end if;

  insert into public.job_locations (job_id, raw_location, remote_eligibility)
  values (
    target_job_id, left(btrim(winning_location), 1000), winning_remote_eligibility
  );
end;
$$;

revoke all on function private.rematerialize_canonical_job(uuid)
  from public, anon, authenticated;

commit;
