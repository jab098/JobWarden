# Task 10 Career Profile and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an approved user build and review an owner-only career profile from role, industry, skill, keyword, or safely extracted CV evidence while keeping real CV upload disabled until live authentication and Storage verification.

**Architecture:** Add strict career-profile contracts to the shared domain package, then persist profile evidence, inactive suggestions, named searches, CV metadata, and extraction runs behind owner-only Supabase RLS. A separate pure extraction package validates bytes before parsing and produces an untrusted versioned proposal; the web repository owns persistence and the UI requires explicit review. Local development uses immutable fictional fixtures and never uploads a file.

**Tech Stack:** TypeScript, Zod, Vitest, PostgreSQL/pgTAP, Supabase private Storage and Edge Functions, Next.js App Router, existing shadcn primitives, `fflate` for bounded DOCX archive handling, and `unpdf` for bounded PDF text extraction.

## Global Constraints

- A user may onboard with any non-empty combination of CV, target role family, industry/domain, skill, or keyword.
- Current and target seniority are separate. Suggestions never silently change either.
- Evidence and preferences remain separate. Machine suggestions are inactive until accepted.
- Real CVs, contact details, extracted text, and realistic personal fixtures never enter Git, logs, analytics, Sentry, URLs, email, or audit metadata.
- Accept only DOCX and PDF. Reject DOCM, mismatched extension/MIME/magic, unsafe archive paths, excessive expansion, external OOXML relationships, encrypted PDFs, and executable content before extraction.
- AI output is optional untrusted input. Zod validation, deterministic evidence references, hard free-tier ceilings, and deterministic fallback are mandatory.
- RLS is the final boundary for CV objects, evidence, profiles, searches, and extraction runs.
- Local development stays fictional and fail-closed outside exact development bypass mode.
- Real upload remains unavailable until live authentication, private Storage, deletion, and Docker-backed pgTAP are verified.
- No pricing, payments, subscriptions, auto-apply, Pinecone, Upstash, Clerk, paid model dependency, or automatic paid fallback.

---

### Task 1: Career profile domain contracts

**Files:**
- Create: `packages/domain/src/career-profile.ts`
- Create: `packages/domain/src/career-profile.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces `careerEvidenceItemSchema`, `careerProfileDraftSchema`, `profileSuggestionSchema`, `namedSearchProfileDraftSchema`, `parseCareerProfileDraft(input)`, and inferred types.
- Rejects a draft without a CV reference, target role family, industry/domain, skill, or keyword.

- [x] Write failing tests for evidence bounds, distinct seniority, inactive suggestions, strict objects, duplicate concepts, and minimum onboarding signals.
- [x] Run `pnpm --filter @jobwarden/domain test -- career-profile.test.ts`; expect failure because the module does not exist.
- [x] Implement strict Zod contracts. Use trimmed bounded strings, unique normalised concepts, confidence `0..1`, ISO recency dates, 280-character maximum excerpts, and this exact seniority vocabulary:

```ts
export const seniorityLevels = [
  "entry", "junior", "mid", "senior", "lead", "principal",
  "head", "director", "executive", "unspecified",
] as const;

export function parseCareerProfileDraft(input: unknown): CareerProfileDraft {
  return careerProfileDraftSchema.parse(input);
}
```

- [x] Rerun the focused tests and `pnpm --filter @jobwarden/domain typecheck`; expect green.
- [x] Commit `feat: define career profile contracts`.

### Task 2: Owner-only data and CV metadata

**Files:**
- Create: `supabase/migrations/202607180004_career_profiles.sql`
- Create: `supabase/tests/007_career_profiles.sql`
- Modify: `scripts/verify-supabase-foundation.mjs`
- Modify: `scripts/verify-supabase-foundation.test.ts`

**Interfaces:**
- Produces `career_profiles`, `career_evidence_items`, `profile_suggestions`, `search_profiles`, `cv_documents`, and `cv_extraction_runs`.
- Produces private bucket `career-documents`; the first object-path segment must equal `auth.uid()`.
- Service-role extraction writes proposals; authenticated users may access only their rows while approved.

- [x] Add failing verifier tests for migration 7, six force-RLS tables, private Storage, owner policies, suggestion states, one active CV per user, and bounded extraction status/error codes.
- [x] Run `pnpm vitest run scripts/verify-supabase-foundation.test.ts`; expect every new fragment to be missing.
- [x] Implement tables, checks, indexes, grants, and policies. The root profile starts with:

```sql
create table public.career_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_seniority text not null default 'unspecified',
  target_seniority text not null default 'unspecified',
  explore_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.career_profiles enable row level security;
