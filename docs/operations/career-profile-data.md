# Career Profile Data Operations

**Applies to:** Task 10 career profiles, private CV documents, extraction proposals, evidence, suggestions, and named searches

**Live status:** implemented and fixture-tested, but real CV upload is disabled. Do not activate this path until the live authentication, approved-access, RLS, private Storage, deletion, retention, and Docker-backed pgTAP gates below have passed.

## Data path and boundaries

- An approved authenticated user owns every profile, CV metadata row, extraction run, evidence item, suggestion, and named search. RLS is forced on every public table and there is no administrator read override.
- `career-documents` is private, capped at 5 MiB, limited to DOCX/PDF MIME types, and isolates objects under the authenticated owner's UUID path.
- The private `career_cv_uploads_enabled` setting defaults false. Upload-intent creation, Storage insert, CV registration, and extraction claims all fail while it is false; there is no Storage UPDATE policy and Task 10 exposes no administrator or user setter.
- A durable `career_profile_generations` row is the shared owner mutex and erasure tombstone. Profile/search saves, evidence changes/pruning, extraction completion, upload intent/registration, CV cleanup, and full deletion lock it before mutable owner rows. Expected-generation checks reject queued stale work after deletion.
- A future upload must begin with a 15-minute owner-path intent bound to the current generation. The Storage INSERT policy and `register_cv_document` independently require the live intent/current generation; registration also requires the exact Storage object and consumes the intent.
- The Edge Function verifies the bearer-bound user, then uses only the server service client to claim, renew, and complete extraction. Each run has an unguessable token and renewable one-minute lease; completion must present the matching live token. Downloaded bytes must match the registered byte count and SHA-256 before parsing.
- The 55-second lifecycle deadline covers request streaming, claim, Storage download, parsing, optional AI, lease renewal, and finalisation. The request body is streamed and cancelled beyond 2,048 bytes when length is absent; truncated extraction fails visibly instead of persisting an incomplete proposal.
- Logs contain a correlation ID, counts, duration, model identifier, and a sanitised error code. They never contain a file name, object path, CV text, evidence excerpt, email, phone number, token, or provider response.
- Real files must never be used as repository fixtures. The local UI remains a labelled immutable fictional preview and exposes no file input.

## Safe replacement ordering

Use a new immutable object path for every upload. Never overwrite the current object in place.

1. Read one database snapshot, including its durable profile generation, and choose a new immutable path `career-documents/{authenticated-user-id}/{random-id}.{docx|pdf}`.
2. Call `begin_career_cv_upload(expected_generation, storage_path)` to create a 15-minute intent. A full deletion advances the generation and clears queued intents, so a stale upload cannot recreate profile data.
3. Upload the new object. The private Storage policy locks the same generation and requires the matching live intent; overwriting an existing object is unavailable.
4. Register exactly that path and its server-computed SHA-256, media type, byte count, safe display name, and expected generation with `register_cv_document`. Registration requires the exact Storage object and consumes the intent. It makes the new metadata current but retains the previous object and metadata as the rollback candidate.
5. Invoke `extract-career-profile` with the returned document ID and a deterministic 64-character hexadecimal idempotency key.
6. On success, the token/lease-fenced database completion locks the owner generation, atomically stores the bounded proposal, materialises reviewable evidence and suggestions, and marks the new document ready.
7. Only after step 6 succeeds, remove the previous inactive object from private Storage. Then call `purge_inactive_cv_document(document_id, expected_storage_path)` with the service role to remove its metadata and cascaded derived rows.
8. If extraction fails, fenced completion marks the new document failed and atomically restores the most recent usable previous document as current. Remove the failed inactive object from Storage before calling the same purge RPC. When there is no previous document, retain the failed current row long enough to show the sanitised failure and offer a deliberate retry or owner deletion.

