# Task 13 Application Tracker and Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user track manual external applications through explicit, audited stages (applied → screening → interviewing → offer → accepted/rejected/withdrawn → archived) with a next action, due date, and notes per application, keyboard- and mobile-accessible list and board views, and honest funnel/follow-up insights that never invent recruiter activity.

**Architecture:** A pure domain module owns the stage vocabulary, the explicit transition map, next-action due classification, and deterministic insights. Migration 13 adds owner-only `career_applications` plus an append-only `career_application_events` audit table, forced-RLS, mutable only through owner-fenced security-definer RPCs that take the per-owner generation mutex and validate transitions in SQL as well. The web layer mirrors the explore/target-feed repository split (fictional development fixtures vs caller-bound Supabase) and adds an `/applications` route with URL-backed list/board views; stage moves use accessible selects, not drag-and-drop. Tracking starts from the job detail page. Nothing submits applications or sends email.

**Tech Stack:** TypeScript, Zod, Next.js App Router, Supabase Postgres/RLS/RPC, Vitest + Testing Library, Tailwind, existing UI primitives.

## Global Constraints

- Status transitions are explicit (validated against the transition map in both the domain and the RPC) and audited per user in `career_application_events` (append-only, select-own only).
- No invented recruiter activity: silence is reported as "no update observed for N+ days", never converted into rejection; observed outcomes (accepted/rejected/withdrawn) are a distinct bucket from unknown/ghosted.
- No feature submits applications, emails recruiters, or adds any notification path (that is Task 14).
- Notes and next actions are private owner data: bounded lengths, owner-only RLS, never in logs, errors, or URLs.
- List and board views must be keyboard and mobile accessible; the board scrolls horizontally inside its own container, never the page body.
- Fictional fixtures only in development; the preview refuses mutations honestly.
- UI follows `docs/design/ui-direction.md`; verify at 1440 px and true 390 px.

---

### Task 1: Application domain model (stages, transitions, insights)

**Files:** Create `packages/domain/src/applications.ts` + `applications.test.ts`; export from `index.ts`.

**Contract:**

```ts
export const applicationStages = [
  "applied", "screening", "interviewing", "offer",
  "accepted", "rejected", "withdrawn", "archived",
] as const;
export type ApplicationStage = (typeof applicationStages)[number];

export const applicationTransitions: Readonly<Record<ApplicationStage, readonly ApplicationStage[]>>;
// applied → screening | interviewing | offer | rejected | withdrawn | archived
// screening → interviewing | offer | rejected | withdrawn | archived
// interviewing → offer | rejected | withdrawn | archived
// offer → accepted | rejected | withdrawn | archived
// accepted | rejected | withdrawn → archived; archived → (terminal)
export function canTransition(from: ApplicationStage, to: ApplicationStage): boolean;

export type NextActionState = "overdue" | "due_today" | "upcoming" | "none";
export function classifyNextAction(dueOn: string | null, today: string): NextActionState; // ISO dates, deterministic string compare

export interface ApplicationSnapshotInput {
  id: string;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null; // ISO date
  lastTransitionAt: string; // ISO datetime of the latest audited event
  reachedStages: readonly ApplicationStage[]; // audited stages incl. current
}

export interface ApplicationInsights {
  totalTracked: number;
  stageCounts: Readonly<Record<ApplicationStage, number>>;
  funnel: readonly { stage: "applied" | "screening" | "interviewing" | "offer" | "accepted"; reached: number }[]; // audited reach, monotone by construction of events
  outcomes: { observed: number; open: number; quietFourteenPlusDays: number }; // quiet = open stage AND lastTransitionAt older than 14 days; labelled "no update observed", never rejection
  followUps: { overdue: number; dueToday: number; upcoming: number };
}
export function buildApplicationInsights(applications: readonly ApplicationSnapshotInput[], now: Date): ApplicationInsights;
```

- [ ] Failing tests: full transition-map coverage (every allowed pair, key forbidden pairs incl. anything out of `archived`, `accepted → offer`, skipping into `accepted` from non-offer), due classification boundaries (yesterday/today/tomorrow/null), insights (stage counts, audited funnel monotonicity, quiet-14-day bucket excludes terminal stages and fresh applications, follow-up buckets).
- [ ] Implement, `corepack pnpm --filter @jobwarden/domain test` + `typecheck`, commit `feat: add application tracker domain model`.

### Task 2: Migration 13, pgTAP 014, verifier update

**Files:** Create `supabase/migrations/202607190003_application_tracker.sql`, `supabase/tests/014_application_tracker.sql`; modify `scripts/verify-supabase-foundation.mjs` + test (13 migrations, 27 forced-RLS tables).

**Schema:**
- `public.career_applications` (`id` uuid PK, `owner_id` → auth.users cascade, `job_id` → jobs cascade, `stage` check in the eight stages default `'applied'`, `next_action` text check ≤200, `next_action_due_on` date, `notes` text check ≤2000, timestamps, unique `(owner_id, job_id)`). Forced RLS, owner-only select for approved users, no authenticated mutation grants.
- `public.career_application_events` (`id` uuid PK, `application_id` → career_applications cascade, `owner_id` → auth.users cascade, `from_stage` nullable check, `to_stage` check, `occurred_at`). Forced RLS, owner-only select, append-only (no update/delete for anyone but service_role; events written only inside the RPCs).
- RPCs (all security definer, `search_path = ''`, approved-access check, generation mutex first, narrow authenticated execute grant):
  - `track_career_application(target_job_id uuid) returns uuid` — job must exist (P0002); if already tracked returns the existing id without a duplicate event; else inserts the application at `applied` plus a creation event (`from_stage` null).
  - `transition_career_application(target_application_id uuid, target_stage text) returns text` — owner's application must exist (P0002); the `(current, target)` pair must be in the SQL transition map mirroring the domain (22023 otherwise); updates stage + `updated_at`, appends the audit event.
  - `update_career_application_plan(target_application_id uuid, target_next_action text, target_due_on date, target_notes text) returns void` — bounded lengths (22023), owner-checked (P0002); plan edits do not write stage events.
  - `delete_career_application(target_application_id uuid) returns void` — owner-checked; cascades events.
  - Re-create `delete_career_profile_data()` adding `delete from career_application_events` / `career_applications` for the actor.
