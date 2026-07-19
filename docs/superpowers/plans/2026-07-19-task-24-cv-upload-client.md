# Task 24 — CV upload client

## Why

Every server-side piece of CV upload has existed since Task 10 and none of it has ever been called. `begin_career_cv_upload`, `career_cv_upload_intent_allows`, `register_cv_document`, and `delete_current_cv` are implemented, tested in pgTAP, and unreachable: nothing in `apps/web/src` invokes them and no file input exists anywhere in the product. Onboarding tells the user "Uploading is not open yet in this build."

The consequence is not cosmetic. JobWarden's stated premise is evidence-bound matching, and every real user currently takes the aspiration path, so there is no evidence to bind to. Task 15 tailoring runs against a DOCX generated in code. This task closes the gap between the product's premise and what a user can actually do.

## Constraints that shape the design

- The Storage insert policy is `to authenticated` and compares `(storage.foldername(name))[1]` to `auth.uid()::text`. A server-side upload under `JOBWARDEN_DEV_ACCESS_BYPASS` has no `auth.uid()`, so it cannot satisfy the policy. **The upload is necessarily browser-direct with a real session.**
- Authentication activation is deferred (owner decision, 2026-07-17). The client must therefore be complete and correct but inert until Task 21, exactly as the Reed adapter is complete and inert until its live gate.
- `career_cv_uploads_enabled()` reads `private.app_settings` and defaults to `false`. It is the server-controlled switch, and the client must obey it rather than assume it.
- CV bytes and extracted text are private user data. No file name, no extracted text, and no storage path may reach logs, analytics, errors, URLs, or emails.

## Design

The upload is a four-step handshake the browser drives:

1. `begin_career_cv_upload(generation, path)` records a 15-minute intent fencing the exact path.
2. `storage.from("career-documents").upload(path, file)` — the RLS policy re-checks the intent via `career_cv_upload_intent_allows`.
3. `register_cv_document(generation, path, name, kind, mediaType, bytes, sha256)` returns the document id.
4. `functions.invoke("extract-career-profile", { cvDocumentId, idempotencyKey })` starts extraction.

The SHA-256 doubles as the extraction idempotency key: the function's schema requires `/^[a-f0-9]{64}$/`, which is exactly a hex digest. Re-uploading identical bytes is therefore naturally idempotent at the extraction boundary, at no extra cost.

Orchestration lives in a pure module (`cv-upload.ts`) that takes a narrow client port, so every branch is unit-testable without a browser or a Supabase project. The React component is thin wiring over it.

### Capability gate

`ProfileUploadCapability` becomes a discriminated union. Three states, derived not assumed:

| Condition                                        | Capability                                       |
| ------------------------------------------------ | ------------------------------------------------ |
| fixtures/development repository                  | `{ enabled: false, reason: "fictional_preview" }` |
| Supabase, `career_cv_uploads_enabled()` is false  | `{ enabled: false, reason: "uploads_disabled" }`  |
| Supabase, `career_cv_uploads_enabled()` is true   | `{ enabled: true }`                               |

The existing `live_auth_and_storage_verification_required` reason is retained for the no-session case. The snapshot RPC does not currently return the flag, so a migration adds `uploadsEnabled` to its JSON payload. That is the only schema change; no new table, column, policy, or grant.

## Files

| File                                                       | Change                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `supabase/migrations/202607200001_cv_upload_client.sql`      | new — add `uploadsEnabled` to the snapshot payload      |
| `apps/web/src/lib/profile/types.ts`                          | capability union, `uploads_disabled` reason            |
| `apps/web/src/lib/profile/cv-upload.ts`                      | new — pure orchestration over a narrow client port     |
| `apps/web/src/lib/profile/cv-upload.test.ts`                 | new — validation, ordering, failure, redaction         |
| `apps/web/src/lib/profile/supabase-profile.ts`               | derive capability from the flag                        |
| `apps/web/src/components/profile/cv-upload-card.tsx`         | new — file input, states, errors                       |
| `apps/web/src/components/profile/profile-onboarding.tsx`     | mount the card above the delete controls               |
| `apps/web/src/components/onboarding/onboarding-flow.tsx`     | replace the "not open yet" copy with the card          |
| `supabase/tests/011_cv_upload_snapshot.sql`                  | new — assert the snapshot exposes the flag             |

## Validation rules

Enforced client-side before any network call, and independently by the bucket and the RPCs:

- extension and media type in {`.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.pdf` → `application/pdf`}; a mismatch between extension and sniffed type is rejected;
- size in (0, 5 MiB], matching the bucket's `file_size_limit`;
- path is `{userId}/{uuid}.{ext}` — satisfies the RPC's 38–500 character bound and its `split_part(path,'/',1) = auth.uid()` check;
- the file name shown back to the user is the browser's, never echoed into an error string that could be logged.

## Failing tests first

1. rejects a `.txt` file, a zero-byte file, and a 6 MiB file before any client call
2. rejects a `.pdf` extension whose media type is the DOCX type
3. calls begin → upload → register → extract in that order, and stops at the first failure
4. does not call `register_cv_document` when the Storage upload fails
5. surfaces a stale-generation error (`40001`) as a retryable outcome, not a permanent one
6. surfaces `uploads disabled` (`42501`) as a distinct outcome
7. never includes the file name, storage path, or any file bytes in a thrown error message
8. derives `enabled: true` only when the snapshot reports the flag true

## Verification

`pnpm verify` — format, lint, typecheck, deno check, full vitest, guardrails, build. Migrations and pgTAP are written and type-reviewed but not executed; no live Supabase exists (owner-confirmed bar for this programme).

## Operational setup

None for this task. At Task 21 activation the owner sets `private.app_settings.career_cv_uploads_enabled = true`; until then the card renders its disabled explanation and no upload path is reachable.

## Rollback

Revert the merge. The migration only widens a JSON payload with an additional key, so an older client ignoring `uploadsEnabled` keeps working against the newer database.
