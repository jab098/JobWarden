# Career Profile Data Operations

**Applies to:** Task 10 career profiles, private CV documents, extraction proposals, evidence, suggestions, and named searches

**Live status:** implemented and fixture-tested, but real CV upload is disabled. Do not activate this path until the live authentication, approved-access, RLS, private Storage, deletion, retention, and Docker-backed pgTAP gates below have passed.

## Data path and boundaries

- An approved authenticated user owns every profile, CV metadata row, extraction run, evidence item, suggestion, and named search. RLS is forced on every public table and there is no administrator read override.
- `career-documents` is private, capped at 5 MiB, limited to DOCX/PDF MIME types, and isolates objects under the authenticated owner's UUID path.
- The private `career_cv_uploads_enabled` setting defaults false. Storage insert/update, CV registration, and extraction claims all fail while it is false; Task 10 exposes no administrator or user setter.
- The Edge Function claims work with the caller's JWT, downloads with the server-only service role, validates bytes before parsing, and writes only bounded structured results.
- Logs contain a correlation ID, counts, duration, model identifier, and a sanitised error code. They never contain a file name, object path, CV text, evidence excerpt, email, phone number, token, or provider response.
- Real files must never be used as repository fixtures. The local UI remains a labelled immutable fictional preview and exposes no file input.

## Safe replacement ordering

Use a new immutable object path for every upload. Never overwrite the current object in place.

1. Upload the new object to `career-documents/{authenticated-user-id}/{random-id}.{docx|pdf}`.
2. Register exactly that path and its server-computed SHA-256, media type, byte count, and safe display name with `register_cv_document`. This makes the new metadata current but retains the previous object and metadata as the rollback candidate.
3. Invoke `extract-career-profile` with the returned document ID and a deterministic 64-character hexadecimal idempotency key.
4. On success, the database atomically stores the bounded proposal, materialises reviewable evidence and suggestions, and marks the new document ready.
5. Only after step 4 succeeds, remove the previous inactive object from private Storage. Then call `purge_inactive_cv_document(document_id, expected_storage_path)` with the service role to remove its metadata and cascaded derived rows.
6. If extraction fails, the completion RPC marks the new document failed and atomically restores the most recent usable previous document as current. Remove the failed inactive object from Storage before calling the same purge RPC. When there is no previous document, retain the failed current row long enough to show the sanitised failure and offer a deliberate retry or owner deletion.

The Storage deletion always happens before metadata deletion. If Storage removal fails, stop: retain metadata so the object remains discoverable for a later cleanup attempt. The purge RPC refuses to delete a current document and requires the exact expected path, preventing a stale cleanup job from deleting a replacement.

## User deletion

`Delete CV data` resolves the user's current metadata, removes that exact private Storage path, then calls `delete_current_cv` with both document ID and expected path. The database cascade removes extraction runs, CV-derived evidence, and suggestions.

`Delete full profile` first lists all non-deleted CV paths owned by the caller, removes those Storage objects, then calls `delete_career_profile_data`. The profile cascade removes CV metadata, extraction runs, evidence, suggestions, named searches, and the per-user AI counter. If any Storage deletion fails, the metadata transaction is not started and the user can retry without creating an orphaned object.

Before live activation, exercise both controls with fictional local documents and prove that the bucket and all seven career-data surfaces contain no remaining rows or objects for the test owner. Task 16 must add the complete user-data export and production erasure exercise.

## Retention and cleanup

- The original CV remains until the user deletes/replaces it or the owner executes an approved erasure request. JobWarden does not silently retain an overwritten inactive object after its replacement is ready.
- Raw structured extraction proposals expire 24 hours after successful completion. `jobwarden-career-proposal-expiry` runs hourly at minute 17 and clears the proposal while preserving counts, status, timestamps, and separately materialised review items.
- Evidence excerpts are limited to 280 characters and contact patterns are redacted before persistence. Confirmed/rejected evidence remains until CV or profile deletion because it is the user's reviewed personalisation record.
- Failed or replaced inactive objects are cleanup work, not durable history. The service removes the object first and then calls `purge_inactive_cv_document`; it never bulk-deletes by prefix or unresolved user input.
- AI usage rows contain only user ID, date, count, and timestamp. No prompt, CV text, output, evidence excerpt, file name, or object path enters the counter.