- pgTAP 014 (~26 assertions): tables/RLS/policies/columns, grants (no direct writes, no anon), RPC existence + definer + grants, stage and length check rejections, unauthenticated 42501 probes.
- Verifier: migration file added; both tables in `publicTables`; fragments for the transition-map validation, audited event insert, unique owner/job constraint, plan-length checks, deletion extension; forbid authenticated mutation grants/policies on both tables (extend the forbidden-policy regex and grant checks). A repository test keeps the SQL transition map in lockstep with `applicationTransitions` in the domain.
- [ ] Test-first on the verifier, then migration + pgTAP; `corepack pnpm check:supabase` + verifier tests green. Commit `feat: add audited application tracker schema`.

### Task 3: Applications web repository (fixtures/Supabase split)

**Files:** Create `apps/web/src/lib/applications/{types,repository,get-repository,development-applications,supabase-applications}.ts` + tests.

```ts
export type ApplicationItem = {
  id: string;
  job: JobListItem;
  stage: ApplicationStage;
  nextAction: string | null;
  nextActionDueOn: string | null;
  nextActionState: NextActionState;
  notes: string | null;
  lastTransitionAt: string;
};
export type ApplicationsResult = {
  items: readonly ApplicationItem[]; // newest activity first
  insights: ApplicationInsights;
  dataMode: "supabase" | "fixtures";
};
export interface ApplicationsRepository {
  getApplications(): Promise<ApplicationsResult>;
  track(jobId: string): Promise<void>;
  transition(applicationId: string, stage: ApplicationStage): Promise<void>;
  updatePlan(applicationId: string, plan: { nextAction: string | null; nextActionDueOn: string | null; notes: string | null }): Promise<void>;
  remove(applicationId: string): Promise<void>;
}
```

- Supabase reads: applications with the job relation (reusing the jobs column set from the target feed) and the owner's events grouped per application for `reachedStages`/`lastTransitionAt`; a pure `buildApplicationsResult` shared with the development repository computes ordering, next-action states, and insights via the domain functions. All mutations call the four RPCs; Zod validation before every RPC; sanitised errors; `PreviewApplicationsUnavailableError` in development.
- [ ] TDD; focused web tests + typecheck; commit `feat: add applications repository`.

### Task 4: `/applications` route, actions, list/board UI, navigation, job-detail tracking

**Files:** Create `apps/web/src/app/(protected)/applications/{page,actions,action-context,loading,error}.tsx`, `apps/web/src/components/applications/{applications-view,application-item,application-board,insights-panel}.tsx` + tests; modify job detail page (`/jobs/[jobId]`) to add an origin-checked "Track application" action, `app-shell.tsx`, `mobile-navigation.tsx` (Applications nav entry), and target-feed/jobs types if the detail page needs the tracked state.

- URL-backed `?view=list|board` (default list). List: rows with job facts, stage badge + accessible "Move to" select (only legal transitions offered), next-action/due/notes form in a disclosure, overdue/due-today/upcoming state dots, delete with confirmation. Board: one column per open stage plus a Closed column (accepted/rejected/withdrawn/archived), horizontally scrollable inside its own container, same accessible controls on each card — no drag-and-drop.
- Insights panel: funnel reach, stage counts, follow-ups (overdue/today/upcoming), outcome split with the honest "no update observed for 14+ days" bucket and explicit copy that JobWarden never contacts recruiters.
- Actions mirror the explore pattern (trusted origin, Zod, mapped states, `revalidatePath`).
- [ ] TDD incl. axe; full web suite, lint, typecheck; commit `feat: add applications tracker experience`.

### Task 5: Verification, browser checks, documentation

- [ ] Full release gate (frozen install, `pnpm verify`, `check:supabase`, audit, gitleaks, diff checks).
- [ ] Browser-verify `/applications` list + board and the job-detail track flow at 1440 px and true 390 px in the development bypass; no overflow or console errors.
- [ ] Write `docs/reviews/task-13-application-tracker.md`; update `docs/project-status.md` and the roadmap table row.

### Task 6: Independent review, remediation, publication

- [ ] Eight-angle independent review of the branch diff; remediate findings test-first; re-run the affected gate.
- [ ] PR → merge into GitHub `main` → pull local `main` → verify the merge commit → `docs: record Task 13 publication`.

## Self-review

Acceptance coverage: explicit audited transitions (Tasks 1–2), overdue/upcoming visibility without invented activity (Tasks 1, 3, 4), accessible list and board views (Task 4), observed-vs-unknown insight split (Tasks 1, 4), no submission/email paths anywhere (constraint + Task 4 copy). Deletion privacy handled in Task 2. Type names consistent across tasks. No placeholders.
