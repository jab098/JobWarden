begin;

-- F1 — per-user employer mute.
--
-- Noise reduction the user asked for: hide every listing from an employer they
-- never want to see, across the Target Feed. Deterministic and evidence-free —
-- it stores only an employer name the user chose to hide, which never touches
-- matching or scoring, only visibility.
--
-- Mirrors the career_job_decisions ownership model exactly: forced RLS, an
-- owner-only read policy, writes through a security-definer RPC, and the same
-- revoke/grant shape.

create table public.career_muted_employers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  employer text not null check (length(employer) between 1 and 300),
  created_at timestamptz not null default now(),
  constraint career_muted_employers_owner_employer_unique
    unique (owner_id, employer)
);

alter table public.career_muted_employers enable row level security;
alter table public.career_muted_employers force row level security;

create policy "approved users read own muted employers"
on public.career_muted_employers for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_muted_employers from public, anon, authenticated;
grant select on public.career_muted_employers to authenticated;
grant all on public.career_muted_employers to service_role;
-- Match 202607220010: every career table gives service_role only arwd, never
-- truncate/references/trigger/maintain. That migration's default-privilege
-- revoke protects tables that inherit the default ACL, but this explicit
-- `grant all` overrides it and re-adds the four dangerous verbs — including the
-- TRUNCATE that 220010 exists to prevent — so they are revoked back here, and
-- pgTAP 025's "no public table lets service_role truncate it" invariant holds.
revoke truncate, references, trigger, maintain
  on public.career_muted_employers from service_role;

-- A mute is a user preference, not profile evidence. It carries no personal data
-- (only an employer name the user typed) and its owner_id cascades with the
-- account, so `delete_career_profile_data` deliberately leaves it and the data
-- export deliberately omits it — neither function is reproduced here. Revisit if
-- mutes ever hold anything a user could consider personal.

create or replace function public.set_employer_mute(
  target_employer text,
  muted boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized text := btrim(target_employer);
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if length(normalized) < 1 or length(normalized) > 300 then
    raise exception using errcode = '22023', message = 'invalid employer';
  end if;

  if muted then
    insert into public.career_muted_employers (owner_id, employer)
    values (actor_user_id, normalized)
    on conflict (owner_id, employer) do nothing;
  else
    delete from public.career_muted_employers
    where owner_id = actor_user_id and employer = normalized;
  end if;
  return muted;
end;
$$;

revoke all on function public.set_employer_mute(text, boolean) from public, anon;
grant execute on function public.set_employer_mute(text, boolean) to authenticated;

commit;
