# Task 7 Administrator Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver audited administrator access decisions, compliant source management, ingestion visibility, and a coalesced manual-run request without weakening the production administrator boundary while authentication setup is deferred.

**Architecture:** Keep all production `/admin` routes behind the existing `requireAdmin()` server layout and Supabase RLS/RPC boundary. Put parsing and action orchestration behind injected repositories so identity never enters form data and tests use real use-case code. Provide a separate read-only `/development/admin-preview` backed only by fictional in-memory data; its guard fails closed unless `NODE_ENV=development` and `JOBWARDEN_DEV_ACCESS_BYPASS=true`, and the preview never imports or invokes mutation actions.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components and Server Actions, TypeScript, Zod 4, Supabase SSR/Postgres/RLS, Base UI-backed shadcn components, Tailwind CSS 4, Vitest, Testing Library, and vitest-axe.

## Global Constraints

- Read `AGENTS.md`, `docs/project-status.md`, `docs/product/roadmap.md`, `docs/design/ui-direction.md`, and `docs/standards/shipping-standards.md` before implementation.
- Production `/admin` remains protected by `requireAdmin()`; a development fixture identity never gains administrator status.
- Every mutation obtains the actor through the caller's authenticated Supabase session and a security-definer RPC. Actor IDs, roles, emails, and `isAdmin` values are never accepted from form data.
- Access decisions require a legal transition, a 3–500 character reason, an explicit confirmation, and an append-only audit record.
- Sources are allowlisted by provider. Task 7 supports only `greenhouse`, HTTPS application hosts, GET, and a minimum configured sync interval of 15 minutes.
- Manual ingestion creates or reuses one globally coalesced request per source and minimum interval; it does not fetch a board in a web request.
- Errors exposed to the browser are fixed sanitised states. Do not expose SQL, raw Supabase errors, tokens, provider payloads, CV data, or emails in URLs.
- The UI is light-first, calm, compact, table/list-led, responsive, keyboard accessible, and free of dashboard-card repetition, gradients, glassmorphism, pricing, AI sparkle treatment, and UK clichés.
- Use test-driven development: write each behaviour test, run it and observe the expected failure, then add the minimum implementation.

---

## File map and interfaces

### Domain validation

- Create `packages/domain/src/admin.ts`: source form schemas, manual-run schema, review-age helper, and exported input types.
- Create `packages/domain/src/admin.test.ts`: validation and boundary tests.
- Modify `packages/domain/src/index.ts`: export `./admin`.

The module produces:

```ts
export const saveJobSourceInputSchema: z.ZodType<{
  sourceId: string | null;
  provider: "greenhouse";
  boardToken: string;
  employerName: string;
  enabled: boolean;
  minimumSyncMinutes: number;
  termsReviewedAt: string;
  robotsReviewedAt: string;
  complianceNotes: string;
  allowedHosts: string[];
}>;

export const requestSourceIngestionInputSchema: z.ZodType<{
  sourceId: string;
}>;

export function getComplianceReviewState(
  reviewedAt: string,
  now: Date,
): "current" | "due_soon" | "overdue";
```

Review state is `overdue` after 365 days, `due_soon` from 335 through 365 days, and `current` before 335 days. Future dates fail schema validation.

### Database queue

- Create `supabase/migrations/202607180001_admin_operations.sql`: `ingestion_requests`, RLS, indexes, and `request_source_ingestion(uuid)`.
- Create `supabase/tests/004_admin_operations.sql`: pgTAP permissions, coalescing, cooldown, and audit tests.
- Modify `scripts/verify-supabase-foundation.mjs` and its test only if the static verifier enumerates migrations/functions explicitly.

The RPC produces one row:

```sql
returns table (
  request_id uuid,
  correlation_id uuid,
  request_state text,
  eligible_after timestamptz
)
```

`request_state` is `queued` for a new request and `coalesced` for an existing pending request. The function checks `auth.uid()`, `is_admin()`, source existence/enabled state, the source interval, a running source run, and the latest pending request under row/advisory lock. It writes `ingestion.requested` to `audit_log` only for a new request. Only authenticated administrators can read requests; only the RPC can insert them. Task 8 will claim and complete the queue through service-role-only functions.

### Web repository and actions