The Storage deletion always happens before metadata deletion. If Storage removal fails, stop: retain metadata so the object remains discoverable for a later cleanup attempt. The purge RPC refuses to delete a current document and requires the exact expected path, preventing a stale cleanup job from deleting a replacement.

## User deletion

`Delete CV data` resolves the user's current metadata, removes that exact private Storage path, then calls `delete_current_cv` with both document ID and expected path. The database cascade removes extraction runs, CV-derived evidence, and suggestions.

`Delete full profile` derives the owner from the verified session, recursively lists the complete owner prefix in bounded, stable pages, includes nested directories and uploaded-but-unregistered objects, unions those paths with registered document metadata, and removes unique paths in bounded batches. It verifies the prefix is empty before calling `delete_career_profile_data`. The RPC independently rejects while any matching object remains, locks and advances the durable generation, deletes queued upload intents, and cascades profile metadata, extraction runs, evidence, suggestions, and named searches. The application-wide AI ledger is deliberately not user-owned and survives deletion. If listing, removal, or the post-removal inventory fails, structured deletion does not start.

Before live activation, exercise both controls with fictional local documents and prove that the bucket and every owner-scoped career-data surface—including upload intents and the durable generation tombstone—has the documented post-deletion state. Task 16 must add the complete user-data export and production erasure exercise.

## Retention and cleanup

- The original CV remains until the user deletes/replaces it or the owner executes an approved erasure request. JobWarden does not silently retain an overwritten inactive object after its replacement is ready.
- Raw structured extraction proposals expire 24 hours after successful completion. `jobwarden-career-proposal-expiry` runs hourly at minute 17 and clears the proposal while preserving counts, status, timestamps, and separately materialised review items.
- Evidence excerpts are limited to 280 characters and contact patterns are redacted before persistence. Confirmed/rejected evidence remains until CV or profile deletion because it is the user's reviewed personalisation record.
- Failed or replaced inactive objects are cleanup work, not durable history. The service removes the object first and then calls `purge_inactive_cv_document`; it never bulk-deletes by prefix or unresolved user input.
- The AI ledger contains only one UTC date, aggregate attempt count, and timestamp per day. It has no user/profile foreign key and survives user/profile deletion. No prompt, CV text, output, evidence excerpt, file name, object path, or user identifier enters the ledger.

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

The private owner-controlled `career_ai_daily_allowance` is checked by the service-only claim RPC and defaults to zero. The database takes a global daily transaction lock before the atomic `career_ai_daily_usage` reservation, so simultaneous users cannot exceed the application-wide allowance. The durable ledger is intentionally not attributable to an individual and cannot be erased to regain quota. Invalid schema, timeout, missing credentials, quota exhaustion, or provider failure discards the optional result and preserves deterministic evidence. There is no retry, paid overage, alternate paid provider, or silent model switch.

## Evidence and search authority

- Authenticated callers cannot directly INSERT or UPDATE profile/search rows or directly update `confirmation_state`. Owner-derived RPCs are the supported mutation boundary.
- `save_search_profile` locks and compares the expected profile generation, rejects duplicate skill/responsibility arrays, and accepts those concepts only when matching confirmed evidence belongs to the verified owner.
- An evidence confirmation/category/concept change or deletion transactionally prunes no-longer-confirmed concepts from that owner's searches. If an evidence-only search loses its last valid signal, it is removed rather than retaining an invalid match input.
- Search rows are ordered by `created_at, id`; the client edits an explicit selected UUID, uses the returned UUID for a newly created search, and clears selection/controlled values if a later server refresh removes that row.

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
5. confirm/exclude decisions affect only the caller's proposed evidence, crafted searches cannot reference unconfirmed/foreign evidence, and later evidence removal prunes saved searches;
6. concurrent first-search saves and search-save/evidence-delete paths serialize on the owner generation without losing updates or retaining stale evidence;
7. raw proposals disappear after the 24-hour expiry job while review items remain; and
8. CV-only and full-profile deletion leave no registered, unregistered, flat, or nested object and no derived personal data.

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
