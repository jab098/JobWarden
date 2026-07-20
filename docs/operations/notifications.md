# Scheduled Digest Operations

**Applies to:** Task 14 (`send-digests` Supabase Edge Function)
**State:** implemented and reviewed; **inert until the owner completes the setup below.** Without `RESEND_API_KEY` the function reports `delivery_unconfigured`, claims no slot, and sends nothing.

Read with [free-tier services and cost boundaries](../architecture/free-tier-services.md) and the [shared ingestion operations guide](ingestion.md).

## What it does

After each shared weekday ingestion slot, the function recomputes every opted-in owner's Target Feed over the already-indexed catalogue and sends at most one digest per owner per slot, only when at least one genuinely new job/profile match exists.

- Cadence: 09:00, 12:00, 15:00, and 18:00 `Europe/London`, weekdays only. Outside those hours the function returns `outside_schedule` and does nothing.
- Within that cadence each owner chooses their own schedule in Settings: which weekdays, and up to **three** of the four times. `list_pending_notification_digests` filters on `digest_hours` and `digest_weekdays`, so an owner whose schedule excludes the slot is not a recipient and no delivery row is claimed for them. Hours are restricted to the four ingestion slots on purpose: a digest at any other hour would report on nothing newly indexed. New rows default to 09:00 and 15:00, every weekday.
- The candidate window (200 newest active jobs) is read **once per invocation** and scored for every recipient. The digest path issues no source request at all, so it cannot create per-user source cost.
- A digest reports counts, job titles, employers, locations, and the matching search profile name. It never contains CV-derived text; the database projection that feeds the runtime omits the evidence excerpt entirely.

## Owner setup

Do these in order. Do not paste any secret into chat, an issue, or a pull request.

### 1. Resend account and sending domain

1. Create a free account at [resend.com](https://resend.com).
2. Add a **sending subdomain** (for example `mail.yourdomain.co.uk`), not the apex domain. A subdomain keeps digest reputation separate from your ordinary mail.
3. Resend shows the DNS records to add. In Cloudflare, add them on the subdomain:
   - the **SPF** `TXT` record,
   - the **DKIM** `TXT` record(s), and
   - the **DMARC** `TXT` record on `_dmarc.<subdomain>`.
     Set these records to **DNS only** (grey cloud), not proxied.
4. Wait for Resend to report the domain as verified. Do not continue until it does — an unverified domain sends straight to spam.
5. Create an API key with **sending permission only**, scoped to that domain.

### 2. Supabase secrets

Set these on the Supabase project (Edge Functions → Secrets), never in a migration or a client variable:

| Secret                                      | Required | Meaning                                                                                     |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                            | yes      | Sending credential. Absent means the function stays inert.                                  |
| `NOTIFICATION_SITE_URL`                     | yes      | Exact public origin, e.g. `https://jobwarden.example`. Used for feed and unsubscribe links. |
| `NOTIFICATION_SENDER_ADDRESS`               | yes      | `JobWarden <digests@mail.yourdomain.co.uk>` or a bare address on the verified domain.       |
| `NOTIFICATION_DAILY_LIMIT`                  | no       | Defaults to 80, deliberately below the documented free daily allowance.                     |
| `NOTIFICATION_MONTHLY_LIMIT`                | no       | Defaults to 2,500, deliberately below the documented free monthly allowance.                |
| `INGESTION_CRON_SECRET`                     | yes      | Reused from the ingestion runtime; the handler validates it in constant time.               |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes      | Already set for the ingestion runtime.                                                      |

Recheck the current Resend allowances before raising either ceiling. The ceilings are application-wide, not per user.

### 3. Deploy and schedule

```sh
supabase functions deploy send-digests
```

Schedule it **10 minutes after** each ingestion slot so a run's new jobs are indexed before matching, using the same Vault-stored bearer secret as the ingestion schedule:

```sql
select cron.schedule(
  'jobwarden-send-digests',
  '10 9,12,15,18 * * 1-5',
  $$ select net.http_post(
       url := '<project-functions-url>/send-digests',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || vault_secret('ingestion_cron_secret'),
         'Content-Type', 'application/json'
       )
     ) $$
);
```

`pg_cron` runs in UTC. The handler itself decides the London slot, so a schedule that fires outside a slot is a harmless no-op rather than an unexpected send.

## Sending decisions

Every slot writes exactly one auditable row per owner to `career_notification_deliveries`, and the unique `(owner_id, slot_key)` constraint makes a repeated invocation a no-op.

| Status                   | Meaning                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `sent`                   | Delivered; the announced matches are recorded so they are never announced again.                                       |
| `failed`                 | Provider refused or was unreachable. **No announcements are recorded**, so those matches are retried at the next slot. |
| `suppressed_no_matches`  | The owner had nothing new. No email.                                                                                   |
| `suppressed_daily_cap`   | The application-wide daily ceiling was already reached.                                                                |
| `suppressed_monthly_cap` | The application-wide monthly ceiling was already reached.                                                              |
| `pending`                | Claimed but not yet completed. Counts towards both ceilings so a send cannot race past them.                           |

Owners see these outcomes in plain language under **Career profile → Digest emails**.

## Routine operations

**Pause all sending immediately.** Set `NOTIFICATION_DAILY_LIMIT=0`. Slots are still recorded, as `suppressed_daily_cap`, so the pause is visible rather than silent. Unschedule the cron entry for a longer pause.

**Rotate the API key.** Create the new key in Resend, update the Supabase secret, then revoke the old key. A send in flight fails and retries at the next slot; nothing is lost.

**Check remaining allowance.**

```sql
select count(*) filter (where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') as today,
       count(*) filter (where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') as this_month
from public.career_notification_deliveries
where status in ('pending', 'sent');
```

**Investigate a complaint that digests are unwanted.** Confirm `career_notification_settings.channel_enabled` for that owner. Unsubscribe links set it to false without a session; the owner can also turn it off under Career profile. Per-search control lives on each named search.

**A stuck `pending` row** means the function died between claiming and completing. It consumes that owner's slot and counts towards the ceiling until the next slot. Leave it: it is an accurate record that an attempt happened, and the next slot proceeds normally.

## Failure behaviour

- One owner's failure never aborts the batch; the run continues to the next recipient.
- There is no retry inside a slot. One attempt per slot is deliberate — a retry loop against an email provider spends a free allowance twice on the same digest.
- Provider response bodies are never logged or stored; only a sanitised code such as `provider_rate_limited` is recorded.
- Recipient addresses are never written to logs.
- If the database read fails the function returns 503 and sends nothing.

## Pre-live gates

- Docker was unavailable during implementation, so `supabase db reset` and pgTAP file `015_scheduled_notifications.sql` have **not** run against real PostgreSQL. Both are mandatory before enabling the schedule.
- Send one digest to an owner-controlled address and confirm SPF, DKIM, and DMARC all pass in the received headers before any other recipient is enabled.
- Confirm the unsubscribe link resolves to `/unsubscribe`, requires the confirmation button, and turns the channel off.