- Create `apps/web/src/lib/admin/types.ts`: view models and action-state unions.
- Create `apps/web/src/lib/admin/repository.ts`: repository contract and pure action orchestration.
- Create `apps/web/src/lib/admin/repository.test.ts`: action and error-mapping tests.
- Create `apps/web/src/lib/admin/supabase-admin-repository.ts`: cookie-bound Supabase implementation.
- Create `apps/web/src/lib/admin/supabase-admin-repository.test.ts`: exact select/RPC contract tests.
- Create `apps/web/src/lib/admin/development-admin.ts`: immutable fictional preview snapshot.
- Create `apps/web/src/lib/admin/development-admin.test.ts`: fictional-data and mutation-absence tests.
- Create `apps/web/src/lib/admin/get-repository.ts`: production repository construction only.
- Create `apps/web/src/lib/admin/origin.ts` and `origin.test.ts`: exact same-origin mutation guard.

The repository contract is:

```ts
export interface AdminRepository {
  listAccessRequests(): Promise<AccessRequestView[]>;
  getAccessRequestsEnabled(): Promise<boolean>;
  listSources(): Promise<JobSourceView[]>;
  listIngestionRuns(limit: number): Promise<IngestionRunView[]>;
  decideAccess(input: DecideAccessInput): Promise<void>;
  setAccessRequestsEnabled(enabled: boolean): Promise<void>;
  saveSource(input: SaveJobSourceInput): Promise<{ sourceId: string }>;
  requestSourceIngestion(
    sourceId: string,
  ): Promise<IngestionRequestResult>;
}
```

Mutation use cases accept a `MutationContext` with `requestOrigin`, `requestHost`, `forwardedHost`, `forwardedProto`, and configured `siteOrigin`; they never accept an actor. Success/error states are discriminated by `kind`, use stable error codes, and contain no raw provider/database message.

### Routes and components

- Modify `apps/web/src/app/(protected)/admin/layout.tsx`: retain `requireAdmin()` and add the shared admin shell.
- Modify `apps/web/src/app/(protected)/admin/page.tsx`: redirect to `/admin/access`.
- Create access, sources, and ingestion page/action files under `apps/web/src/app/(protected)/admin/`.
- Create `apps/web/src/app/(protected)/admin/loading.tsx` and `error.tsx`.
- Create `apps/web/src/app/development/admin-preview/page.tsx`: exact dev guard and fictional snapshot only.
- Create focused components under `apps/web/src/components/admin/` and required shadcn primitives under `apps/web/src/components/ui/`.
- Create `apps/web/src/components/admin/admin-ui.test.tsx` and `apps/web/src/app/(protected)/admin/admin-routes.test.tsx`.

---

## Task 7.1: Add source and compliance validation

**Files:**

- Create: `packages/domain/src/admin.ts`
- Create: `packages/domain/src/admin.test.ts`
- Modify: `packages/domain/src/index.ts`

**Consumes:** `decideAccessInputSchema` from `packages/domain/src/access.ts`.

**Produces:** `saveJobSourceInputSchema`, `requestSourceIngestionInputSchema`, and `getComplianceReviewState` as specified above.

- [x] **Step 1: Write failing domain tests**

Test a valid Greenhouse source and assert rejection of another provider, a token containing whitespace/control characters, fewer than one or more than ten hosts, uppercase/schemed/path hosts, duplicate hosts, interval 14 or below, interval above 10,080, future review dates, fewer than three compliance-note characters, and an invalid UUID. Test review state at days 334, 335, 365, and 366.

- [x] **Step 2: Run the tests and observe the missing-module failure**

Run:

```bash
pnpm --filter @jobwarden/domain test -- admin.test.ts
```

Expected: FAIL because `./admin` does not exist.

- [x] **Step 3: Implement the exact schemas and helper**

Use Zod transforms only for trimming fields whose surrounding whitespace is not meaningful. Reject duplicate hosts rather than silently deduplicating them. `allowedHosts` accepts bare lowercase DNS hostnames matching `^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$`; do not accept a URL and strip it. Dates use strict `YYYY-MM-DD`, are real calendar dates, and are not after the injected/current calendar day used during parsing. Expose `createSaveJobSourceInputSchema(today: string)` for deterministic parsing and have the Server Action construct it from the server's current UTC calendar date; do not capture the date once at module load.

