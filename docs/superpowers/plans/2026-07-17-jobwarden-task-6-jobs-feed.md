# JobWarden Task 6 UK Jobs Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first responsive UK jobs feed and job-detail experience without making external authentication setup a development prerequisite.

**Architecture:** Retain the reviewed Supabase/RLS production path and add a fail-closed, server-only local development access mode. Both Supabase and local fixtures implement one jobs repository contract, so filters and UI do not depend on the data source. The feed remains URL-backed and server-rendered; only the mobile navigation/filter sheet needs client state.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Zod 4, Supabase SSR, Tailwind CSS 4, shadcn Base UI primitives, Vitest, React Testing Library, and vitest-axe 0.1.0.

## Global Constraints

- UK-only jobs with explicit eligibility evidence; never infer IR35 from contract status.
- No pricing, payments, subscriptions, premium labels, AI match scores, or automatic applications.
- Production data remains protected by reviewed route gates and RLS. The development bypass is server-only, local-only, fail-closed outside `NODE_ENV=development`, and never grants administrator access.
- Local fixtures are visibly labelled and cannot be selected outside development bypass mode.
- Filters use GET query parameters and work without client JavaScript.
- A fixed page size of 25 and stable `posted_at desc, id desc` ordering are mandatory.
- Unknown compensation is omitted. Contract IR35 `unknown` is displayed explicitly rather than guessed.
- External application links use HTTPS, `target="_blank"`, and `rel="noopener noreferrer"`; JobWarden never submits an application.
- Follow `docs/design/ui-direction.md`: light-first, warm neutral, editorial hierarchy, one restrained blue, one responsive list, visible focus, desktop navigation rail, mobile sheet, and designed loading/empty/no-results/error states.
- Every behaviour change follows RED-GREEN-REFACTOR. Final verification includes desktop and true 390 px browser checks.

---

## Task 1: Defer authentication safely and define the jobs repository seam

**Files:**

- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/(protected)/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/auth/public-home.tsx`
- Modify: `apps/web/src/components/auth/auth-ui.test.tsx`
- Create: `apps/web/src/lib/development/access-mode.ts`
- Create: `apps/web/src/lib/development/access-mode.test.ts`
- Create: `apps/web/src/lib/jobs/types.ts`
- Create: `apps/web/src/lib/jobs/development-jobs.ts`
- Create: `apps/web/src/lib/jobs/repository.ts`
- Modify: `docs/project-status.md`
- Modify: `docs/superpowers/plans/2026-07-17-jobwarden-foundation.md`

**Interfaces:**

```ts
export type DevelopmentAccessInput = {
  nodeEnv: string | undefined;
  bypassFlag: string | undefined;
};

export function resolveDevelopmentAccessMode(
  input: DevelopmentAccessInput,
): { enabled: false } | { enabled: true; dataMode: "fixtures" };

export type JobListItem = {
  id: string;
  title: string;
  employer: string;
  location: string;
  employmentType: EmploymentType;
  workingTime: WorkingTime;
  workplaceType: WorkplaceType;
  ir35Status: Ir35Status;
  compensationMinimum: number | null;
  compensationMaximum: number | null;
  compensationCurrency: "GBP" | null;
  compensationPeriod: CompensationPeriod;
  postedAt: string | null;
};

export type WorkingTime = (typeof workingTimes)[number];
export type WorkplaceType = (typeof workplaceTypes)[number];
export type Ir35Status = (typeof ir35Statuses)[number];
export type CompensationPeriod = (typeof compensationPeriods)[number];

export type JobFilters = {
  q: string;
  employment: EmploymentType | "all";
  workingTime: WorkingTime | "all";
  workplace: WorkplaceType | "all";
  ir35: Ir35Status | "all";
  page: number;
};

export type JobDetail = JobListItem & {
  descriptionText: string;
  applicationUrl: string;
  ukEligibilityEvidence: readonly string[];
  sourceLabel: string;
  lastSeenAt: string;
};

export type JobsPageResult = {
  items: readonly JobListItem[];
  total: number;
  latestListingUpdate: string | null;
  page: number;
  pageSize: 25;
  dataMode: "supabase" | "fixtures";
};

