# Task 10 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable finding from the independent `44a3580..c4536b6` review without enabling real CV uploads.

**Architecture:** Keep upload activation default-off while strengthening the future path at three boundaries: service-only fenced extraction and a durable global AI ledger, incremental and visibility-aware document parsing, and owner-derived evidence/deletion state. Each slice starts with a failing regression test, is committed separately, and receives a focused review before the next slice.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, TypeScript, Deno Edge Functions, React/Next.js, Vitest, pgTAP, `fflate`, `pdfjs-dist`, and a namespace-aware XML parser if required.

## Global Constraints

- Real CV upload stays disabled in the web and by the database setting until live approved authentication, private Storage/RLS/deletion exercises, and Docker-backed reset/pgTAP pass.
- RLS remains the final boundary; no caller-supplied user ID or evidence may become authority.
- AI usage defaults to zero, is application-wide, is capped at 25 attempts per UTC day, survives user/profile deletion, and has no automatic paid fallback.
- DOCX/PDF input is untrusted; enforce 5 MiB input, 20 MiB actual DOCX expansion, 2,000 ZIP entries, 250 PDF pages, 100,000 visible characters, and an abortable 20-second extraction deadline.
- CV text, paths, names, contact details, raw proposals, and provider bodies never enter logs, analytics, errors, URLs, emails, or fixtures.
- Use fictional fixtures only; applications remain manual links; do not add pricing, payments, subscriptions, trials, or auto-apply.

---

### Task 1: Authoritative AI budget and fenced extraction runtime

**Files:**
- Modify: `supabase/migrations/202607180005_career_extraction_runtime.sql`
- Modify: `supabase/migrations/202607180007_career_profile_review_and_retention.sql`
- Modify: `supabase/tests/008_career_extraction_runtime.sql`
- Modify: `supabase/tests/010_career_profile_review_and_retention.sql`
- Modify: `supabase/functions/extract-career-profile/contracts.ts`
- Modify: `supabase/functions/extract-career-profile/repository.ts`
- Modify: `supabase/functions/extract-career-profile/repository.test.ts`
- Modify: `supabase/functions/extract-career-profile/handler.ts`
- Modify: `supabase/functions/extract-career-profile/handler.test.ts`
- Modify: `scripts/verify-supabase-foundation.test.ts`

**Interfaces:**
- `claim_career_profile_extraction(target_user_id uuid, target_document_id uuid, idempotency_key_value text)` is service-role-only and returns `claim_token`, `lease_expires_at`, and the registered `sha256_hex`.
- `renew_career_profile_extraction_lease(target_run_id uuid, target_claim_token uuid)` is service-role-only and renews only the matching running claim.
- `complete_career_profile_extraction(..., target_claim_token uuid, ...)` completes only the matching running claim; an expired or superseded token cannot mutate a run or document.
- `career_ai_daily_usage` uses a durable, non-user-owned UTC-date aggregate and reads its limit from a private owner-controlled setting with default `0` and check `0..25`.

- [ ] **Step 1: Add failing SQL/static and repository tests**

  Assert that authenticated callers cannot execute claim/renew/complete, the claim has no caller allowance, deleting a profile cannot delete the daily aggregate, stale same-key claims are recovered before idempotent return, replacement recovery commits, every completion is token-fenced, the repository claims via the service client, and downloaded bytes must match both size and SHA-256.

- [ ] **Step 2: Run the focused tests and confirm RED**

  Run: `pnpm vitest run scripts/verify-supabase-foundation.test.ts --config vitest.workspace.ts && pnpm vitest run --config supabase/functions/extract-career-profile/vitest.config.ts`

  Expected: failures for the caller allowance/service-client contract, missing lease token, non-durable ledger, and missing digest verification.

- [ ] **Step 3: Implement the minimal database and repository changes**

  Derive the approved user in the Edge Function from the verified bearer client, pass that derived UUID only through the service-role repository, store an unguessable claim token and lease expiry, renew before long phases, and require the token for finalisation. Recover stale work in a transaction that returns a sanitised stale result rather than raising after the replacement trigger. Make the AI limit owner-controlled and the aggregate independent of deletable profile rows.

