# Task 11 Target Feed and Explainable Fit Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match indexed jobs against enabled named search profiles with the approved deterministic 45/20/15/10/10 formula and make the explainable Target Feed the primary jobs experience, with save/dismiss/considering decisions, without losing broad search and filters.

**Architecture:** A pure deterministic scoring module in `@jobwarden/domain` (eligibility gate first, then component scoring with a full explanation payload); one new owner-only decisions table plus RPC in migration 11 with forced RLS and pgTAP; a server-side target-feed repository in the web app that reuses the existing profile snapshot and jobs catalogue with SQL pushdown of cheap hard filters and bounded in-memory scoring; and a Target-Feed-first `/jobs` experience that keeps the existing broad list URL-backed. No AI participates in this path, so deterministic matches can never be hidden by model unavailability.

**Tech Stack:** TypeScript, Zod, Next.js App Router, Supabase Postgres/RLS/RPC, Vitest, Tailwind, Base UI primitives already in `apps/web/src/components/ui`.

## Global Constraints

- UK-only: jobs already carry `ukEligibilityEvidence` (min 1) and `countryCode: "GB"`; never score a job without it.
- Matching is deterministic and evidence-bound: AI must not produce or adjust the final score; a role cannot receive credit for evidence absent from both the job and the user profile.
- Salary is a filter and a visible decision reason, never a score booster.
- Unknown (compensation, IR35, workplace, working time, seniority) is a distinct state, never a negative inference.
- No payments/pricing UI, no auto-apply, manual application links only.
- Fictional fixtures only; no real CV or personal data; no CV text in logs or errors.
- Free-tier-first: no new paid dependencies; feed computation is bounded (candidate cap per refresh).
- Real CV upload stays disabled; nothing in this task touches that boundary.
- Before UI work read `docs/design/ui-direction.md` (updated in Task 4 Step 1) and load `anthropic-skills:web-artifacts-builder` guidance; verify in a real browser at desktop and 390 px widths.
- After each task: run the focused tests plus `corepack pnpm --filter <package> typecheck`; the full gate runs in Task 5.

---

### Task 1: Deterministic target-feed scoring engine (domain)

**Files:**
- Create: `packages/domain/src/target-feed.ts`
- Create: `packages/domain/src/target-feed.test.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./target-feed.ts";`)

**Interfaces:**
- Consumes: `NamedSearchProfileDraft`, `seniorityLevels`, `employmentTypes`, `workingTimes`, `workplaceTypes`, `ir35Statuses`, `compensationPeriods`, `compensationProvenances` from existing domain modules; `CareerEvidenceItem` (confirmed items only are passed in).
- Produces (exact contract later tasks rely on):

```ts
export interface TargetFeedJobInput {
  id: string;
  title: string;
  employer: string;
  descriptionText: string;
  location: string;
  employmentType: EmploymentType;
  workingTime: WorkingTime;
  workplaceType: WorkplaceType;
  ir35Status: Ir35Status;
  compensationMinimum: number | null;
  compensationMaximum: number | null;
  compensationPeriod: CompensationPeriod;
  compensationProvenance: CompensationProvenance;
  postedAt: string | null; // ISO
}

export type EligibilityExclusion =
  | { reason: "employment_type" | "working_time" | "workplace" | "ir35" | "location" | "excluded_term" | "recency" }
  | { reason: "compensation_below_minimum"; minimum: number }
  | { reason: "unknown_compensation_disallowed" };

export interface TargetFeedScoreComponent {
  key: "skills" | "responsibilities" | "seniority" | "industry" | "preference_fit";
  weight: 45 | 20 | 15 | 10;
  awarded: number; // integer 0..weight
  matched: readonly string[]; // user-facing labels that earned credit
  gaps: readonly string[]; // profile/evidence concepts the job text does not evidence
}

export interface TargetFeedExplanation {
  profileName: string;
  score: number; // integer 0..100, sum of awarded
  components: readonly TargetFeedScoreComponent[];
  matchedEvidence: readonly string[]; // labels of confirmed evidence items that contributed
  importantGaps: readonly string[]; // top gaps across components, max 6
  synonymCredits: readonly { term: string; evidenceLabel: string }[]; // title synonyms credited ONLY via confirmed evidence
  compensationTreatment:
    | { kind: "advertised" | "estimated"; withinPreference: boolean }
    | { kind: "unknown"; allowed: true };
}

export function applyEligibilityGate(
  job: TargetFeedJobInput,
  profile: NamedSearchProfileDraft,
  now: Date,
): { eligible: true } | { eligible: false; exclusions: readonly EligibilityExclusion[] };

export function scoreJobForProfile(
  job: TargetFeedJobInput,
  profile: NamedSearchProfileDraft,
  confirmedEvidence: readonly CareerEvidenceItem[],
  now: Date,
): TargetFeedExplanation; // caller must gate first; throws if called is fine to omit — gate result is separate by design
```