Inspect overdue raw proposals without selecting their contents:

```sql
select count(*) as overdue_proposal_count
from public.cv_extraction_runs
where status = 'succeeded'
  and proposal is not null
  and proposal_expires_at <= clock_timestamp();
```

Inspect inactive cleanup candidates without opening CV content:

```sql
select id, user_id, storage_path, lifecycle_status, replaced_at
from public.cv_documents
where not is_current and deleted_at is null
order by replaced_at nulls last, uploaded_at;
```

## Deterministic and optional AI ceilings

Deterministic extraction is always first and remains the product fallback. Optional Cloudflare Workers AI is disabled by default.

| Boundary                          |                    Enforced value |
| --------------------------------- | --------------------------------: |
| File bytes                        |                             5 MiB |
| DOCX archive entries              |                             2,000 |
| PDF pages                         |                               250 |
| Extracted characters              |                           100,000 |
| Deterministic extraction deadline |                        20 seconds |
| AI input                          |                 60,000 characters |
| AI output                         |                      4,000 tokens |
| AI request deadline               |                        30 seconds |
| Concurrent extraction per user    |                                 1 |
| AI attempts application-wide/day  | configurable `0..25`, default `0` |

The database takes a global daily transaction lock before the atomic `career_ai_daily_usage` reservation, so simultaneous users cannot exceed the application-wide allowance. Each reservation remains attributable to its user without storing any CV content. Invalid schema, timeout, missing credentials, quota exhaustion, or provider failure discards the optional result and preserves deterministic evidence. There is no retry, paid overage, alternate paid provider, or silent model switch.

## Local verification and activation gate

Docker or another supported container runtime is required for the real Supabase checks. From this Dev repository root:

```sh
pnpm install --frozen-lockfile
pnpm check:supabase
pnpm test:functions
pnpm typecheck:functions
pnpm check:deno
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest test db
```

Then use only explicitly fictional DOCX/PDF documents to verify:

1. a pending user, another approved user, and an administrator cannot read the owner's rows or object;
2. mismatched MIME/magic, DOCM, unsafe ZIP relationships, oversized archives, encrypted PDFs, excessive pages, and timeouts fail with sanitised codes;
3. a successful replacement keeps the old object until the new document is ready, then removes Storage before metadata;
4. a failed replacement restores the prior document and the failed object is removed before purge;
5. confirm/exclude decisions affect only the caller's proposed evidence;
6. raw proposals disappear after the 24-hour expiry job while review items remain; and
7. CV-only and full-profile deletion leave no object or derived personal data.

Keep `CAREER_PROFILE_AI_DAILY_ALLOWANCE=0` for the first live-boundary tests. AI may be considered only after the owner rechecks Cloudflare's current free allowance and data-use terms, creates a least-privilege server token, sets a reviewed model, and repeats deletion/retention tests with fictional data. Never paste these secrets into chat or Git.

Real upload remains disabled until all checks above pass in the linked Supabase environment and Task 16 activates production authentication. Enabling a bucket or deploying the function alone does not authorise the UI upload capability.

Task 16 must activate the database setting only through a reviewed forward migration or equally audited owner-only operation after the tests pass, then separately enable the server-derived web capability. Never toggle the database gate merely to make an incomplete UI path work.

## Incident response and rollback

1. Disable the UI capability and optional AI allowance first. Do not weaken RLS or make the bucket public to diagnose an incident.
2. Preserve only correlation IDs, counts, function version, sanitised error code, and affected opaque row IDs. Do not copy CV text, excerpts, file names, paths, tokens, or contact details into an incident note.
3. For suspected cross-user access, stop the function, revoke the relevant server secret, verify forced RLS/Storage policies, and treat it as a personal-data incident under the Task 16 process.
4. For cleanup failure, retry the exact Storage path. Purge metadata only after Storage confirms removal.
5. For an extraction regression, deploy the last known-good function and leave AI allowance at zero. Existing deterministic review data remains usable.
6. Repair database defects with a forward migration. Never rewrite completed extraction history or bypass owner-derived RPCs.
7. Before reactivation, rerun the full repository verification, database reset, pgTAP, secret scan, and the fictional replacement/deletion exercise.