- [ ] **Step 4: Bound the complete request lifecycle**

  Stream request bodies and cancel after 2,048 bytes when `Content-Length` is absent; apply one overall deadline covering claim, Storage download, parsing, optional AI, lease renewal, and finalisation; reject truncated extraction as a visible bounded failure rather than persisting an apparently complete proposal.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `pnpm vitest run scripts/verify-supabase-foundation.test.ts --config vitest.workspace.ts && pnpm vitest run --config supabase/functions/extract-career-profile/vitest.config.ts && pnpm check:supabase && pnpm check:deno`

  Expected: all selected tests and both static/deployment-graph checks pass.

- [ ] **Step 6: Commit**

  Commit message: `fix: fence career extraction runtime`

### Task 2: Bounded and visibility-aware DOCX/PDF extraction

**Files:**
- Modify: `packages/profile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/profile/src/docx.ts`
- Modify: `packages/profile/src/docx.test.ts`
- Modify: `packages/profile/src/pdf.ts`
- Modify: `packages/profile/src/pdf.test.ts`
- Modify: `packages/profile/src/file-gate.ts`
- Modify: `packages/profile/src/file-gate.test.ts`

**Interfaces:**
- `extractDocxText` validates matching central/local ZIP metadata, rejects overlapping byte ranges, counts actual emitted bytes, and aborts inflation while the 20 MiB or 20-second ceiling is crossed.
- DOCX XML is namespace-aware and accepts text only inside a complete `w:document/w:body`; deleted, moved-from, hidden, instruction, external, or out-of-body text is rejected or excluded.
- `extractPdfText` owns the `PDFDocumentLoadingTask`, destroys it on timeout/failure, consumes `streamTextContent()` incrementally, cancels at bounds, excludes invalid/off-page geometry, and rejects invisible text-rendering modes before evidence creation.

- [ ] **Step 1: Add failing hostile-fixture tests**

  Add fictional tests for forged stored-size metadata, overlapping ZIP ranges, actual output beyond 20 MiB, truncated/misnested WordprocessingML, hidden style and moved-from text, a compressed PDF text bomb, incremental cancellation, off-page text, and invisible rendering mode.

- [ ] **Step 2: Run the profile package tests and confirm RED**

  Run: `pnpm --filter @jobwarden/profile test`

  Expected: the new hostile fixtures fail because current extraction trusts metadata, materialises full PDF text, and regex-scans document XML.

- [ ] **Step 3: Implement bounded ZIP and strict WordprocessingML parsing**

  Decode selected entries one at a time with output callbacks that update a shared actual-byte counter and deadline. Reject encrypted/data-descriptor ambiguity, local/central mismatches, duplicate or overlapping ranges, unsupported compression, and any output after a limit. Parse XML with namespace and stack state; never treat a regex match as document structure.

- [ ] **Step 4: Implement incremental PDF extraction and visibility checks**

  Retain and destroy the loading task/document on every exit, read text-content chunks through the stream reader, enforce the remaining character/deadline budget before concatenation, cancel immediately at a limit, and reject pages whose rendering instructions contain invisible text or whose items have non-finite/non-positive/off-page geometry.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `pnpm --filter @jobwarden/profile test && pnpm --filter @jobwarden/profile typecheck && pnpm check:deno`

  Expected: profile tests, package typecheck, and Edge deployment graph pass.

- [ ] **Step 6: Commit**

  Commit message: `fix: harden CV document extraction`

### Task 3: Owner-derived evidence and complete deletion state

**Files:**
- Modify: `supabase/migrations/202607180004_career_profiles.sql`
- Modify: `supabase/migrations/202607180006_career_profile_workflow.sql`
- Modify: `supabase/migrations/202607180007_career_profile_review_and_retention.sql`
- Modify: `supabase/tests/007_career_profiles.sql`
- Modify: `supabase/tests/009_career_profile_workflow.sql`
- Modify: `supabase/tests/010_career_profile_review_and_retention.sql`
- Modify: `apps/web/src/lib/profile/repository.ts`
- Modify: `apps/web/src/lib/profile/supabase-profile.ts`
- Modify: `apps/web/src/lib/profile/supabase-profile.test.ts`
- Modify: `apps/web/src/lib/profile/development-profile.ts`
- Modify: `apps/web/src/lib/profile/development-profile.test.ts`
- Modify: `apps/web/src/components/profile/profile-onboarding.tsx`
- Modify: `apps/web/src/components/profile/profile-suggestion-list.tsx`
- Modify: `apps/web/src/components/profile/profile-ui.test.tsx`
- Modify: `apps/web/src/components/profile/search-profile-form.tsx`
- Modify: `apps/web/src/app/(protected)/profile/page.tsx`
- Modify: `apps/web/src/app/(protected)/profile/actions.ts`
- Modify: `apps/web/src/app/(protected)/profile/actions.test.ts`
- Modify: `scripts/verify-supabase-foundation.mjs`
- Modify: `scripts/verify-supabase-foundation.test.ts`