- [x] **Step 4: Run focused and package verification**

```bash
pnpm --filter @jobwarden/domain test -- admin.test.ts
pnpm --filter @jobwarden/domain typecheck
```

Expected: all pass.

- [x] **Step 5: Commit the domain boundary**

```bash
git add packages/domain
git commit -m "feat: define administrator operation inputs"
```

---

## Task 7.2: Harden the source boundary and add the audited request queue

**Files:**

- Create: `supabase/migrations/202607180001_admin_operations.sql`
- Create: `supabase/tests/004_admin_operations.sql`
- Modify if required: `scripts/verify-supabase-foundation.mjs`
- Modify if required: `scripts/verify-supabase-foundation.test.ts`

**Consumes:** `public.is_admin()`, `job_sources`, `ingestion_source_runs`, append-only `audit_log`, and the existing `public.upsert_job_source(...)` RPC.

**Produces:** a database-enforced 15-minute minimum source interval, administrator-readable `ingestion_requests`, and `public.request_source_ingestion(uuid)`.

- [x] **Step 1: Write the failing pgTAP and static-foundation expectations**

Assert that a direct administrator call to `upsert_job_source` rejects 14 minutes and accepts 15; existing rows below 15 minutes cannot be stored after migration; anon and approved non-admin callers cannot select requests or execute the request RPC; administrators can; disabled/missing sources fail; two requests inside the interval return the same request/correlation IDs with states `queued` then `coalesced`; a coalesced request creates no second audit row; and a request after the prior row is completed and the interval has elapsed receives a new ID.

- [x] **Step 2: Run available verification and observe failure**

```bash
pnpm vitest run scripts/verify-supabase-foundation.test.ts
pnpm check:supabase
```

Expected: the new static expectation fails before the migration exists. If Docker is available, `pnpm dlx supabase@latest db test supabase/tests/004_admin_operations.sql` also fails.

- [x] **Step 3: Implement the queue and function**

First replace the existing `job_sources_minimum_sync_interval_check` constraint so it requires `minimum_sync_interval >= interval '15 minutes'`, and recreate `public.upsert_job_source(...)` with the same signature/permissions/audit behaviour while changing its integer validation to `minimum_sync_minutes between 15 and 10080`. Do not rely on the web schema as the authoritative interval boundary.

Then use request statuses `pending`, `claimed`, `completed`, and `cancelled`; a partial unique index permits one `pending` or `claimed` row per source. Store UUID `correlation_id`, `requested_by`, `requested_at`, optional claim/completion timestamps, and no payload. Acquire a source-scoped advisory transaction lock. Return the active request as `coalesced`; otherwise calculate `eligible_after` from the most recent successful sync/request and insert only when the current time is eligible. If it is too early with no active request, raise SQLSTATE `P0001` and fixed message `source cooldown active`.

- [x] **Step 4: Run database-oriented verification**

```bash
pnpm vitest run scripts/verify-supabase-foundation.test.ts
pnpm check:supabase
```

When Docker is available:

```bash
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db test
```

Record Docker unavailability explicitly rather than claiming pgTAP ran.

- [x] **Step 5: Commit the queue boundary**

```bash
git add supabase scripts
git commit -m "feat: queue bounded administrator ingestion requests"
```

---

## Task 7.3: Build the injected administrator repository and actions

**Files:**

- Create: `apps/web/src/lib/admin/types.ts`
- Create: `apps/web/src/lib/admin/repository.ts`
- Create: `apps/web/src/lib/admin/repository.test.ts`
- Create: `apps/web/src/lib/admin/origin.ts`
- Create: `apps/web/src/lib/admin/origin.test.ts`

**Consumes:** domain inputs and the `AdminRepository` contract.

**Produces:** `decideAccessRequest`, `changeAccessRequestSetting`, `saveJobSource`, and `queueSourceIngestion` pure async functions for Server Action wrappers.

- [x] **Step 1: Write failing same-origin tests**

Accept only an exact HTTP(S) origin equal to the configured site origin after standard default-port normalisation. Reject missing/opaque origins, user-info, scheme mismatch, suffix hosts, comma-delimited forwarded hosts, multiple forwarded proto values, newline/control characters, and an Origin/Host disagreement. Prefer the platform host and allow one trusted forwarded host only when it exactly identifies the configured origin.

