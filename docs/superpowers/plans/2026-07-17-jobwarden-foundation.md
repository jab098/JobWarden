# JobWarden Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a GitHub-ready, private-beta vertical slice in which an allowlisted Greenhouse board ingests UK-only jobs into a secured Supabase schema and only administrator-approved users can browse and filter them.

**Architecture:** Use a pnpm TypeScript monorepo. Next.js 16 runs on Cloudflare Workers through OpenNext; Supabase owns Postgres, Google OAuth, RLS, Cron, Vault, and the ingestion Edge Function. Framework-independent domain and ingestion packages keep UK classification and Greenhouse handling testable without web or database infrastructure.

**Tech Stack:** Node 24, pnpm 11, TypeScript 5, Next.js 16, React 19, Tailwind CSS 4, shadcn/ui primitives, Supabase JS/SSR, Supabase CLI, Zod 4, Vitest, Playwright, OpenNext for Cloudflare, Sentry EU, GitHub Actions, Gitleaks, and Semgrep.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md` and read `docs/standards/shipping-standards.md` before each task.
- UK-only means explicit UK evidence. A remote listing is excluded unless its text explicitly permits working from the UK.
- Never infer IR35 status merely because a listing is a contract. Store `unknown` without explicit inside/outside evidence.
- The product is private beta. Authentication creates an identity and, when enabled, a pending request; it never grants product access automatically.
- The initial administrator is bootstrapped from a verified Supabase user ID with a server-only service-role credential. Client input, email matching, cookies, and user metadata can never confer administrator access.
- Applications are manual links to the employer. Do not call ATS application-submission endpoints.
- Only call allowlisted, documented public job-board endpoints. Do not bypass CAPTCHAs, robots restrictions, paywalls, access controls, or anti-bot systems.
- There is no pricing model. Do not install or mention Stripe, payment providers, checkout, subscriptions, plans, trials, premium access, upgrade prompts, billing settings, or plan-based quotas.
- Do not install Clerk, Resend, PostHog's browser SDK, Upstash, Pinecone, a separate API service, generic scraping, Playwright-based ingestion, or AI-writing dependencies in this foundation.
- Every browser-accessible table has RLS. The Supabase service-role key never enters the Next.js browser bundle.
- Validate boundary inputs with Zod, redact PII and secrets from logs, use explicit timeouts and bounded retries, and keep audit rows append-only.
- Sentry and analytics boundaries are optional and lazily initialised. The application must build and function when their environment variables are absent. Analytics remains disabled until affirmative consent is specified.
- Use Server Components for reads and Server Actions for authenticated mutations. Keep URL-backed filters shareable and progressively enhanced.
- Use `apply_patch` for hand-authored file edits, preserve unrelated user changes, and make one focused commit after each completed task.

---

## Task 1: Create the monorepo, persistent standards, and invariant guardrails

**Files:**

- Create: `.node-version`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `README.md`
- Create: `docs/standards/shipping-standards.md`
- Create: `docs/product/vision.md`
- Create: `docs/project-status.md`
- Create: `scripts/check-project-guardrails.mjs`
- Create: `tests/guardrails/project-guardrails.test.ts`
- Create: `tests/guardrails/vitest.config.ts`
- Generate: `apps/web/**`

- [x] **Step 1: Copy the persistent source material before generating code**

Use `apply_patch` to create `docs/standards/shipping-standards.md` with the exact contents of `/Users/jabed/Documents/Main Notes/Personal/Development/shipping-standards-prompt.md`. Create `docs/product/vision.md` as a short pointer to the approved product summary and invariants in the design spec. Do not paraphrase or shorten the shipping standard.

- [x] **Step 2: Write the failing repository guardrail test**

Create `tests/guardrails/project-guardrails.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/standards/shipping-standards.md",
  "docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md",
];

describe("project guardrails", () => {
  it.each(requiredFiles)("keeps %s in the repository", async (path) => {
    await expect(readFile(path, "utf8")).resolves.toBeTruthy();
  });

  it("records the permanent product invariants", async () => {
    const agents = await readFile("AGENTS.md", "utf8");
    expect(agents).toContain("UK-only");
    expect(agents).toContain("administrator-approved");
    expect(agents).toContain("no pricing model");
    expect(agents).toContain("manual application links");
  });
});
```

- [x] **Step 3: Add the root workspace configuration and run the test to prove it fails**

Create `package.json`:

```json
{
  "name": "jobwarden",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@11.7.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "build": "pnpm --filter @jobwarden/web build",
    "check:guardrails": "node scripts/check-project-guardrails.mjs",
    "format:check": "prettier --check .",
    "lint": "pnpm -r lint",
    "test": "vitest run --workspace vitest.workspace.ts",
    "test:watch": "vitest --workspace vitest.workspace.ts",
    "typecheck": "pnpm -r typecheck",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm check:guardrails && pnpm build"
  },
  "devDependencies": {
    "@types/node": "latest",
    "prettier": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `.node-version` with `24.18.0`. Create `vitest.workspace.ts`:

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "tests/guardrails/vitest.config.ts",
  "packages/*/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
```

Create `tests/guardrails/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "guardrails", root: "../..", include: ["tests/guardrails/**/*.test.ts"] },
});
```

Run:

```bash
pnpm install
pnpm vitest run --config tests/guardrails/vitest.config.ts
```

Expected: failure because `AGENTS.md` and `CLAUDE.md` do not exist yet.

- [x] **Step 4: Add agent instructions and the executable guardrail**

Create `AGENTS.md` with these exact mandatory statements:

```md
# JobWarden Agent Instructions

Read `docs/project-status.md`, `docs/standards/shipping-standards.md`, and the active specification or plan before changing code.

JobWarden is UK-only. Publish a job only with explicit UK eligibility evidence, including explicit UK permission for remote work. Do not infer IR35 status from contract status.

JobWarden is a private beta. Product data is available only to administrator-approved users, with RLS as the final boundary. Authentication alone never grants access. Administrator status is server-controlled.

JobWarden has no pricing model. Never add payments, subscriptions, plans, trials, premium or upgrade UI, billing settings, or plan-based quotas.

Applications use manual application links only. Never submit applications or bypass source access controls.