**Deterministic rules (implement exactly; every rule gets a test):**
- Gate (hard, in order): non-empty profile arrays act as allow-lists for `employmentType`, `workingTime`, `workplaceType`, `ir35Status` — a *known* job value outside the list excludes; an `unknown` job value never excludes (unknown is not negative). `ukLocations` non-empty: case-insensitive substring match of any entry against `job.location`, except any job with `workplaceType === "remote"` passes the location gate (remote UK roles are location-independent; UK eligibility is already guaranteed upstream). `excludeTerms`: case-insensitive whole-word match against title or description excludes. Recency: `postedAt` older than `recencyDays` excludes; `postedAt === null` does NOT exclude. Compensation: when `compensation.minimum` is set and job compensation is known (`provenance !== "unknown"`) and `job.compensationMaximum ?? job.compensationMinimum` (in the same period) is below the profile minimum with matching `compensation.period` (or job period `"unknown"` treated as unknown → not excluded), exclude with `compensation_below_minimum`. When job compensation provenance is `"unknown"` and `allowUnknown === false`, exclude with `unknown_compensation_disallowed`. Never convert between periods.
- Concept matching primitive: normalise to lower-case word sequences; a concept matches when its label or normalised concept appears as a whole-word phrase in `title + " " + descriptionText`.
- Skills (45): candidate set = union of `profile.skillConcepts` and confirmed evidence items with category `skill` or `tool` (deduplicated by normalised concept). Award `round(45 × matchedCount / candidateCount)`; empty candidate set awards 0. `matched` lists matched labels; `gaps` lists unmatched profile `skillConcepts` (evidence-only concepts the job lacks are not "gaps").
- Responsibilities (20): same mechanics with `profile.responsibilityConcepts` union confirmed `responsibility` evidence.
- Seniority (15): detect job seniority markers deterministically from title (word list per level, e.g. "graduate|junior" → junior … "head|director|vp" → director). No marker → award 10 (unknown neutral, not negative and not full). Marker equals `targetSeniority` → 15; adjacent level → 8; otherwise → 0.
- Industry/domain (10): if profile `industries` and `domains` are both empty → award 10 (unconstrained). Else fraction matched of their union, `round(10 × matched / total)`.
- Preference fit (10): five subcomponents worth 2 each for `employmentType`, `workingTime`, `workplaceType`, `ir35Status`, location: known job value matching a non-empty profile selection (or any value when selection empty) → 2; `unknown` job value → 1; location uses the same rule as the gate (empty selection or remote → 2 when known). Hard mismatches cannot occur post-gate.
- Synonym credit: an `includeTerms` entry that matches the job title counts toward nothing by itself; it appears in `synonymCredits` ONLY when a confirmed evidence item with category `responsibility` or `role_history` also matched this job (the roadmap's "documented role/responsibility evidence") — pair `{ term, evidenceLabel }` with the first such evidence label. Include terms never add score directly.
- Compensation: appears only in `compensationTreatment` (using job provenance and whether `job.compensationMinimum/Maximum` meet the profile range); it must not touch any `awarded` value.
- `importantGaps`: concatenate component `gaps` in component order, deduplicate, cap at 6.
- `score` = sum of the five `awarded` integers; assert ≤ 100.

- [ ] **Step 1: Write failing tests** covering: gate exclusion per reason incl. unknown-never-excludes and remote-location pass; salary never inflates (two identical jobs, one high salary one unknown → identical scores); synonym credit requires evidence; no credit for evidence absent from both sides (empty candidate set → 0 skills); each component's rule table incl. seniority neutral 10 and adjacent 8; industry unconstrained full award; preference-fit unknown = 1; determinism (same inputs twice → deep-equal); score bounds and integer-ness; explanation payload lists matched labels/gaps/compensation treatment. Use only fictional fixtures.
- [ ] **Step 2: Run** `corepack pnpm --filter @jobwarden/domain test` — expect the new file's tests to FAIL (module missing).
- [ ] **Step 3: Implement** `target-feed.ts` exactly to the contract above; export from `index.ts`.
- [ ] **Step 4: Run** domain tests and `corepack pnpm --filter @jobwarden/domain typecheck` — all green.
- [ ] **Step 5: Commit** `feat: add deterministic target-feed scoring engine`

### Task 2: Job decisions table, RPC, and erasure integration (database)

**Files:**
- Create: `supabase/migrations/202607190001_target_feed.sql`
- Create: `supabase/tests/012_target_feed.sql`
- Modify: `scripts/verify-supabase-foundation.mjs` (expected migration count 10→11; forced-RLS table count 20→21; add new table/RPC static assertions following the file's existing per-migration section pattern)
- Test: `scripts/verify-supabase-foundation.test.ts` (extend static expectations)

**Interfaces:**
- Produces: table `public.career_job_decisions` (`id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `job_id uuid not null references public.jobs(id) on delete cascade`, `decision text not null check (decision in ('saved','dismissed','considering'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `unique (owner_id, job_id)`), `force row level security`, owner-only `select` policy, NO direct insert/update/delete policies.
- RPC `public.decide_career_job(target_job_id uuid, target_decision text)` — `security definer`, derives owner from `auth.uid()` (raise `42501` when null), takes the existing per-owner generation mutex (`pg_advisory_xact_lock` on the same key derivation used by `save_named_search`/profile RPCs in migrations 6–7) before writing, validates `target_decision in ('saved','dismissed','considering','clear')`, upserts on `(owner_id, job_id)` updating `decision, updated_at`, and deletes the row when `'clear'`. Validates the job exists.
- Full-erasure path: `create or replace` the existing career deletion function from migration 7 so structured deletion also deletes `career_job_decisions` rows for the owner (decisions are career-derived personal data).

- [ ] **Step 1: Extend the static verifier tests** (RED) asserting migration 11 exists, the table is forced-RLS with owner-only select and no write policies, the RPC is security-definer with the mutex and `42501` guard, and the deletion function names `career_job_decisions`.
- [ ] **Step 2: Run** `corepack pnpm vitest run scripts/verify-supabase-foundation.test.ts --config vitest.workspace.ts` — expect FAIL.
- [ ] **Step 3: Write migration 11 and pgTAP 012** (fixtures follow `supabase/tests/007–011` two-role conventions): owner isolation (other user sees nothing), direct table writes rejected for authenticated role, RPC upsert/transition/clear behaviour, unknown decision rejected, deletion function removes decisions. Docker is unavailable: pgTAP is a fixture, not claimed runtime-green (same recorded limitation as 007–011).
- [ ] **Step 4: Run** the static verifier test and `corepack pnpm check:supabase` — green (11 migrations, 21 forced-RLS tables).
- [ ] **Step 5: Commit** `feat: add career job decisions with owner-fenced RPC`

### Task 3: Target-feed repository and decision action (web server)

**Files:**
- Create: `apps/web/src/lib/target-feed/types.ts`, `repository.ts`, `supabase-target-feed.ts`, `development-target-feed.ts`, `get-repository.ts` + colocated `*.test.ts` for each behaviourful module
- Create: `apps/web/src/app/(protected)/jobs/actions.ts` (server action `decideJobAction`)

**Interfaces:**
- Consumes: `applyEligibilityGate`, `scoreJobForProfile`, `TargetFeedExplanation`, `TargetFeedJobInput` from `@jobwarden/domain`; profile snapshot via the existing `ProfileRepository.getSnapshot()` pattern (`apps/web/src/lib/profile/*`); jobs row mapping conventions from `apps/web/src/lib/jobs/supabase-jobs.ts`; `resolveDevelopmentAccessMode` gating identical to `apps/web/src/lib/jobs/repository.ts`.
- Produces:

```ts
export type JobDecision = "saved" | "dismissed" | "considering";
export type TargetFeedItem = {
  job: JobListItem; // reuse apps/web/src/lib/jobs/types.ts
  explanation: TargetFeedExplanation; // from @jobwarden/domain
  decision: JobDecision | null;
};
export type TargetFeedResult = {
  items: readonly TargetFeedItem[]; // sorted score desc, then postedAt desc, then id
  enabledProfileNames: readonly string[];
  candidateCap: 200;
  dataMode: "supabase" | "fixtures";
};
export interface TargetFeedRepository {
  getFeed(options: { includeDismissed: boolean }): Promise<TargetFeedResult>;
  decide(jobId: string, decision: JobDecision | "clear"): Promise<void>;
}
```

**Behaviour:** fetch enabled named searches + confirmed evidence from the profile snapshot; fetch at most 200 candidate jobs (newest first) with SQL pushdown of the cheap allow-list filters shared across enabled profiles where safe (employment/working-time/workplace/ir35 pushed down only when EVERY enabled profile constrains them identically; otherwise fetch unfiltered within the cap — the domain gate is always re-applied per profile in memory, so pushdown is an optimisation, never the source of truth). Gate + score per profile in memory; a job matched by several profiles keeps its highest-scoring explanation. Jobs with a `dismissed` decision are excluded unless `includeDismissed`. Fictional development repository routes the same fixtures through the real domain scorer (no hand-written scores). The server action validates input with Zod, requires the authenticated owner path used by existing profile actions, and calls `decide_career_job`.

- [ ] **Step 1: Write failing repository/action tests** (mocked Supabase client pattern from `supabase-jobs.test.ts` / `supabase-profile.test.ts`): feed sorting and cap, per-profile highest score wins, dismissed filtering, pushdown-only-when-uniform rule, decision action validation and RPC call, development mode returns fixture feed through the real scorer, and — acceptance — deterministic results with AI wholly absent.
- [ ] **Step 2: Run** `corepack pnpm --filter @jobwarden/web test -- target-feed` — expect FAIL.
- [ ] **Step 3: Implement** the five modules + action following the existing repository factory/gating conventions exactly.
- [ ] **Step 4: Run** web tests and typecheck — green.
- [ ] **Step 5: Commit** `feat: add target-feed repository and job decisions`

### Task 4: Target-Feed-first jobs experience and taste refresh (UI)

**Files:**
- Modify: `docs/design/ui-direction.md` (Step 1)
- Modify: `apps/web/src/app/(protected)/jobs/page.tsx`, `apps/web/src/components/jobs/*`
- Create: `apps/web/src/components/target-feed/target-feed-view.tsx`, `target-feed-item.tsx`, plus tests alongside existing jobs UI tests
- Modify (taste refresh, repo-wide): every `border-l-2`/`border-l` coloured callout listed by `grep -rn "border-l" apps/web/src --include='*.tsx'` except the sheet primitive and pure layout dividers (`public-home.tsx`, `search-profile-form.tsx` keep their structural hairlines)

**Step 1 ui-direction additions (write verbatim, then follow):**
- New "Motion" section: animate only `transform` and `opacity`; state-change transitions 150–250 ms with `ease-out` (entrances may use `cubic-bezier(0.16,1,0.3,1)`); pressed buttons may scale to 0.98; no scroll-triggered reveals on work surfaces; respect `prefers-reduced-motion: reduce` by disabling non-essential transitions.
- Extend "Avoid": coloured left-border callout/note strips; replace with either plain muted text (`text-sm` secondary ink) for notes, or a quiet bordered surface (`1px` neutral border, 4–6 px radius, no accent edge) with a small state-coloured dot or label for status.
- Extend "Visual character": shadows at most `0 2px 8px rgba(0,0,0,0.04)` on hover only; borders `1px` neutral (`#EAEAEA`-class against white, existing warm neutrals stay); accents appear as text/dot state colour on neutral surfaces, never as tinted panels with accent edges. (Distilled from the taste-skill minimalist variant and the owner's 2026-07-19 direction; calm Openship-like surfaces, transitions.dev-like motion.)

**UI composition:** `/jobs` gains a URL-backed `view` param: `view=target` (default when at least one enabled search profile exists, else `all`) renders the Target Feed; `view=all` renders the existing broad list and filters unchanged. Target Feed rows show the stable job-fact order from ui-direction plus: profile name, integer score with an accessible label ("Fit 82 of 100"), a "Why this match" disclosure (matched evidence, important gaps, synonym-credit reasons, compensation treatment — truthful copy, no fake precision), and save/dismiss/considering controls calling `decideJobAction` with optimistic state. Dismissed jobs collapse out with a 200 ms opacity/height transition; an "Include dismissed" toggle is URL-backed. Designed states: no enabled profiles (points to `/profile`), no matches (states the gate honestly), stale catalogue note reusing the existing freshness data. Score display must not imply AI: no sparkle icons, no "AI match" copy.

- [ ] **Step 1: Update `docs/design/ui-direction.md`** as above. Commit `docs: tighten UI taste direction with motion and callout rules`.
- [ ] **Step 2: Write failing UI tests** (jsdom, patterns from `jobs-ui.test.tsx`): view switching default logic, score + explanation disclosure renders all four explanation elements, decision buttons call the action and update state, dismissed filtering, empty states, and an assertion that no rendered target-feed/jobs/profile/admin component emits `border-l-2` (regression guard for the banned pattern).
- [ ] **Step 3: Run** `corepack pnpm --filter @jobwarden/web test` — expect new tests FAIL.
- [ ] **Step 4: Implement** the views + taste refresh across the listed files (admin/profile/auth callouts move to the new note/status pattern; add the motion rules; keep semantic state colour as dot/label only).
- [ ] **Step 5: Run** web tests, typecheck, lint — green.
- [ ] **Step 6: Browser-verify** with `JOBWARDEN_DEV_ACCESS_BYPASS=true` at desktop and 390 px: target/all views, disclosure, decisions, keyboard navigation and focus, reduced-motion sanity; screenshot both widths; stop the server.
- [ ] **Step 7: Commit** `feat: make the explainable target feed the primary jobs experience`

### Task 5: Docs, release record, review, and publication

**Files:**
- Create: `docs/reviews/task-11-target-feed.md` (acceptance mapping against the six roadmap criteria + verification evidence)
- Modify: `docs/project-status.md` (Task 11 paragraph + handoff + table), `docs/operations/career-profile-data.md` only if decisions storage needs a privacy note (it does: decisions are owner-only career-derived data, erased with the profile)

- [ ] **Step 1: Write the review/status docs** truthfully (statuses stay `active` until merge).
- [ ] **Step 2: Full gate:** `corepack pnpm install --frozen-lockfile && corepack pnpm verify && corepack pnpm check:supabase && corepack pnpm audit --prod --audit-level high && git diff --check origin/main...HEAD && gitleaks git --no-banner --redact --log-opts='origin/main..HEAD'` — all green, record exact counts.
- [ ] **Step 3: Independent whole-branch review** of `main..HEAD` (fresh reviewer, read-only, PASS/APPROVED required; remediate findings test-first and re-review).
- [ ] **Step 4: Publish:** push branch, open PR #12 with truthful body, merge with a merge commit, update local `main`, rerun the merge-commit gate, commit `docs: record Task 11 publication` flipping status to `reviewed`, push `main`.