- [x] **Step 2: Implement the same-origin helper and verify**

```bash
pnpm --filter @jobwarden/web test -- origin.test.ts
```

Expected: all focused tests pass.

- [x] **Step 3: Write failing action tests**

For each action, use an in-memory repository implementation and real FormData. Assert malformed data never calls the repository, no actor/role field is read, same-origin failure returns `forbidden`, legal calls receive the parsed target only, known cooldown maps to `cooldown`, and unknown database errors map to `unavailable` without including the raw message. Assert successful states contain only IDs/status and fixed copy.

- [x] **Step 4: Implement minimal orchestration and stable error mapping**

Action results use:

```ts
type AdminActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string; correlationId?: string }
  | { kind: "invalid"; message: string; fieldErrors?: Record<string, string[]> }
  | { kind: "forbidden"; message: string }
  | { kind: "conflict" | "cooldown" | "unavailable"; message: string };
```

Do not compare raw error message text outside the Supabase adapter. The adapter maps PostgreSQL/Supabase codes into typed repository errors.

- [x] **Step 5: Run focused tests and typecheck**

```bash
pnpm --filter @jobwarden/web test -- repository.test.ts origin.test.ts
pnpm --filter @jobwarden/web typecheck
```

- [x] **Step 6: Commit the use-case layer**

```bash
git add apps/web/src/lib/admin
git commit -m "feat: add trusted administrator action layer"
```

---

## Task 7.4: Implement Supabase reads and RPC mutations

**Files:**

- Create: `apps/web/src/lib/admin/supabase-admin-repository.ts`
- Create: `apps/web/src/lib/admin/supabase-admin-repository.test.ts`
- Create: `apps/web/src/lib/admin/get-repository.ts`
- Create: `apps/web/src/lib/admin/development-admin.ts`
- Create: `apps/web/src/lib/admin/development-admin.test.ts`

**Consumes:** `AdminRepository` and the caller's cookie-bound `createClient()`.

**Produces:** `getAdminRepository()` for production routes and `getDevelopmentAdminSnapshot()` for preview rendering.

- [x] **Step 1: Write failing Supabase contract tests**

Assert exact allowlisted selects: access requests join only `profiles(display_name)` and never `auth.users`; sources include compliance/freshness fields; ingestion source runs join source employer/provider and parent trigger/status without provider payloads. Assert a 50-row run limit, deterministic ordering, runtime validation, fixed repository errors, and RPC parameter names matching migrations. Verify no RPC accepts actor/user role except the access target being decided.

- [x] **Step 2: Implement and verify the adapter**

Validate every database row before mapping it. Render missing profile names as `Private beta applicant` and expose user UUID only as a short operational suffix. Do not fabricate an email.

```bash
pnpm --filter @jobwarden/web test -- supabase-admin-repository.test.ts
pnpm --filter @jobwarden/web typecheck
```

- [x] **Step 3: Write the failing fictional-preview test**

Assert all names, employers, board tokens, hosts, run IDs, and error codes are explicitly fictional or `example.test`; the snapshot is deeply immutable from the public API; it contains access/source/run edge states; and it has no mutation method, email, contact detail, or CV content.

- [x] **Step 4: Implement preview data and production factory**

`getAdminRepository()` always returns the Supabase adapter and never checks the development bypass. The preview snapshot lives in a separate module with no Supabase/action imports.

- [x] **Step 5: Verify and commit**

```bash
pnpm --filter @jobwarden/web test -- supabase-admin-repository.test.ts development-admin.test.ts
pnpm --filter @jobwarden/web typecheck
git add apps/web/src/lib/admin
git commit -m "feat: add administrator data repositories"
```

---

## Task 7.5: Build the real administrator routes and action wrappers

**Files:**

- Modify: `apps/web/src/app/(protected)/admin/layout.tsx`
- Modify: `apps/web/src/app/(protected)/admin/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/access/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/access/actions.ts`
- Create: `apps/web/src/app/(protected)/admin/sources/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/sources/actions.ts`
- Create: `apps/web/src/app/(protected)/admin/ingestion/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/ingestion/actions.ts`
- Create: `apps/web/src/app/(protected)/admin/loading.tsx`
- Create: `apps/web/src/app/(protected)/admin/error.tsx`
- Create: `apps/web/src/app/(protected)/admin/admin-routes.test.tsx`