Use public documented endpoints from explicitly allowlisted sources. Keep source compliance metadata, bounded retries, sanitised errors, append-only audit records, and user-visible degraded states.
```

Create `CLAUDE.md` with `@AGENTS.md` followed by one sentence requiring the approved spec and active plan to be read. Create `scripts/check-project-guardrails.mjs`:

```js
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const forbiddenDependencies = [
  "@clerk/nextjs",
  "@pinecone-database/pinecone",
  "@stripe/stripe-js",
  "@upstash/redis",
  "clerk",
  "pinecone",
  "resend",
  "stripe",
];
const forbiddenProductCopy = /\b(billing|checkout|premium account|pricing plan|start trial|upgrade plan)\b/i;

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if ([".next", "node_modules"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    files.push(...(entry.isDirectory() ? await walk(child) : [child]));
  }
  return files;
}

const workspaceFiles = (await Promise.all(["apps", "packages"].map(walk))).flat();
const checkedFiles = workspaceFiles.filter((path) => [".json", ".ts", ".tsx"].includes(extname(path)));
const violations = [];

for (const path of checkedFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of forbiddenDependencies) {
    if (source.includes(`\"${dependency}\"`) || source.includes(`'${dependency}'`)) {
      violations.push(`${path}: forbidden dependency ${dependency}`);
    }
  }
  if (!path.includes(".test.") && forbiddenProductCopy.test(source)) {
    violations.push(`${path}: forbidden pricing copy`);
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Project guardrails passed");
```

Create `docs/project-status.md` as the durable cross-session handoff. It must link the approved specification, active implementation plan, shipping standard, and architecture records; list Tasks 1–10 with `pending`, `in progress`, or `reviewed` status; record the current branch and last reviewed commit; name the next task; and record the exact verification commands last run. Update this file only after a task's independent review is clean so future agents can trust it as the repository recovery map.

- [x] **Step 5: Generate the Next.js application without replacing repository documents**

Run:

```bash
pnpm dlx create-next-app@16.2.10 apps/web --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-pnpm
cd apps/web
pnpm dlx shadcn@latest init --defaults
cd ../..
pnpm install
```

Change the generated package name to `@jobwarden/web`; add `typecheck: "tsc --noEmit"` and `lint: "eslint ."`; keep Next.js at `16.2.10` and React at `19.2.7`. Extend `tsconfig.base.json` from each package rather than duplicating strict settings. Keep Geist variables on the root `<html>` element and map Tailwind's `--font-sans` and `--font-mono` to literal `var(--font-geist-sans)` and `var(--font-geist-mono)` values in `@theme inline` so the generated shadcn theme does not override them.

- [x] **Step 6: Create safe environment documentation**

Create `.env.example` containing names and descriptions, with only the safe localhost site-origin default populated:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
INGESTION_CRON_SECRET=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
ADMIN_BOOTSTRAP_USER_ID=
```

Document in `README.md` that `SUPABASE_SERVICE_ROLE_KEY`, `INGESTION_CRON_SECRET`, `SENTRY_AUTH_TOKEN`, and `ADMIN_BOOTSTRAP_USER_ID` are server-only. `apps/web/.env.local` receives only `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; it never receives a legacy anon key, secret key, or service-role credential. The existing bootstrap command may retain the `SUPABASE_SERVICE_ROLE_KEY` compatibility name but should prefer an `sb_secret_...` value. Add `.env*` exclusions while retaining `.env.example` in `.gitignore`.

- [x] **Step 7: Verify and commit**

Run:

```bash
pnpm vitest run --config tests/guardrails/vitest.config.ts
pnpm check:guardrails
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
git diff --check
```

Expected: all commands pass and the guardrail prints `Project guardrails passed`.

Commit:

```bash
git add .
git commit -m "chore: scaffold JobWarden workspace"
```

---

## Task 2: Implement the UK job domain and access state machine with tests

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/access.ts`
- Create: `packages/domain/src/job.ts`
- Create: `packages/domain/src/classification.ts`
- Create: `packages/domain/src/compensation.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/classification.test.ts`
- Create: `packages/domain/src/compensation.test.ts`
- Create: `packages/domain/src/access.test.ts`

- [x] **Step 1: Create the package and write failing domain tests**

Set package name to `@jobwarden/domain`, publish no files, use ESM, and expose `./src/index.ts`. Add Zod 4 as its only runtime dependency.

Write table-driven tests asserting:

```ts
expect(classifyUkEligibility("London, England", "Office based").eligible).toBe(true);
expect(classifyUkEligibility("Edinburgh, Scotland", "Hybrid").eligible).toBe(true);
expect(classifyUkEligibility("Cardiff, Wales", "Hybrid").eligible).toBe(true);
expect(classifyUkEligibility("Belfast, Northern Ireland", "On site").eligible).toBe(true);
expect(classifyUkEligibility("Remote", "You may work remotely anywhere in the UK").eligible).toBe(true);
expect(classifyUkEligibility("Remote", "Remote within Europe").eligible).toBe(false);
expect(classifyUkEligibility("Remote", "Remote role").eligible).toBe(false);
expect(classifyUkEligibility("New York, NY", "US applicants only").eligible).toBe(false);
expect(classifyIr35("This engagement is outside IR35")).toBe("outside");
expect(classifyIr35("Contract role with immediate start")).toBe("unknown");
expect(classifyEmployment("12 month fixed-term contract")).toBe("fixed_term");
expect(classifyEmployment("Zero hours worker")).toBe("zero_hours");
expect(parseCompensation("£450-£550 per day")).toMatchObject({
  currency: "GBP",
  minimum: 45000,
  maximum: 55000,
  period: "day",
});
```

Store money in minor units, so £450 is `45000`.

Run:

```bash
pnpm --filter @jobwarden/domain test
```

Expected: failure because the classifiers do not exist.

- [x] **Step 2: Add exact schemas and exported types**

Implement the Zod constants in `job.ts`:

```ts
import { z } from "zod";

export const employmentTypes = [
  "permanent", "fixed_term", "contract", "temporary", "apprenticeship",
  "internship", "casual", "zero_hours", "unknown",
] as const;
export const workingTimes = ["full_time", "part_time", "flexible", "unknown"] as const;
export const workplaceTypes = ["onsite", "hybrid", "remote", "unknown"] as const;
export const ir35Statuses = ["inside", "outside", "not_applicable", "unknown"] as const;
export const compensationPeriods = ["hour", "day", "week", "month", "year", "unknown"] as const;

export const normalisedJobSchema = z.object({
  sourceId: z.string().uuid(),
  providerJobId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  descriptionText: z.string().max(100_000),
  applicationUrl: z.url().refine((url) => url.startsWith("https://"), "HTTPS required"),
  countryCode: z.literal("GB"),
  ukEligibilityEvidence: z.array(z.string().min(1).max(500)).min(1),
  employmentType: z.enum(employmentTypes),
  workingTime: z.enum(workingTimes),
  workplaceType: z.enum(workplaceTypes),
  ir35Status: z.enum(ir35Statuses),
  compensationRaw: z.string().max(1_000).nullable(),
  compensationMinimum: z.number().int().nonnegative().nullable(),
  compensationMaximum: z.number().int().nonnegative().nullable(),
  compensationCurrency: z.literal("GBP").nullable(),
  compensationPeriod: z.enum(compensationPeriods),
  postedAt: z.iso.datetime().nullable(),
  closesAt: z.iso.datetime().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type NormalisedJob = z.infer<typeof normalisedJobSchema>;
```

- [x] **Step 3: Implement evidence-based classifiers**

`classifyUkEligibility` returns `{ eligible, evidence, reason }`, where `reason` is one of `explicit_uk_location`, `explicit_uk_remote`, `non_uk`, or `ambiguous`. Use word-boundary patterns for all four nations, `United Kingdom`, `UK`, recognised UK regions, and UK-wide remote phrases. A bare `Remote` is ambiguous and rejected.

Run the false-positive cases `Ukraine`, `UK time preferred`, `Europe or UK time zones`, and `New England`; none may count as explicit UK work eligibility without separate employment-location evidence.

Implement order-specific employment rules so `fixed-term contract` maps to `fixed_term` before the general `contract` rule. `inside IR35` and `outside IR35` are the only status-setting phrases; `IR35 status to be determined` remains `unknown`.

- [x] **Step 4: Implement the access transition state machine**

Create `access.ts`:

```ts
import { z } from "zod";

export const accessStatuses = ["pending", "approved", "rejected", "suspended"] as const;
export const accessStatusSchema = z.enum(accessStatuses);
export type AccessStatus = z.infer<typeof accessStatusSchema>;

const transitions: Record<AccessStatus, readonly AccessStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved"],
};

export function canTransitionAccess(from: AccessStatus, to: AccessStatus): boolean {
  return transitions[from].includes(to);
}

export const decideAccessInputSchema = z.object({
  userId: z.string().uuid(),
  nextStatus: accessStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
```

Test every allowed transition and reject self-transitions plus all other combinations.

- [x] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @jobwarden/domain test
pnpm --filter @jobwarden/domain typecheck
pnpm lint
git diff --check
```

Commit:

```bash
git add packages/domain pnpm-lock.yaml
git commit -m "feat: add UK job domain rules"
```

---

## Task 3: Build the read-only Greenhouse adapter and normalisation pipeline

**Files:**

- Create: `packages/ingestion/package.json`
- Create: `packages/ingestion/tsconfig.json`
- Create: `packages/ingestion/vitest.config.ts`
- Create: `packages/ingestion/src/types.ts`
- Create: `packages/ingestion/src/greenhouse.ts`
- Create: `packages/ingestion/src/normalise.ts`
- Create: `packages/ingestion/src/hash.ts`
- Create: `packages/ingestion/src/retry.ts`
- Create: `packages/ingestion/src/index.ts`
- Create: `packages/ingestion/src/greenhouse.test.ts`
- Create: `packages/ingestion/src/normalise.test.ts`
- Create: `packages/ingestion/src/fixtures/greenhouse-uk.json`
- Create: `packages/ingestion/src/fixtures/greenhouse-mixed.json`

- [x] **Step 1: Define the adapter boundary and failing fixture tests**

Create `@jobwarden/ingestion` as a private ESM package with `@jobwarden/domain`, Zod 4, and `sanitize-html` as runtime dependencies and Vitest plus `@types/sanitize-html` as development dependencies.

Create exact interfaces:

```ts
export type JobSource = {
  id: string;
  provider: "greenhouse";
  boardToken: string;
  employerName: string;
  allowedHosts: readonly string[];
};

export type ProviderJob = {
  providerJobId: string;
  title: string;
  location: string;
  descriptionHtml: string;
  absoluteUrl: string;
  updatedAt: string | null;
  metadataText: string[];
};

export interface ProviderAdapter {
  fetchJobs(source: JobSource, signal?: AbortSignal): Promise<ProviderJob[]>;
}

export type NormalisationResult =
  | { outcome: "eligible"; job: import("@jobwarden/domain").NormalisedJob }
  | { outcome: "quarantined"; reason: "ambiguous_uk_eligibility" | "invalid_application_url"; providerJobId: string }
  | { outcome: "excluded"; reason: "non_uk"; providerJobId: string };
```

Fixtures must include a London permanent role, a UK-remote outside-IR35 role, a Europe-remote role, an ambiguous remote role, and a US role. Write tests expecting exactly two eligible jobs, one excluded Europe role, one excluded US role, and one quarantined ambiguous role.

- [x] **Step 2: Prove the tests fail**

Run:

```bash
pnpm --filter @jobwarden/ingestion test
```

Expected: missing implementation failures.

- [x] **Step 3: Validate the Greenhouse response and enforce read-only network behaviour**

Implement a Zod schema for `jobs[].id`, `title`, `location.name`, `content`, `absolute_url`, `updated_at`, and `metadata`. Construct only:

```ts
const endpoint = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs`);
endpoint.searchParams.set("content", "true");
```

Call `fetch` with `method: "GET"`, `redirect: "error"`, `Accept: application/json`, and `User-Agent: JobWarden/0.1 (+private UK job index)`. Combine the caller's signal with an 8-second timeout. Retry only network failures, `408`, `429`, and `5xx`, at most twice, respecting a capped `Retry-After`. Never retry other `4xx` responses.

Test the method, endpoint, headers, timeout, response validation, transient retry count, no retry on `403`, and sanitised error objects that omit response bodies.

- [x] **Step 4: Normalise, sanitise, allowlist, and hash**

Use `sanitize-html` with no allowed tags or attributes to convert content to plain text, collapse whitespace, and decode entities. Validate `absoluteUrl` as HTTPS and require its hostname to equal or be a subdomain of an explicit source host. Do not accept a host because it merely ends with the same characters; compare `host === allowed` or `host.endsWith('.' + allowed)`.

Hash a canonical JSON object containing only normalised fields, with keys in fixed order, using SHA-256. Do not include `lastSeenAt` or run timestamps in the content hash.

Test malicious HTML, a `javascript:` URL, `boards.greenhouse.io.evil.example`, reordered metadata, unchanged content, explicit salary, and missing salary.

- [x] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @jobwarden/ingestion test
pnpm --filter @jobwarden/ingestion typecheck
pnpm test
pnpm check:guardrails
git diff --check
```

Commit:

```bash
git add packages/ingestion packages/domain pnpm-lock.yaml
git commit -m "feat: add Greenhouse ingestion pipeline"
```

---

## Task 4: Create the Supabase schema, RLS boundaries, transactional mutations, and database tests

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607170001_foundation.sql`
- Create: `supabase/migrations/202607170002_rls_and_functions.sql`
- Create: `supabase/migrations/202607170003_audit_and_ingestion.sql`
- Create: `supabase/tests/001_access_rls.sql`
- Create: `supabase/tests/002_jobs_rls.sql`
- Create: `supabase/tests/003_ingestion.sql`
- Create: `supabase/seed.sql`
- Create: `scripts/bootstrap-admin.mjs`
- Create: `scripts/bootstrap-admin.test.ts`

- [x] **Step 1: Initialise local Supabase and write failing pgTAP tests**

Run:

```bash
pnpm dlx supabase@latest init
```

Write pgTAP tests that create one pending user, one approved user, one suspended user, and one administrator. Assert:

- pending and suspended users select zero job rows;
- approved users select active jobs only and cannot insert/update/delete;
- administrators can read all access requests and ingestion data;
- non-administrators cannot execute access decisions or source mutations;
- `audit_log` rejects updates and deletes for all authenticated callers;
- two upserts for the same `(source_id, provider_job_id)` produce one job;
- one omission keeps a job active and two consecutive successful omissions close it;
- a failed source run never increments omissions or closes jobs.

Run after creating only test files:

```bash
pnpm dlx supabase@latest db test
```

Expected: failure because schema objects are absent. If Docker is not available, record that prerequisite in the task handoff, continue with SQL lint/static checks, and run the pgTAP suite before declaring the foundation deployable.

- [x] **Step 2: Create constrained tables and indexes**

Use UUID primary keys, `timestamptz`, `check` constraints matching the domain constants, foreign keys, and indexes supporting the feed filters. Required uniqueness and checks include:

```sql
alter table public.jobs
  add constraint jobs_provider_identity_unique unique (source_id, provider_job_id),
  add constraint jobs_country_gb check (country_code = 'GB'),
  add constraint jobs_https_application check (application_url ~ '^https://'),
  add constraint jobs_omissions_nonnegative check (consecutive_successful_omissions >= 0);

create index jobs_feed_idx on public.jobs (lifecycle_status, posted_at desc);
create index jobs_filter_idx on public.jobs (employment_type, working_time, workplace_type, ir35_status);
create index access_requests_status_idx on public.access_requests (status, requested_at);
create index ingestion_runs_started_idx on public.ingestion_runs (started_at desc);
```

Keep `job_sources.board_token` readable only to administrators and the ingestion service. Do not put secrets in source rows; cron authentication belongs in Vault.

- [x] **Step 3: Add identity creation without automatic approval**

Create a private `app_settings` singleton with `allow_access_requests boolean not null default true`. Add an `auth.users` trigger that creates a profile and a pending access request only when requests are enabled. It must never insert `approved` or `admin`.

Use `coalesce(new.raw_user_meta_data ->> 'full_name', 'JobWarden user')` only as display text; never use metadata for authorisation.

- [x] **Step 4: Add RLS helper functions and policies**

Implement `public.has_approved_access()` and `public.is_admin()` as stable `security definer` SQL functions with `set search_path = ''`, fully qualified table names, and execute permission only for `authenticated`. Enable and force RLS on every public table.

The jobs select policy must be exactly equivalent to:

```sql
create policy "approved users read active jobs"
on public.jobs for select to authenticated
using (public.has_approved_access() and lifecycle_status = 'active');
```

Use an additional administrator policy for closed/quarantined jobs. Never add direct browser mutation policies for jobs, roles, audit entries, or access decisions.

- [x] **Step 5: Add transactional access and source functions**

Implement `public.decide_access_request(target_user_id uuid, next_status text, decision_reason text)` as `security definer`, check `is_admin()`, lock the target row, validate the same transition matrix as the domain package, update the decision fields, and insert a redacted audit row in one transaction. Reject reasons outside 3–500 characters.

Implement narrowly scoped `public.set_access_requests_enabled(enabled boolean)` and `public.upsert_job_source(...)` functions with the same administrator check and audit pattern. Revoke all function execution from `public` and `anon`; grant only the intended authenticated/admin or service path.

- [x] **Step 6: Add atomic ingestion functions**

Implement database functions that:

- create a run and source-run record;
- obtain a transaction-scoped advisory lock derived from the source UUID;
- upsert a validated GB job;
- update only `last_seen_at` when the content hash is unchanged;
- reset omission count for seen jobs;
- increment omission count only after a successful complete source response;
- close at count two;
- never delete jobs because a source failed;
- finalise run counts and sanitised error codes.

Accept structured JSON only through a Zod-validated Edge Function and still enforce all database constraints.

- [x] **Step 7: Implement a safe one-time administrator bootstrap**

`scripts/bootstrap-admin.mjs` must require `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_BOOTSTRAP_USER_ID`; validate the user ID as UUID; fetch that exact identity; require a confirmed email or confirmed external identity; insert the `admin` role idempotently; and write `admin.bootstrap` to the audit log. It must not accept an email address and must not print the service key or user details.

Unit-test missing variables, invalid UUID, unverified identity, idempotent rerun, and redacted output by injecting a fake Supabase client into the script's exported function.

- [ ] **Step 8: Verify and commit**

Implementation, focused tests, static verification, PGlite fallback checks, independent review, and commits are complete. The checkbox remains open because Docker is unavailable and the required real Supabase reset, local lint, and pgTAP run have not executed. Do not describe Task 4 as deployable until they pass.

Run:

```bash
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db test
pnpm vitest run scripts/bootstrap-admin.test.ts
pnpm test
git diff --check
```

Expected: migrations apply from zero, pgTAP passes, and the bootstrap tests pass.

Commit:

```bash
git add supabase scripts package.json pnpm-lock.yaml
git commit -m "feat: secure JobWarden data model"
```

---

## Task 5: Add Supabase authentication, pending access, and server-side route gates

**Files:**

- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/auth/access.ts`
- Create: `apps/web/src/lib/auth/access.test.ts`
- Create: `apps/web/src/app/auth/sign-in/page.tsx`
- Create: `apps/web/src/app/auth/sign-in/actions.ts`
- Create: `apps/web/src/app/auth/callback/route.ts`
- Create: `apps/web/src/app/access/pending/page.tsx`
- Create: `apps/web/src/app/(protected)/layout.tsx`
- Create: `apps/web/src/app/(protected)/error.tsx`
- Create: `apps/web/src/app/(protected)/loading.tsx`
- Create: `apps/web/src/components/auth/sign-out-button.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [x] **Step 1: Add server/client environment schemas and failing access tests**

Install `@supabase/supabase-js@2.110.7`, `@supabase/ssr@0.12.3`, `server-only`, and Zod 4 in `@jobwarden/web`. Add Vitest, jsdom, React Testing Library, `@testing-library/jest-dom`, and `@testing-library/user-event` as development dependencies, then configure `apps/web/vitest.config.ts` with the `@/` alias and a jsdom setup file.

Use one public-only web schema so importing it cannot expose server values:

```ts
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: exactHttpOriginSchema,
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_[A-Za-z0-9_-]{20,}$/),
});
```

`NEXT_PUBLIC_SITE_URL` must parse to an exact `http:` or `https:` origin with no credentials, non-root path, query, or fragment. Normalise it to `URL.origin`. Do not add a server environment schema to `apps/web`; server-only bootstrap and ingestion credentials stay outside the web application.

Write access tests using an injected repository. Cover unauthenticated -> `/auth/sign-in`, pending/rejected/suspended -> `/access/pending`, approved -> allowed, and admin requirement -> `notFound()` or a safe 404 result.

- [x] **Step 2: Implement cookie-safe Supabase clients**

Use current `@supabase/ssr` and the Next.js async `cookies()` API. The browser client receives only URL and publishable key. The server client forwards cookie reads/writes and never imports `SUPABASE_SERVICE_ROLE_KEY`.

Add the official session-refresh proxy. Its `setAll(cookies, headers)` implementation must preserve every cookie option supported by Next.js, including `priority`, and must copy Supabase's `Cache-Control`, `Expires`, and `Pragma` headers after recreating `NextResponse`. The proxy refreshes cookies only; it is never an authorisation boundary. Callback responses that can set session cookies must also carry equivalent no-store headers.

Create a separate, explicitly server-only service client only in ingestion/bootstrap code. Add `import "server-only"` to every module that can read server secrets.

- [x] **Step 3: Implement Google OAuth with PKCE and safe redirects**

The sign-in Server Action calls Google OAuth with a callback to `/auth/callback?next=/jobs`, built from `NEXT_PUBLIC_SITE_URL` rather than request `Host` or `X-Forwarded-Host`. The callback exchanges the code for a session. Validate redirect paths across at most two decode layers: require exactly one leading slash; reject malformed encoding, raw/encoded/double-encoded slash or backslash tricks, C0/C1 controls, protocol-relative paths, and external targets; resolve against the configured HTTP(S) origin and enforce the same origin. Invalid values use `/jobs`. Show generic errors without tokens, provider payloads, or email addresses.

- [x] **Step 4: Implement access guards in the protected layout**

Fetch the authenticated user with the server client, then query only the caller's own access row. Redirect on the server before rendering protected content. The admin layout uses a separate `requireAdmin()` helper and does not rely on navigation visibility.

Do not add Next.js middleware as the authorisation boundary. RLS remains authoritative, and layout guards provide navigation and UX protection. Add a minimal protected `/jobs` destination so the OAuth callback never lands on a 404 before Task 6. Add a separate protected `/admin` layout using `requireAdmin()` before Task 7 supplies the full administrator screens.

- [x] **Step 5: Build designed public, pending, loading, and error states**

Use Geist, light-first warm-neutral surfaces, dark ink, one restrained blue action colour, asymmetric responsive composition, modest radii, keyboard-visible focus, and semantic public, sign-in, pending, rejected, suspended, closed-beta, loading, error, and protected holding states. Avoid dashboard-card soup, gradients, glass, decorative UK motifs, pricing or premium language, fake job data, and automatic approval claims. The pending page must explain that the owner manually reviews requests and must not imply a subscription, purchase, priority queue, or automatic approval. Keep Geist variables on the root element and use literal Geist family names in the Tailwind v4 theme mapping.

- [x] **Step 6: Verify and commit**

Add `docs/setup/supabase-google-auth.md` with current Supabase project, Google provider, exact callback allowlist, public local environment, migration, first-sign-in, and atomic administrator-bootstrap instructions. Never request secrets in chat. State that live OAuth needs user configuration and that Task 4 remains undeployable until the Docker-backed reset, lint, and pgTAP checks pass.

Update `docs/product/source-coverage.md` without implementing adapters: Reed is a documented API candidate; LinkedIn must not be crawled without express permission; Indeed requires an authorised feed or written permission; Glassdoor requires confirmed access and display/attribution terms.

Run:

```bash
pnpm --filter @jobwarden/web test
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web build
pnpm check:guardrails
git diff --check
```

Commit:

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: enforce private beta access"
```

---

## Task 6: Build the responsive app shell and UK jobs feed vertical slice

**Execution note (owner-approved, 2026-07-17):** Authentication operation is deferred. Execute this task from `docs/superpowers/plans/2026-07-17-jobwarden-task-6-jobs-feed.md`, which adds the fail-closed local development mode and fixture-backed repository seam without changing production auth or RLS.

**Files:**

- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/mobile-navigation.tsx`
- Create: `apps/web/src/components/jobs/job-card.tsx`
- Create: `apps/web/src/components/jobs/job-filters.tsx`
- Create: `apps/web/src/components/jobs/job-list.tsx`
- Create: `apps/web/src/lib/jobs/filters.ts`
- Create: `apps/web/src/lib/jobs/queries.ts`
- Create: `apps/web/src/lib/jobs/filters.test.ts`
- Create: `apps/web/src/app/(protected)/jobs/page.tsx`
- Create: `apps/web/src/app/(protected)/jobs/[jobId]/page.tsx`
- Create: `apps/web/src/app/(protected)/jobs/loading.tsx`
- Create: `apps/web/src/app/(protected)/jobs/error.tsx`
- Create: `apps/web/src/app/(protected)/jobs/not-found.tsx`
- Create: `apps/web/src/app/(protected)/jobs/opengraph-image.tsx`

- [ ] **Step 1: Write failing URL-filter and query tests**

Install `vitest-axe` as a web development dependency for component accessibility assertions.

Define the URL schema:

```ts
export const jobFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  employment: z.enum([...employmentTypes, "all"]).catch("all"),
  workingTime: z.enum([...workingTimes, "all"]).catch("all"),
  workplace: z.enum([...workplaceTypes, "all"]).catch("all"),
  ir35: z.enum([...ir35Statuses, "all"]).catch("all"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
```

Test valid filters, unexpected values falling back safely, search strings over 100 characters, page bounds, and empty results. Query tests must assert active-only filtering, stable `posted_at desc, id desc` ordering, a fixed page size of 25, and no service-role client usage.

- [ ] **Step 2: Implement one consistent feed layout**

Use a responsive list only: no card/table switcher. Each job row shows title, employer, UK location, workplace, employment type, working time, compensation when explicit, IR35 when relevant, posting date, and a details link. Include designed loading skeletons, no-results guidance, source-unavailable error copy, and an empty database state.

Keep summary information to two values: current result count and last successful ingestion time. Do not add match scores, AI explanations, premium labels, usage counts, or upgrade banners.

- [ ] **Step 3: Implement URL-backed filters progressively**

The filter form uses `GET`, so it works without client JavaScript. Add an enhanced client submit only if it preserves the same URL. Include a clear-all link and announce result-count changes accessibly. Mobile controls use a compact drawer without hiding active filter values.

- [ ] **Step 4: Implement the job detail and safe application link**

Fetch by UUID through the caller's RLS-bound Supabase client. Render sanitised plain text, explicit classification evidence, source attribution, and a prominent `Apply on employer site` link with `target="_blank"` and `rel="noopener noreferrer"`. Never embed or POST the external application form.

- [ ] **Step 5: Test the user-visible states**

Use React Testing Library to verify semantic headings, labelled filters, keyboard focus, omitted unknown compensation, explicit unknown IR35 copy for contracts, and no forbidden pricing or AI language. Add axe checks for the feed, no-results, and detail states.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @jobwarden/web test
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web build
pnpm check:guardrails
git diff --check
```

Commit:

```bash
git add apps/web
git commit -m "feat: add approved user jobs feed"
```

---

## Roadmap supersession after Task 6

Tasks 1–6 in this foundation plan are the reviewed historical foundation. On 2026-07-18 the owner approved the expanded [personalised search design](../specs/2026-07-18-personalised-job-search-design.md) and [canonical product roadmap](../../product/roadmap.md). The summaries below remain useful foundation context, but their former Tasks 9–10 sequence is superseded by canonical Tasks 9–16. Create and follow a focused task plan from the canonical roadmap before changing further code.

## Task 7: Add audited administrator access, sources, and ingestion screens

**Files:**

- Create: `apps/web/src/app/(protected)/admin/layout.tsx`
- Create: `apps/web/src/app/(protected)/admin/access/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/access/actions.ts`
- Create: `apps/web/src/app/(protected)/admin/sources/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/sources/actions.ts`
- Create: `apps/web/src/app/(protected)/admin/ingestion/page.tsx`
- Create: `apps/web/src/app/(protected)/admin/ingestion/actions.ts`
- Create: `apps/web/src/components/admin/access-request-row.tsx`
- Create: `apps/web/src/components/admin/source-form.tsx`
- Create: `apps/web/src/components/admin/run-status.tsx`
- Create: `apps/web/src/lib/admin/actions.test.ts`

- [ ] **Step 1: Write failing action tests around trusted identity**

For every Server Action, inject the authenticated Supabase client in unit tests and assert it ignores any submitted actor ID or role. Test unauthenticated, approved non-admin, admin, malformed UUID, illegal access transition, short decision reason, unsafe board token, invalid host, CSRF-origin mismatch, and database error paths.

The browser sends only target resource values. The database obtains the actor from `auth.uid()`.

- [ ] **Step 2: Implement access decisions with confirmation and visible outcomes**

Parse form data with `decideAccessInputSchema`, call the transactional database function, revalidate `/admin/access`, and return a discriminated action state. Approve, reject, suspend, and restore actions require a reason and a confirmation step. Do not expose emails in URL query strings or analytics.

- [ ] **Step 3: Implement source compliance management**

The source form accepts provider `greenhouse`, board token, employer, expected application hosts, minimum sync interval no lower than 15 minutes, terms review date, robots review date, and compliance notes. It never accepts an arbitrary API base URL. Show enabled/disabled, last successful sync, and review age.

- [ ] **Step 4: Implement ingestion visibility and bounded manual trigger**

Show overall and per-source run status, received/eligible/upserted/unchanged/closed counts, duration, last success, and sanitised error code. A manual run button calls a narrowly scoped database/Edge Function path, rate-limited to one requested run per source per minimum interval. Disable duplicate submissions and show a correlation ID, not raw errors.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @jobwarden/web test
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web build
pnpm check:guardrails
git diff --check
```

Commit:

```bash
git add apps/web
git commit -m "feat: add private beta administration"
```

---

## Task 8: Wire the Supabase ingestion Edge Function and scheduled invocation

**Files:**

- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/ingest-jobs/index.ts`
- Create: `supabase/functions/ingest-jobs/handler.ts`
- Create: `supabase/functions/ingest-jobs/handler.test.ts`
- Create: `supabase/functions/ingest-jobs/deno.json`
- Create: `supabase/migrations/202607170004_ingestion_schedule.sql`
- Create: `docs/operations/ingestion.md`

- [ ] **Step 1: Write failing handler tests independent of Deno HTTP startup**

Export `createIngestionHandler(dependencies)` and test:

- only `POST` is accepted;
- the bearer secret is compared in constant time;
- missing or invalid secrets return the same `401` body;
- an admin manual-run token is validated through Supabase rather than trusted from request JSON;
- disabled and too-recent sources are skipped;
- one source failure does not abort later sources;
- source failure never invokes omission finalisation;
- successful complete responses do invoke omission finalisation;
- logs contain correlation IDs and counts but no headers, descriptions, payloads, emails, tokens, or board responses.

- [ ] **Step 2: Implement the thin Edge Function wrapper**

Read environment values inside the request handler, not module initialisation. Validate `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `INGESTION_CRON_SECRET` with Zod. Instantiate clients lazily per invocation. Return JSON with `correlationId`, status, and aggregate counts only.

The handler selects enabled Greenhouse sources, calls `@jobwarden/ingestion`, validates every normalised job again, uses atomic database functions, and finalises each source independently. Cap one invocation at a documented source/job count and record `partial` if the cap is reached.

- [ ] **Step 3: Configure Cron through Vault without embedding a secret**

The migration must enable `pg_cron`, `pg_net`, and Vault usage, then schedule the function using secret references. It must not contain a project URL or token literal. Put the required one-time SQL/CLI setup in `docs/operations/ingestion.md`, including how to rotate the secret, pause the schedule, inspect runs, and recover from quota exhaustion.

- [ ] **Step 4: Verify recorded and optional live ingestion**

Run fixture-backed tests on every checkout:

```bash
pnpm vitest run supabase/functions/ingest-jobs/handler.test.ts
pnpm test
```

When local Supabase is available, serve the function and invoke it with the local cron secret. Verify a second identical invocation changes `last_seen_at` without duplicating jobs or audit noise. Then force one and two successful omissions and verify the lifecycle sequence.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm dlx supabase@latest functions serve ingest-jobs --no-verify-jwt
pnpm dlx supabase@latest db test
pnpm test
pnpm check:guardrails
git diff --check
```

Stop the local server after the smoke test.

Commit:

```bash
git add supabase docs/operations package.json pnpm-lock.yaml
git commit -m "feat: schedule safe Greenhouse ingestion"
```

---

## Task 9: Add privacy-safe observability, account controls, and health reporting

**Files:**

- Create: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/instrumentation-client.ts`
- Create: `apps/web/src/lib/observability/sentry.ts`
- Create: `apps/web/src/lib/analytics/index.ts`
- Create: `apps/web/src/lib/analytics/index.test.ts`
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/app/api/health/route.test.ts`
- Create: `apps/web/src/app/(protected)/settings/account/page.tsx`
- Create: `apps/web/src/app/(protected)/settings/account/actions.ts`
- Create: `docs/privacy/data-map.md`
- Create: `docs/privacy/retention.md`

- [ ] **Step 1: Write failing observability boundary tests**

Assert that missing Sentry configuration is a no-op; the browser analytics module performs no network or dynamic SDK import; error scrubbing removes `authorization`, `cookie`, email, access token, job description, source response, and request body fields; and health output never exposes environment values.

- [ ] **Step 2: Configure optional Sentry EU without default PII**

Install `@sentry/nextjs`. Initialise only when `NEXT_PUBLIC_SENTRY_DSN` is present. Set `sendDefaultPii: false`, a conservative trace sample rate, and `beforeSend` scrubbing. Do not attach user email, source content, job descriptions, request bodies, cookies, or authorisation headers. Document that the project itself must be created in Sentry's EU region.

- [ ] **Step 3: Keep analytics explicitly disabled**

Export a typed event vocabulary and a no-op implementation:

```ts
export type AnalyticsEvent =
  | { name: "jobs_filter_applied"; properties: { filterCount: number } }
  | { name: "job_opened"; properties: { jobId: string } };

export function captureAnalytics(_event: AnalyticsEvent): void {
  return;
}
```

Do not install PostHog. Add documentation stating that affirmative consent, a cookie experience, a data-processing review, and event re-review are prerequisites for enabling it.

- [ ] **Step 4: Add honest health and account states**

`/api/health` returns deployment version, application status, and a shallow database check with a short timeout; it returns degraded when Supabase is unavailable and never claims ingestion is healthy based only on web uptime. The admin ingestion page separately displays last successful sync.

The account page shows profile and access status, exports the user's own profile/access record as JSON, and records an account-deletion request for administrator processing. It does not promise immediate deletion where audit/legal retention applies. Document each data category, controller purpose, access, retention, deletion handling, and processors.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @jobwarden/web test
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web build
pnpm check:guardrails
git diff --check
```

Commit:

```bash
git add apps/web docs/privacy package.json pnpm-lock.yaml
git commit -m "feat: add privacy safe operations"
```

---

## Task 10: Configure Cloudflare, CI security checks, and full-path verification

**Files:**

- Create: `apps/web/open-next.config.ts`
- Create: `apps/web/wrangler.jsonc`
- Create: `apps/web/cloudflare-env.d.ts`
- Modify: `apps/web/package.json`
- Create: `.github/workflows/ci.yml`
- Create: `.gitleaks.toml`
- Create: `.semgrep.yml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/private-access.spec.ts`
- Create: `tests/e2e/jobs.spec.ts`
- Create: `tests/e2e/admin.spec.ts`
- Create: `docs/operations/deployment.md`
- Create: `docs/operations/recovery.md`
- Create: `docs/architecture/decisions/0001-platform.md`
- Create: `docs/architecture/decisions/0002-private-access.md`
- Create: `docs/architecture/decisions/0003-ingestion.md`
- Modify: `README.md`

- [ ] **Step 1: Configure OpenNext for Cloudflare Workers**

Install `@opennextjs/cloudflare@1.20.1` and `wrangler` as web dev dependencies. Create `open-next.config.ts`:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
```

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "jobwarden-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-07-17",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  }
}
```

Add scripts:

```json
{
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
}
```

Run `pnpm --filter @jobwarden/web cf-typegen` and commit the generated type file.

- [ ] **Step 2: Add deterministic end-to-end fixtures and tests**

Install `@playwright/test` at the workspace root and install Chromium with `pnpm exec playwright install chromium` before the first local run.

Use a seeded local Supabase or a test repository adapter, never production identities. Test:

1. an unauthenticated visitor is sent to sign-in;
2. a new authenticated identity sees pending access;
3. an administrator approves it and an audit row exists;
4. the approved user filters UK jobs and opens details;
5. the application button points to the allowlisted external HTTPS URL;
6. suspending the user removes access on the next server request;
7. a pending user cannot retrieve jobs directly through Supabase;
8. mobile navigation and filter drawer work at 390px width;
9. no page contains pricing, premium, upgrade, trial, or billing UI.

Record screenshots for the jobs feed, pending state, admin access list, and mobile filter state as CI artifacts on failure only.

- [ ] **Step 3: Add least-privilege CI and security scanning**

`ci.yml` uses pinned action commit SHAs, top-level permissions `contents: read`, pnpm lockfile caching, Node 24, and jobs for format, lint, strict typecheck, unit tests, pgTAP when Docker is available, build, Gitleaks, Semgrep, and dependency audit. It must not receive deployment or Supabase secrets on pull requests.

The Semgrep rules reject service-role key references from `apps/web/src` except explicitly server-only files, unvalidated redirect parameters, `dangerouslySetInnerHTML`, and fetches to non-allowlisted ingestion bases. Configure dependency audit to fail on high or critical production vulnerabilities and document justified exceptions with expiry dates.

- [ ] **Step 4: Document setup, deployment, DNS, and recovery**

`README.md` must take a clean checkout through install, local environment, migrations, Google OAuth callback configuration, admin bootstrap by UUID, fixture ingestion, development, tests, and Cloudflare preview. Deployment docs must explain:

- Cloudflare Workers is the web host; Pages is not the target;
- the domain may stay registered at its current registrar;
- Cloudflare DNS is optional until the owner chooses to delegate nameservers;
- Supabase, Sentry EU, and Cloudflare environment variables are entered in their dashboards/CLI, never committed;
- there are no payment, email, cache, or vector-database services to configure;
- how to pause access requests, disable a source, rotate secrets, roll back web deployment, restore the database, and communicate an incident.

Architecture records must capture the alternatives considered and the reason for Supabase Auth, Cloudflare Workers, private approval, rule-based UK classification, and Greenhouse-first ingestion.

- [ ] **Step 5: Run the complete local verification story**

Run from a clean checkout state:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:guardrails
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db test
pnpm --filter @jobwarden/web build
pnpm --filter @jobwarden/web preview
```

While preview is running, execute Playwright and smoke `/`, `/auth/sign-in`, `/access/pending`, `/jobs`, `/admin/access`, and `/api/health` under their correct fixture identities. Then stop preview.

Expected: all commands pass; denied identities receive no jobs even through direct API queries; the OpenNext preview serves the same route and access behaviour as Next development; optional integrations may be absent.

- [ ] **Step 6: Audit the scaffold against the approved specification**

Check each success criterion in the design spec and record evidence in the pull request or handoff. Run:

```bash
rg -n "TODO|TBD|FIXME|placeholder|coming soon" . --glob '!pnpm-lock.yaml' --glob '!docs/superpowers/plans/**'
rg -n "stripe|checkout|subscription|pricing|premium|upgrade|trial|billing" apps packages supabase --ignore-case
rg -n "SUPABASE_SERVICE_ROLE_KEY" apps/web/src
git diff --check
git status --short
```

Expected: no unfinished placeholders; no product payment concepts; service-role references occur only in reviewed server-only operational code or are absent from the web application; worktree contains only intended files.

- [ ] **Step 7: Commit the deployable scaffold**

```bash
git add .github .gitleaks.toml .semgrep.yml apps/web docs playwright.config.ts tests README.md package.json pnpm-lock.yaml
git commit -m "chore: harden JobWarden delivery"
```

---

## Final Acceptance Checklist

- [ ] A fresh Google-authenticated identity has `pending` access and cannot select jobs.
- [ ] The owner can bootstrap exactly one administrator by verified UUID without email or metadata elevation.
- [ ] All access decisions are legal state transitions, transactional, and audited.
- [ ] One allowlisted Greenhouse board produces only explicit UK or UK-qualified remote vacancies.
- [ ] Contract, working-time, workplace, compensation, and IR35 fields preserve `unknown` rather than guessing.
- [ ] Repeated identical ingestion is idempotent; source failure cannot close jobs; two successful omissions can.
- [ ] Approved users can use a responsive, URL-filtered feed and follow a manual application link.
- [ ] Pending, rejected, suspended, and non-admin users are denied both in the UI and by RLS.
- [ ] No pricing, payment, premium, upgrade, trial, billing, or plan-entitlement code or UI exists.
- [ ] No Clerk, Resend, PostHog browser SDK, Upstash, Pinecone, generic scraper, or auto-apply code exists.
- [ ] The app builds without optional Sentry credentials and analytics remains a no-op.
- [ ] Cloudflare OpenNext preview, pgTAP, unit tests, end-to-end tests, secret scan, dependency audit, and production build pass.
- [ ] `AGENTS.md`, `CLAUDE.md`, the canonical shipping standard, approved design, architecture decisions, operations guides, and this plan remain in the repository.