**Interfaces:**
- Search-profile upsert accepts user preferences but the database intersects/validates skill and responsibility concepts against that owner's `confirmed` evidence of the matching kind.
- Full-profile deletion inventories every authenticated owner object in `career-documents`, including uploaded-but-unregistered objects, removes Storage first, and only then calls the database delete RPC.
- Direct deletion RPCs fail while any matching Storage object remains, and the immutable owner path has no Storage UPDATE policy.
- Authenticated callers cannot bypass the proposed-only evidence decision RPC by directly updating `confirmation_state`.
- The onboarding component remounts or explicitly resets when the snapshot identity is deleted; deleted personal data cannot remain visible or be resubmitted from stale state.
- Search selection is ordered by `created_at, id` and edits an explicit stable search ID rather than an arbitrary first row.
- Accepted/rejected suggestions remain visibly labelled instead of disappearing, so acceptance is an explicit durable state for later deterministic consumers.

- [x] **Step 1: Add failing database, repository, and rerender tests**

  Prove invented/unconfirmed evidence is rejected, direct evidence-state UPDATE is unavailable, Storage object UPDATE is unavailable, direct deletion RPCs reject while a Storage row remains, owner Storage listing is paginated and includes unregistered objects, database deletion is not called after any Storage failure, deletion changes the component identity and clears all controlled state, decided suggestions stay visible, and multiple searches choose deterministically.

- [x] **Step 2: Run focused tests and confirm RED**

  Run: `pnpm --filter @jobwarden/web test && pnpm check:supabase`

  Expected: the new evidence, orphan-object, stale-state, and deterministic-selection tests fail on the current code.

- [x] **Step 3: Implement server/database authority and Storage-first deletion**

  Enforce confirmed evidence in the RPC even for crafted clients. Remove direct authenticated evidence-state and Storage-object-update authority. Require object absence at the database deletion boundary. List the caller's owner prefix in bounded pages, union those paths with registered documents, remove all unique paths, and fail closed before structured deletion when listing or removal is incomplete.

- [x] **Step 4: Reset client state and make search selection explicit**

  Key the onboarding subtree by snapshot identity/version after deletion, clear every personal field when the snapshot becomes empty, keep decided suggestions visible with semantic state labels, order repository rows stably, and submit/update an explicit selected search ID.

- [x] **Step 5: Run focused tests and confirm GREEN**

  Run: `pnpm --filter @jobwarden/web test && pnpm --filter @jobwarden/web typecheck && pnpm --filter @jobwarden/web lint && pnpm check:supabase`

  Expected: all selected web and static Supabase checks pass.

- [x] **Step 6: Commit**

  Commit message: `fix: enforce career profile ownership boundaries`

### Task 4: Review record and release gate

**Files:**
- Modify: `docs/reviews/task-10-career-profile-onboarding.md`
- Modify: `docs/operations/career-profile-data.md`
- Modify: `docs/privacy/data-inventory.md`
- Modify: `docs/project-status.md`

- [ ] **Step 1: Update operational truth**

  Record the durable application-wide AI ledger, service-only lease fencing, parser rejection/cancellation behavior, orphan Storage inventory, confirmed-evidence enforcement, and the unchanged default-off activation gate. Keep Docker/pgTAP and live Storage/auth/deletion as explicit pre-live blockers.

- [ ] **Step 2: Run the complete release gate**

  Run: `pnpm install --frozen-lockfile && pnpm verify && pnpm check:supabase && pnpm audit --prod --audit-level high && git diff --check origin/main...HEAD && gitleaks git --no-banner --redact --log-opts='origin/main..HEAD'`

  Expected: every available check passes; Docker-dependent checks remain accurately unclaimed.

- [ ] **Step 3: Request an independent whole-branch re-review**

  Review exact range `44a3580..HEAD`. Fix every Critical or Important finding and re-review until clean. Do not mark Task 10 reviewed before PR merge and local merge-commit verification.

- [ ] **Step 4: Commit**

  Commit message: `docs: record Task 10 review remediation`