**Consumes:** production repository, pure action functions, `requireAdmin()`, and Next `headers/revalidatePath/redirect`.

**Produces:** protected routes with server-side reads and narrow action wrappers.

- [x] **Step 1: Write failing route-boundary tests**

Assert the admin layout calls `requireAdmin()` before rendering; `/admin` redirects to `/admin/access`; each page obtains the production repository and renders its designed empty/error-compatible view; wrappers assemble origin context from server headers and configured site origin; successful mutations revalidate only relevant admin paths; and no page imports development fixtures.

- [x] **Step 2: Implement the shared protected layout and pages**

Keep reads in Server Components. Fetch independent datasets in parallel. The access page shows pending first and the current request-acceptance setting. Sources show compliance state, enabled state, interval, last success, and allowed hosts. Ingestion shows active/recent runs, counts, duration, retries, error code, correlation ID/request status, and a manual request control for enabled sources.

- [x] **Step 3: Implement thin Server Action wrappers**

Each wrapper is `"use server"`, creates the caller-bound repository, gathers request headers, calls one pure action, and revalidates on success. It contains no validation or direct database logic and never accepts an injected repository in production exports.

- [x] **Step 4: Verify and commit**

```bash
pnpm --filter @jobwarden/web test -- admin-routes.test.tsx
pnpm --filter @jobwarden/web typecheck
git add 'apps/web/src/app/(protected)/admin'
git commit -m "feat: wire protected administrator routes"
```

---

## Task 7.6: Compose the administrator UI and safe visual preview

**Files:**

- Create: `apps/web/src/components/admin/admin-shell.tsx`
- Create: `apps/web/src/components/admin/admin-status.tsx`
- Create: `apps/web/src/components/admin/access-request-list.tsx`
- Create: `apps/web/src/components/admin/access-decision-form.tsx`
- Create: `apps/web/src/components/admin/source-list.tsx`
- Create: `apps/web/src/components/admin/source-form.tsx`
- Create: `apps/web/src/components/admin/ingestion-run-list.tsx`
- Create: `apps/web/src/components/admin/ingestion-request-form.tsx`
- Create: `apps/web/src/components/admin/admin-state-view.tsx`
- Create: `apps/web/src/components/admin/admin-ui.test.tsx`
- Create through shadcn CLI as needed: `apps/web/src/components/ui/alert-dialog.tsx`, `label.tsx`, `table.tsx`, `textarea.tsx`
- Create: `apps/web/src/app/development/admin-preview/page.tsx`
- Create: `apps/web/src/app/development/admin-preview/development-admin-preview.test.tsx`

**Consumes:** view models/actions and fictional preview snapshot.

**Produces:** accessible responsive admin UI and an immutable, read-only local visual target.

- [x] **Step 1: Generate only required shadcn primitives**

Run a dry-run first, then add the four named primitives without overwriting existing theme files:

```bash
pnpm --filter @jobwarden/web exec shadcn add alert-dialog label table textarea --dry-run
pnpm --filter @jobwarden/web exec shadcn add alert-dialog label table textarea
git diff -- apps/web/src/components/ui apps/web/src/app/globals.css
```

Revert any unrelated generated theme/config rewrite with `apply_patch`; do not use a destructive checkout command.

- [x] **Step 2: Write failing component and accessibility tests**

Assert semantic headings/nav/table-or-list structure; accessible labels and descriptions; legal actions by status; confirmation text names the irreversible state change; reason is required; source fields retain failed input; error/success states use `role=status` or `role=alert`; buttons expose pending/disabled state; run counts scan in the required order; compact mobile content does not depend on hidden table headers; and axe reports no violations for access, source, ingestion, empty, loading, and error views.

- [x] **Step 3: Implement the editorial admin composition**

Use one narrow dark-ink-on-warm-surface admin navigation line/rail, one dominant content column, thin separators, tabular aligned metadata, and semantic state colour. Avoid summary-card rows. On small screens, turn dense rows into labelled definition lists rather than a horizontally scrolling desktop table. Use `AlertDialog` for access and source-enable confirmations.

