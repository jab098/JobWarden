# Task 10 Career Profile and Onboarding Review

**Branch:** `codex/task-10-career-profile`

**Base:** Task 9 merge `44a3580`

**Local implementation status:** complete

**Delivery status:** independent pull-request review, push, merge, local `main` update, and merge-commit verification pending

## Outcome

Task 10 implements the private career-profile model, bounded deterministic DOCX/PDF extraction, authenticated extraction runtime, optional schema-validated AI proposals, review repositories/actions, editorial onboarding UI, named searches, evidence/suggestion decisions, deletion controls, retention, and operations/privacy guidance.

Real CV handling remains closed at two independent boundaries:

- the web repository always returns a disabled upload capability and the UI contains no file input; and
- `private.app_settings.career_cv_uploads_enabled` defaults false and blocks Storage insert/update, CV registration, and extraction claims. Task 10 exposes no setter.

The branch must not be described as `reviewed` or delivered until the ready pull request receives an independent full-range review, is merged to GitHub `main`, and the merge commit passes the same verification. Task 11 has not started.

## Acceptance mapping

| Outcome | Evidence |
| --- | --- |
| Flexible onboarding | Strict domain draft accepts any non-empty combination of CV reference, role family, industry/domain, user evidence, or keyword; empty drafts fail |
| Evidence-bound personalisation | Evidence stores normalised concept, label, category, origin, confidence, bounded excerpt/reference, proficiency, recency, and confirmation state; searches include confirmed evidence only |
| Separate seniority | Current and target seniority are separate throughout domain, database, repository, UI, and named searches |
| Owner-only private data | Six career tables and the AI counter force RLS; private Storage uses approved owner paths; administrators have no default profile/CV visibility |
| Safe file intake | DOCM/legacy/mismatched files, unsafe paths/relationships/entities/comments/namespaces/executable parts, oversized archives, encrypted/malformed/over-page PDFs, excessive text, and deadlines fail before proposal creation |
| Deterministic fallback | Explicit phrase rules emit offset-backed proposed evidence and evidence-backed inactive role suggestions without raw CV text |
| Optional AI ceiling | Default allowance zero; application-wide `0..25` daily reservation is globally locked and user-audited; one run/user; 60,000 input characters; 4,000 output tokens; 30 seconds; no retry/paid fallback |
| Explicit review | Successful completion materialises proposed evidence/suggestions; owners can confirm/exclude evidence and accept/dismiss suggestions; user-confirmed evidence cannot be overwritten by extraction |
| Retention/deletion | Raw structured proposals expire after 24 hours on an hourly job; Storage is removed before metadata; failed replacement restores the prior usable CV; direct profile-row deletion is denied |
| Real uploads disabled | UI, repository, Storage policies, registration RPC, and claim RPC all retain the closed gate |

## Full-range local review

A line-by-line review of the Task 10 range found and remediated these issues before the completion checkpoint:

1. proposed/rejected evidence could enter a named search;
2. adding a user skill could duplicate an extracted concept and make the draft invalid;
3. a post-claim persistence error used a runtime-only code that the durable run could not store;
4. DOCX comments and nested `w` namespace redefinitions could masquerade as visible evidence;
5. extraction conflict handling could demote explicit user-confirmed evidence;
6. the optional AI limit was per user rather than application-wide;
7. direct profile-table deletion could bypass Storage-first erasure; and
8. Storage/register/claim paths were not independently disabled behind a database-owned flag.

Regression coverage was added for each executable boundary. No known Critical, Important, or Minor local-review finding remains. This is a self-review result, not the required independent PR review.

## Verification evidence

Run from `/Users/jabed/Desktop/Jabed's Trash/Dev/JobWarden` on 2026-07-18:

- `pnpm install --frozen-lockfile` — dependency graph already current;
- `pnpm verify` — formatting, lint, all TypeScript checks, both Deno deployment graphs, guardrails, tests, and production build passed;
- workspace Vitest — 499 tests across 43 files passed;
- Edge Function Vitest — 27 ingestion tests and 17 career-extraction tests passed;
- `pnpm check:supabase` — ten migrations and eighteen forced-RLS tables passed the static verifier;
- `pnpm audit --prod --audit-level high` — no known vulnerabilities;
- `git diff --check` — clean;
- hydrated `/profile` browser checks at 1440 by 1000 and true 390 by 844 passed the desktop/mobile hierarchy, navigation, visible focus, no file input, no error overlay, and no horizontal document overflow; and
- the Task 10 staged and exact-range secret scans are required immediately around the final local commit.

The expected jsdom `HTMLCanvasElement.getContext()` warning appears during the accessibility suite; it does not fail a test and no canvas is used by the profile feature.

## Preserved pre-live blocker

Docker is unavailable on this development machine. `supabase db reset`, database lint against the local stack, and pgTAP files 007 through 010 have therefore not executed against real PostgreSQL/Supabase. The new pgTAP specification includes default-off activation, owner isolation, failed-replacement rollback, materialisation, explicit-evidence precedence, 24-hour expiry, cleanup privileges, and the globally locked AI ceiling.

This blocker does not reopen real CV upload. It is an explicit activation prerequisite in [Career Profile Data Operations](../operations/career-profile-data.md) and Task 16.
