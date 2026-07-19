# Task 14 — Scheduled updates and notifications

**Branch:** `codex/task-14-scheduled-notifications`
**Baseline:** `47fa8f4` (local `main` after the Task 13 publication record)
**Sources of truth:** [roadmap Task 14](../../product/roadmap.md#task-14--scheduled-updates-and-notifications), [personalised search design](../specs/2026-07-18-personalised-job-search-design.md), [free-tier services](../../architecture/free-tier-services.md), [shipping standards](../../standards/shipping-standards.md)

Lenses in play: Supabase (three new force-RLS tables), Resend (deliverability and free-tier ceiling), touches user data (owner-only rows plus GDPR erasure), touches email (unsubscribe and no CV text), adds infra cost (hard daily/monthly ceilings), is user-facing (settings and delivery status surfaces).

## Outcome

After a shared weekday ingestion slot, JobWarden recomputes each opted-in owner's Target Feed over the already-indexed catalogue and sends at most one digest per owner per slot, only when at least one genuinely new job/profile match exists. The digest reports counts and job facts, never CV-derived evidence. Delivery is bounded by an application-wide daily and monthly ceiling, deduplicated by an announcement ledger, idempotent per slot, and quietly recorded when it fails.

## Deliberate decisions

1. **Separate `send-digests` Edge Function, not an extension of `ingest-jobs`.** Ingestion already runs to a 120-second invocation deadline across up to four sources. A notification failure must never abort or slow ingestion, and the two paths need independent schedules, budgets, and retry behaviour.
2. **Resend over its documented HTTP API, not the npm SDK.** One `fetch` to `POST https://api.resend.com/emails` with a bearer token replaces a new dependency in a Deno function. This keeps the free-tier-first and minimal-dependency constraints intact while still delivering the required guardrail transition. The path allowlist in the executable guard is implemented exactly as the roadmap requires — it is the guard, not the SDK, that the acceptance criterion names.
3. **No score threshold for digest inclusion.** A "new target match" is precisely what the Target Feed shows: a job that passes the eligibility gate for an enabled, notifying search profile. Inventing a separate digest threshold would make the email disagree with the product surface.
4. **Announcements are recorded only after a successful send.** A failed provider call must not suppress the next slot's digest.
5. **Master switch defaults off.** Notifications are opt-in per owner and additionally per search profile, which is the correct default for a private beta and for UK GDPR.
6. **Unsubscribe is a token link plus an explicit confirmation POST.** A bare GET unsubscribe is unsubscribed by mail-scanner prefetch; the link renders a confirmation page and the state change happens on submit.

## Data model — `supabase/migrations/202607190004_scheduled_notifications.sql`

Three tables, all `enable`d and `force`d for RLS, owner-select only, mutated exclusively through owner-fenced or service-role security-definer functions.

| Table | Purpose | Key constraint |
| --- | --- | --- |
| `career_notification_settings` | Per-owner master switch and unsubscribe token | primary key `owner_id`; `channel_enabled` defaults `false` |
| `career_notification_announcements` | Deduplication ledger of announced matches | unique `(owner_id, search_profile_id, job_id)` |
| `career_notification_deliveries` | Per-slot delivery status and auditable send counter | unique `(owner_id, slot_key)` |

`career_notification_deliveries.status` is one of `pending`, `sent`, `failed`, `suppressed_no_matches`, `suppressed_daily_cap`, `suppressed_monthly_cap`. The daily and monthly ceilings are counted from this table over `status in ('pending','sent')` so an in-flight row cannot race past the limit.

Functions:

- `set_career_notification_settings(target_enabled boolean)` — authenticated, takes the per-owner generation mutex, upserts the row, mints the unsubscribe token on first write.
- `unsubscribe_career_notifications(target_token uuid)` — executable by `anon` and `authenticated`, security definer, clears `channel_enabled` for the matching token and returns whether a row matched. No other column is readable through it.
- `list_pending_notification_digests(max_owners int)` — service role only. Returns owner id, email, enabled+notifying search profiles, and confirmed evidence for approved owners who have no delivery row for the requested slot.
- `begin_notification_digest(target_owner uuid, target_slot text, target_match_count int, daily_limit int, monthly_limit int)` — service role only. Atomically decides and records the slot outcome; returns `claimed`, `already_recorded`, `no_matches`, `daily_cap`, or `monthly_cap`.
- `finish_notification_digest(target_delivery_id uuid, target_status text, target_provider_message_id text, target_error_code text, target_announcements jsonb)` — service role only. Moves a `pending` row to `sent` or `failed` and, only on `sent`, bulk-inserts announcements with `on conflict do nothing`.
- `delete_career_profile_data()` — extended to erase settings, announcements, and deliveries.

`supabase/tests/015_scheduled_notifications.sql` covers the new RLS boundaries, the transition rules, the cap arithmetic, slot idempotency, announcement deduplication, unsubscribe by token, and erasure. Docker remains unavailable, so this file is statically verified only and stays a pre-live gate.

## Domain — `packages/domain/src/notifications.ts`

Pure, deterministic, no I/O:

- `londonSlotKey(date)` → `YYYY-MM-DDTHH` in `Europe/London`, and `isNotificationSlot(date)` for the weekday 09/12/15/18 cadence, reusing the existing London calendar helper rather than a second time-zone implementation.
- `selectNewMatches({ candidates, searches, confirmedEvidence, announced, now })` → runs the existing `applyEligibilityGate` and `scoreJobForProfile`, drops already-announced `(searchProfileId, jobId)` pairs, and returns the new matches plus the announcement keys to record. Scoring is not reimplemented here.
- `buildDigestMessage({ matches, siteUrl, maxListed })` → subject, plain-text body, and minimal HTML. Its input type carries only job title, employer, location, profile name, and counts. Evidence, excerpts, and CV-derived fields are structurally absent, so "no CV text in the payload" is enforced by the type, not by a reviewer's care.

## Edge function — `supabase/functions/send-digests/`

Mirrors the reviewed `ingest-jobs` shape: `contracts.ts`, `environment.ts`, `errors.ts`, `repository.ts`, `handler.ts`, `index.ts`, `resend.ts`, plus colocated tests and `deno.json`/`vitest.config.ts`.

- Custom bearer secret validated by constant-time digest comparison, exactly as `ingest-jobs` does; `verify_jwt = false` in `config.toml`.
- Bounded: at most 25 owners per invocation, 200 candidate jobs read once and shared across all owners, a 120-second invocation deadline, and a per-send timeout. No source is ever called, so the digest path cannot create per-user source cost.
- `resend.ts` is the only module permitted to reference Resend. It owns its own `RESEND_API_KEY` parsing so no other file needs the name, performs one attempt with an abort timeout, and returns a sanitised outcome rather than throwing provider detail.
- Failure is quiet: a provider error records `failed` with a sanitised code and the run continues to the next owner.

## Web

- `apps/web/src/lib/notifications/` follows the established repository split (`repository.ts`, `supabase-notifications.ts`, `development-notifications.ts`, `get-repository.ts`, `types.ts`). The fictional preview refuses mutations exactly like every other surface.
- `/profile` gains a notifications section: the master toggle, a plain-language explanation of the cadence, and the recent delivery list with honest per-status labels.
- The per-profile control becomes real. `search-profile-form.tsx` currently hardcodes `notificationsEnabled: false` and renders the literal text `notifications off`; both are replaced with a working checkbox and a truthful label.
- `/unsubscribe` is a new public route: `?token=` renders a confirmation page, the POST performs the change, and an unknown token gets the same neutral response as a known one.

## Guardrail transition — `scripts/check-project-guardrails.mjs`

Test-first, in this order:

1. Assert the current global ban exists (the failing-test proof the roadmap requires).
2. Replace `deferredDependencies` with a path allowlist: any case-insensitive `resend` reference outside `supabase/functions/send-digests/resend.ts` and its colocated test is a violation.
3. Extend the scanned roots to include `supabase/functions`, so the adapter's neighbours are actually covered by the guard rather than merely uninspected.
4. Prove the guard rejects a planted reference in a client component, an unrelated server module, and a package.

`tests/guardrails/project-guardrails.test.ts` is updated in the same commit to assert the new boundary rather than the old ban.

## Verification

The full release gate from `docs/project-status.md`, plus:

- `pnpm vitest run --config supabase/functions/send-digests/vitest.config.ts`
- `pnpm check:deno` covering the new function's deployment graph
- `pnpm check:supabase` at 14 migrations and 30 forced-RLS tables
- browser verification of `/profile` notifications and `/unsubscribe` at 1440 px and true 390 px

## Rollback

The feature is inert until the owner sets `RESEND_API_KEY` and schedules the cron entry. Without the key the function records `suppressed` outcomes and sends nothing. Reverting the migration drops three additive tables and restores the previous `delete_career_profile_data` body; no existing table is altered destructively.

## Owner setup gate

Resend account, API key, verified sending domain, and SPF/DKIM/DMARC records, documented click-by-click in `docs/operations/notifications.md`. Nothing in this task requires that setup to pass review; the runtime stays disabled until the owner completes it.