export interface JobsRepository {
  list(filters: JobFilters): Promise<JobsPageResult>;
  findById(jobId: string): Promise<JobDetail | null>;
}
```

- [x] **Step 1: Write failing development-access tests**

Cover absent/false flags, the exact true flag in development, production/test/undefined environments with the true flag, mixed case, and whitespace. Production-like environments with the flag must throw `Development access bypass is forbidden outside local development`. Extend the public-entry component test first so it fails until the component can render `Open jobs workspace` linking to `/jobs` in local mode while retaining `Request access` linking to `/auth/sign-in` otherwise.

- [x] **Step 2: Run RED**

Run `pnpm --filter @jobwarden/web test -- src/lib/development/access-mode.test.ts` and confirm failure because the module does not exist.

- [x] **Step 3: Implement the minimal fail-closed resolver and wire it server-side**

Skip Supabase session refresh and the ordinary protected access guard only for the exact enabled result. Do not change the administrator layout. In local bypass mode, make `/` point to `/jobs`; otherwise retain the private-beta sign-in entry.

- [x] **Step 4: Add realistic, explicitly fictional UK development fixtures**

Include permanent, fixed-term, part-time, remote, hybrid, inside-IR35, outside-IR35, and unknown-IR35 contract examples. Use valid UUIDs and HTTPS application URLs on `example.test`. Keep fixture selection behind the development resolver and expose the `fixtures` mode to the UI.

- [x] **Step 5: Run GREEN and commit**

Run the focused tests plus web typecheck, then commit as `feat: add safe local product mode`.

---

## Task 2: Implement URL filters and the Supabase jobs repository

**Files:**

- Create: `apps/web/src/lib/jobs/filters.ts`
- Create: `apps/web/src/lib/jobs/filters.test.ts`
- Create: `apps/web/src/lib/jobs/supabase-jobs.ts`
- Create: `apps/web/src/lib/jobs/supabase-jobs.test.ts`
- Create: `apps/web/src/lib/jobs/get-repository.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export const jobFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  employment: z.enum([...employmentTypes, "all"]).catch("all"),
  workingTime: z.enum([...workingTimes, "all"]).catch("all"),
  workplace: z.enum([...workplaceTypes, "all"]).catch("all"),
  ir35: z.enum([...ir35Statuses, "all"]).catch("all"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

// jobFilterSchema must satisfy the JobFilters contract from jobs/types.ts.
export function parseJobFilters(input: Record<string, string | string[] | undefined>): JobFilters;
export function createSupabaseJobsRepository(client: object): JobsRepository;
export async function getJobsRepository(): Promise<JobsRepository>;
```

- [x] **Step 1: Install `vitest-axe@0.1.0` and write failing filter tests**

Cover valid filters, arrays, unexpected values, trimmed search, over-100-character fallback, page zero/negative/over-1000/non-numeric fallback, and canonical query-string generation used by clear/pagination links.

- [x] **Step 2: Run filter RED, implement, and run GREEN**

Use Zod only. Do not mutate `searchParams` and do not accept unbounded arrays.

- [x] **Step 3: Write failing repository contract tests**

Assert `lifecycle_status = active`, exact count, filters only when selected, escaped title/employer search, stable two-column ordering, range `0..24` for page 1 and `25..49` for page 2, location selection, null-safe mapping, no service-role client, and generic `Unable to load jobs` errors. Detail lookup must validate UUID, require active status, use `maybeSingle`, and return null for no row.

- [x] **Step 4: Implement the Supabase repository and selector**

Use only the caller's cookie-bound Supabase server client. Validate returned records before mapping. Quote and escape PostgREST search values so commas, parentheses, quotes, backslashes, `%`, and `_` cannot alter filter structure. `latestListingUpdate` is the newest visible `last_seen_at`; Task 8 replaces this with the completed ingestion timestamp once the ingestion service exists.

- [x] **Step 5: Run GREEN and commit**

Run filter/repository tests and web typecheck, then commit as `feat: query the UK jobs feed`.

---

## Task 3: Build the responsive feed, filters, shell, and job detail

**Files:**

- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/mobile-navigation.tsx`
- Create: `apps/web/src/components/jobs/job-card.tsx`
- Create: `apps/web/src/components/jobs/job-filters.tsx`
- Create: `apps/web/src/components/jobs/job-list.tsx`
- Create: `apps/web/src/components/jobs/jobs-feed-view.tsx`
- Create: `apps/web/src/components/jobs/job-detail-view.tsx`
- Create: `apps/web/src/components/jobs/jobs-ui.test.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/select.tsx`
- Create: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/src/components/ui/skeleton.tsx`
- Modify: `apps/web/src/app/(protected)/jobs/page.tsx`
- Create: `apps/web/src/app/(protected)/jobs/[jobId]/page.tsx`
- Create: `apps/web/src/app/(protected)/jobs/loading.tsx`
- Create: `apps/web/src/app/(protected)/jobs/error.tsx`
- Create: `apps/web/src/app/(protected)/jobs/not-found.tsx`
- Create: `apps/web/src/app/(protected)/jobs/opengraph-image.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Add shadcn primitives non-interactively and write failing UI tests**

Use the existing Base UI configuration. Test semantic page/detail headings, labelled GET filters, a clear-all link, stable metadata order, omitted unknown compensation, explicit `IR35 status not stated` for contracts, application-link safety, development-data disclosure, empty/no-results/error/loading states, keyboard-visible actions, and absence of pricing, premium, upgrade, AI score, or auto-apply language. Run axe against populated feed, no-results, and detail variants.

- [x] **Step 2: Run UI RED and implement the app shell**

Desktop uses a narrow persistent rail with JobWarden, Jobs, and a quiet data-mode status. Mobile uses a Sheet opened by a labelled button. Do not render dead navigation links or administrator navigation in development bypass mode.

- [x] **Step 3: Implement one responsive list and URL-backed filters**

The desktop filter area is visible beside the list. Mobile uses a filter Sheet while preserving active values. The form method is GET. Each row shows title, employer, UK location, workplace, employment, working time, explicit compensation, contract IR35, posting age, and a details link in that order. Show only result count and latest listing update as summary values.

- [x] **Step 4: Implement job detail and safe application**

Render plain text only, eligibility evidence, source label, last checked time, and the canonical application link. Use Next `notFound()` for invalid/missing IDs. Do not embed provider HTML or application forms.

- [x] **Step 5: Implement designed non-happy paths**

Loading uses aligned list skeletons. Empty database explains that permitted sources have not produced listings. No-results preserves filters and offers clear-all. Error copy says the feed is temporarily unavailable without exposing provider payloads. Detail not-found gives a route back to `/jobs`.

- [x] **Step 6: Run GREEN, React review, and browser verification**

Run component tests, lint, typecheck, and build. Review every changed TSX file against `vercel:react-best-practices`. Start with `JOBWARDEN_DEV_ACCESS_BYPASS=true`; verify `/`, `/jobs`, one filtered URL, and one detail at desktop and true 390 px widths. Confirm meaningful content, no overlay, no console errors, keyboard focus, mobile sheets, and no horizontal overflow.

- [x] **Step 7: Update durable status and commit**

Record exact test counts, browser evidence, auth deferral, fixture boundary, and remaining live-service limitations. Commit as `feat: add the UK jobs workspace`.

---

## Task 4: Independent review and delivery

- [ ] Generate a review package from the exact Task 6 base SHA to branch HEAD.
- [ ] Independently review specification compliance, query safety, production fail-closed behaviour, RLS client use, UI accessibility, mobile layout, development-data honesty, and scope.
- [ ] Fix all Critical and Important findings test-first and re-review the complete range.
- [ ] Run `pnpm verify`, `pnpm audit --prod`, `git diff --check`, and a full-range gitleaks scan.
- [ ] Push `codex/task-6-uk-jobs-feed`, open a ready pull request, merge it to GitHub `main`, pull local `main`, reinstall frozen dependencies, and repeat full verification on the merge commit.