alter table public.career_profiles force row level security;
```

- [x] Add pgTAP tests for owner isolation, administrator denial by default, service extraction, suggestion acceptance, CV replacement, and cascading deletion.
- [x] Run `pnpm check:supabase`, match `plan(N)` to exact assertions, and run `git diff --check`; expect green. Real PostgreSQL execution remains part of the existing Docker-backed pre-live gate.
- [x] Commit `feat: add private career profile storage`.

### Task 3: Safe deterministic CV intake

**Progress (2026-07-18):** Complete. The package now has a strict pre-parser file gate, sanitised error vocabulary, bounded DOCX/PDF extraction, and a deterministic evidence proposal covered by fictional in-memory tests. DOCX archive metadata is checked before selected parts are inflated with `fflate`; PDF parsing uses `unpdf` behind encryption, page, character, and deadline bounds. Real CV upload remains disabled.

**Files:**
- Create: `packages/profile/package.json`
- Create: `packages/profile/tsconfig.json`
- Create: `packages/profile/vitest.config.ts`
- Create: `packages/profile/src/file-gate.ts`
- Create: `packages/profile/src/file-gate.test.ts`
- Create: `packages/profile/src/docx.ts`
- Create: `packages/profile/src/docx.test.ts`
- Create: `packages/profile/src/pdf.ts`
- Create: `packages/profile/src/pdf.test.ts`
- Create: `packages/profile/src/proposal.ts`
- Create: `packages/profile/src/proposal.test.ts`
- Create: `packages/profile/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `validateCvFile(input): ValidatedCvFile`, `extractCvText(file): Promise<ExtractedCvText>`, and `createDeterministicProfileProposal(text): ProfileProposal`.
- Limits are 5 MiB input, 20 MiB total DOCX expansion, 2,000 archive entries, 250 PDF pages, 100,000 extracted characters, and 20 seconds.

- [x] Write failing in-memory fictional tests for DOCM, MIME/extension/magic mismatch, unsafe or duplicate ZIP paths, expansion limits, external relationships, encrypted PDF, page limits, and text truncation.
- [x] Run `pnpm --filter @jobwarden/profile test`; expect failure because implementation is absent.
- [x] Implement validation before parsing with these exported limits:

```ts
export const cvFileLimits = {
  inputBytes: 5 * 1024 * 1024,
  uncompressedBytes: 20 * 1024 * 1024,
  archiveEntries: 2_000,
  pdfPages: 250,
  extractedCharacters: 100_000,
  timeoutMilliseconds: 20_000,
} as const;
```

- [x] Use `fflate` only after archive checks. Read approved internal DOCX relationships only. Use `unpdf` behind page/timeout bounds. Return evidence offsets without logging bytes or text.
- [x] Run package tests and typecheck; expect green. Commit `feat: add bounded CV extraction`.

### Task 4: Authenticated extraction runtime

**Files:**
- Create: `supabase/functions/extract-career-profile/contracts.ts`
- Create: `supabase/functions/extract-career-profile/errors.ts`
- Create: `supabase/functions/extract-career-profile/repository.ts`
- Create: `supabase/functions/extract-career-profile/repository.test.ts`
- Create: `supabase/functions/extract-career-profile/handler.ts`
- Create: `supabase/functions/extract-career-profile/handler.test.ts`
- Create: `supabase/functions/extract-career-profile/index.ts`
- Create: `supabase/functions/extract-career-profile/deno.json`
- Create: `supabase/functions/extract-career-profile/vitest.config.ts`
- Modify: `supabase/functions/tsconfig.json`

**Interfaces:**
- Accepts an authenticated owner `cvDocumentId`, fetches bytes from private Storage, and persists a deterministic proposal.
- Optional Workers AI is capped at one call, 60,000 input characters, 4,000 output tokens, 30 seconds, one concurrent request per user, and a configurable daily allowance defaulting to zero.
- Logs only correlation ID, counts, duration, model identifier, and sanitised error code.

- [ ] Write failing tests for unauthenticated/wrong-owner access, missing object, unsafe file, deterministic success, AI disabled/quota/schema failure/timeout, idempotency, and redacted logs.
- [ ] Run the new function tests; expect missing runtime failures.
- [ ] Implement deterministic-first extraction. Parse any model result with `profileSuggestionSchema.safeParse`; discard invalid AI output without discarding deterministic evidence.
- [ ] Run all function tests, function typecheck, and Deno graph; expect green.
- [ ] Commit `feat: add career profile extraction runtime`.