- [x] **Step 4: Implement the read-only development preview guard**

The page calls `resolveDevelopmentAccessMode` with server environment. When disabled, call `notFound()`. When enabled, render all three fictional sections in one preview with a persistent banner: `Read-only fictional administrator preview — no administrator access granted`. Render controls disabled and without `form action`; do not import route actions or `getAdminRepository()`.

- [x] **Step 5: Run UI tests and React checklist**

```bash
pnpm --filter @jobwarden/web test -- admin-ui.test.tsx development-admin-preview.test.tsx
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
```

Review every edited TSX file against `vercel:react-best-practices`: semantic elements, hook rules, stable keys, server/client boundary, accessible names, no unnecessary memo/effects, focused component responsibility, and no container soup.

- [x] **Step 6: Commit the UI**

```bash
git add apps/web/src/components/admin apps/web/src/components/ui apps/web/src/app/development
git commit -m "feat: add administrator operations workspace"
```

---

## Task 7.7: Verify behaviour, visuals, security, and documentation

**Files:**

- Modify: `docs/project-status.md`
- Create: `docs/reviews/task-7-administrator-operations.md`
- Modify: `README.md` only if the preview command needs clarification.

**Consumes:** the complete Task 7 implementation.

**Produces:** reviewable evidence and an accurate handoff.

- [x] **Step 1: Run focused and complete automated verification**

```bash
pnpm install --frozen-lockfile
pnpm --filter @jobwarden/domain test
pnpm --filter @jobwarden/web test
pnpm check:supabase
pnpm check:guardrails
pnpm audit --prod
git diff --check
pnpm verify
```

Expected: all available commands pass. Run pgTAP through a real local Supabase reset if Docker is available; otherwise record that exact remaining verification gap.

- [x] **Step 2: Run production fail-closed probes**

```bash
NODE_ENV=production JOBWARDEN_DEV_ACCESS_BYPASS=true pnpm --filter @jobwarden/web build
```

Expected: build fails closed with the documented bypass-forbidden error or the production route cannot render. Then run the normal production build without the flag and expect success. Verify `/development/admin-preview` is not a usable production route.

- [x] **Step 3: Verify the browser at desktop and true 390 px**

Start the development server with the exact bypass and inspect `/development/admin-preview` at 1440 px and 390 px. Capture access, sources, ingestion, empty/error, and confirmation states. Verify visible focus, keyboard operation, no horizontal document overflow, no console errors, no hydration errors, readable long tokens, and the explicit fictional read-only banner. Do not represent the preview as a successful real administrator login.

- [x] **Step 4: Run secret and forbidden-concept scans**

```bash
rg -n "actorId|isAdmin|service.role|SUPABASE_SERVICE_ROLE_KEY" apps/web/src/components/admin 'apps/web/src/app/(protected)/admin' apps/web/src/lib/admin
rg -n "pricing|premium|upgrade|trial|billing|auto.?apply" apps/web/src/components/admin 'apps/web/src/app/(protected)/admin' --ignore-case
gitleaks git --staged --no-banner --redact
```

Expected: no client-controlled actor/admin authority, no service-role use, no forbidden product concepts, and no secrets.

- [x] **Step 5: Complete independent review and remediate findings**

Review the full diff against this plan, the approved specifications, source/RLS boundaries, UI direction, mobile behaviour, and React checklist. Fix every critical, important, and minor correctness/accessibility issue before delivery, then repeat the relevant focused and full commands.

- [x] **Step 6: Update durable status and commit delivery evidence**

Set Task 7 to `reviewed` only after the independent review is clean. Record commits, test counts, browser paths/viewports, database verification status, and known external setup gaps in `docs/reviews/task-7-administrator-operations.md` and `docs/project-status.md`.

```bash
git add docs
git commit -m "docs: record Task 7 delivery"
```

- [ ] **Step 7: Publish through a pull request and merge**

Push the feature branch, create a focused pull request, ensure checks pass, merge to GitHub `main`, then fetch and fast-forward the local main checkout. Verify `git rev-parse main` equals `git rev-parse origin/main` before starting Task 8.