### Task 5: Profile repositories and fictional workflow

**Files:**
- Create: `apps/web/src/lib/profile/types.ts`
- Create: `apps/web/src/lib/profile/repository.ts`
- Create: `apps/web/src/lib/profile/supabase-profile.ts`
- Create: `apps/web/src/lib/profile/supabase-profile.test.ts`
- Create: `apps/web/src/lib/profile/development-profile.ts`
- Create: `apps/web/src/lib/profile/development-profile.test.ts`
- Create: `apps/web/src/lib/profile/get-repository.ts`
- Create: `apps/web/src/lib/profile/get-repository.test.ts`
- Create: `apps/web/src/app/(protected)/profile/actions.ts`
- Create: `apps/web/src/app/(protected)/profile/actions.test.ts`

**Interfaces:**
- Produces `getSnapshot`, `saveDraft`, `acceptSuggestion`, `rejectSuggestion`, `deleteCv`, and `deleteProfileData`.
- Supabase derives user identity from the cookie-bound client and RLS. Development returns immutable fictional analytics-implementation evidence and rejects mutation/file operations.

- [ ] Write failing repository, action-origin, actor-derivation, and development fail-closed tests.
- [ ] Run focused tests; expect missing module failures.
- [ ] Implement the minimal caller-bound repositories and fictional read-only repository.
- [ ] Run focused tests and web typecheck; expect green.
- [ ] Commit `feat: add career profile repositories`.

### Task 6: Editorial onboarding and review UI

**Files:**
- Create: `apps/web/src/app/(protected)/profile/page.tsx`
- Create: `apps/web/src/app/(protected)/profile/loading.tsx`
- Create: `apps/web/src/app/(protected)/profile/error.tsx`
- Create: `apps/web/src/components/profile/profile-onboarding.tsx`
- Create: `apps/web/src/components/profile/profile-evidence-list.tsx`
- Create: `apps/web/src/components/profile/profile-suggestion-list.tsx`
- Create: `apps/web/src/components/profile/search-profile-form.tsx`
- Create: `apps/web/src/components/profile/profile-ui.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/mobile-navigation.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- `/profile` handles role, industry/domain, skill, keyword, current/target seniority, evidence/suggestion review, and named-search creation.
- Fictional mode shows the designed flow but labels upload unavailable and performs no mutation. Production upload renders only from a server-derived live-private-Storage capability.

- [ ] Read UI direction and load web-artifacts-builder, shadcn, and React review skills.
- [ ] Write failing responsive interaction and axe tests for all designed states.
- [ ] Implement the existing warm editorial language with one mobile/desktop hierarchy and no dashboard-card clutter.
- [ ] Verify keyboard flow, true 390 px and 1440 px layouts, long tokens, loading, empty, incomplete, and error states.
- [ ] Commit `feat: add career profile onboarding`.

### Task 7: Deletion, operations, review, and delivery

**Files:**
- Create: `docs/operations/career-profile-data.md`
- Create: `docs/reviews/task-10-career-profile-onboarding.md`
- Modify: `docs/architecture/free-tier-services.md`
- Modify: `docs/project-status.md`
- Modify: `docs/product/roadmap.md`
- Modify: `docs/privacy/data-inventory.md`

- [ ] Document and verify replace/delete ordering, failed extraction cleanup, 24-hour unsaved-proposal expiry, AI counters, incidents, and live activation.
- [ ] Run frozen install, formatting, lint, all typechecks, Deno graph, all tests, guardrails, Supabase checks, production build, audits, diff check, and exact-range Gitleaks.
- [ ] Run real `supabase db reset` and pgTAP when Docker is available; otherwise preserve the explicit pre-live blocker.
- [ ] Request independent full-range review and remediate every Critical, Important, and Minor finding.
- [ ] Rebase this stacked branch onto the GitHub Task 9 merge, publish a ready PR, merge to `main`, update local `main`, and rerun verification.

## Self-review

- Every approved Task 10 acceptance outcome maps to a task above.
- Real data remains disabled despite the production code path.
- Interfaces stay consistent across domain, persistence, extraction, repository, and UI.
- Task 11 receives confirmed evidence and enabled named searches without Task 10 implementing scores.
