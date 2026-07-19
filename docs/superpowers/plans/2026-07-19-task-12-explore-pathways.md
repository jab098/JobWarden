# Task 12 Explore and Career Pathways Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the opt-in Explore feed that suggests only credible adjacent career pathways — at least 70% weighted core-skill overlap with the user's confirmed evidence, at most two significant trainable gaps, and outside the user's active target role families — with visible overlap, gaps, and evidence, plus dismiss, disable, and promote-to-search-profile controls and CV-free aggregate pathway analytics.

**Architecture:** A pure deterministic domain module in `@jobwarden/domain` holds a curated UK pathway taxonomy (role family → weighted core skills) and an evaluator that matches only exact normalised evidence concepts (never title or keyword coincidence). Migration 12 adds owner-only `career_explore_settings` and `career_pathway_decisions` tables plus an ownerless, schema-constrained `explore_pathway_analytics` counter table, all forced-RLS, with security-definer RPCs that take the existing per-owner generation fence. The web app gets an `apps/web/src/lib/explore/` repository (development-fixtures / Supabase split identical to the target feed) and a `/explore` route with opt-in, suggestion, dismiss/restore, promote, and disable experiences. Promotion reuses the existing `ProfileRepository.saveSearch` path so a promoted pathway becomes a normal named search profile and disappears from Explore because it is now an active target role family.

**Tech Stack:** TypeScript, Zod, Next.js App Router, Supabase Postgres/RLS/RPC, Vitest + Testing Library, Tailwind, existing `apps/web/src/components/ui` primitives.

## Global Constraints

- Explore is opt-in and disabled by default; disabling hides the feed entirely.
- Every suggestion meets the 70% weighted core-skill threshold (inclusive, integer arithmetic: `matchedWeight * 100 >= totalWeight * 70`) and has no more than two significant gaps; anything else is absent even when keywords overlap.
- Matching is deterministic and evidence-bound: only exact normalised-concept equality against **confirmed** evidence in categories `skill`, `tool`, `responsibility` earns overlap credit. No AI, no fuzzy text match.
- Unknown is never a negative inference; suggestions never modify the user's selected targets silently.
- Aggregate pathway analytics carry only a schema-constrained pathway concept, an event name, and a counter — no owner column, no free text, no CV snippets.
- Fictional fixtures only; no CV text in logs, analytics, errors, or URLs. Real CV upload stays disabled; nothing touches that boundary.
- No payments/pricing UI, no auto-apply, no new paid dependency.
- UI follows `docs/design/ui-direction.md` (quiet neutral surfaces with state dots, no coloured `border-l-2` callouts); verify in a real browser at 1440 px and true 390 px.
- After each task run the focused tests plus `corepack pnpm --filter <package> typecheck`; the full gate runs in Task 5.

---

### Task 1: Deterministic Explore pathway engine (domain)

**Files:**
- Create: `packages/domain/src/explore.ts`
- Create: `packages/domain/src/explore.test.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./explore.ts";`)

**Interfaces:**
- Consumes: `CareerEvidenceItem` from `career-profile.ts` (caller passes confirmed items or the evaluator filters to `confirmationState === "confirmed"` itself — the evaluator filters itself so a careless caller cannot leak proposed evidence into credit).
- Produces (exact contract later tasks rely on):

```ts
export interface PathwayCoreSkill {
  normalizedConcept: string; // same normalised-concept grammar as career-profile
  label: string;
  weight: 1 | 2 | 3; // relative importance in the weighted overlap
  significant: boolean; // an unmatched significant skill counts toward the two-gap ceiling
}

export interface CareerPathway {
  normalizedConcept: string; // curated role-family concept
  label: string;
  summary: string; // generic, non-personal description of the pathway
  coreSkills: readonly PathwayCoreSkill[]; // 5..12 entries, unique concepts
}

export const careerPathways: readonly CareerPathway[]; // curated UK taxonomy

export interface ExploreSuggestion {
  pathway: Pick<CareerPathway, "normalizedConcept" | "label" | "summary">;
  overlapPercent: number; // integer, floor(matchedWeight * 100 / totalWeight)
  matchedSkills: readonly {
    label: string; // pathway core-skill label
    significant: boolean;
    evidenceLabels: readonly string[]; // labels of the confirmed evidence items that matched
  }[];
  gaps: readonly { label: string; significant: boolean }[];
}

export function evaluateExplorePathways(
  evidence: readonly CareerEvidenceItem[],
  activeTargetRoleFamilyConcepts: readonly string[],
  pathways?: readonly CareerPathway[], // defaults to careerPathways
): readonly ExploreSuggestion[];
```

Rules the tests must lock in:
- Credit requires `evidence.normalizedConcept === coreSkill.normalizedConcept`, evidence confirmed, category in `skill | tool | responsibility`. Proposed/rejected evidence, other categories, and label/keyword coincidence earn nothing.
- Qualify only when `matchedWeight * 100 >= totalWeight * 70` **and** unmatched significant core skills ≤ 2 **and** the pathway concept is not in `activeTargetRoleFamilyConcepts` (compare trimmed lowercase).
- Output sorted by `overlapPercent` descending, then label ascending; `evidenceLabels` deduplicated.
- The curated taxonomy follows the spec's anonymised example: include analytics-adjacent pathways (product analytics implementation, event-data governance, analytics solutions consulting, consent-technology implementation, technical customer success for analytics platforms, marketing operations, business-intelligence development, conversion-rate optimisation) and generic role families must not qualify from incidental technical evidence alone — weights must make broad "javascript"/"sql"-only evidence fall below 70%.

- [ ] Write failing tests covering: exact-threshold inclusion (70% exactly qualifies), below-threshold absence despite keyword overlap, three-significant-gap exclusion, active-target-family exclusion, proposed-evidence exclusion, evidence-label surfacing, ordering, and taxonomy integrity (unique concepts, 5–12 core skills, valid weights).
- [ ] Implement `explore.ts` minimally; run `corepack pnpm --filter @jobwarden/domain test` and `typecheck`.
- [ ] Commit `feat: add deterministic explore pathway engine`.

### Task 2: Migration 12, pgTAP 013, and static verifier update

**Files:**
- Create: `supabase/migrations/202607190002_explore_pathways.sql`
- Create: `supabase/tests/013_explore_pathways.sql`
- Modify: `scripts/verify-supabase-foundation.mjs` (+ its test) — expected migrations 11 → 12, forced-RLS tables 21 → 24.

**Schema:**
- `public.career_explore_settings` (`owner_id uuid` PK → `auth.users` cascade, `enabled boolean not null default false`, `updated_at`). Forced RLS; owner-only select for approved users; mutations only via RPC.
- `public.career_pathway_decisions` (`id uuid` PK, `owner_id` → `auth.users` cascade, `pathway_concept text` with check `pathway_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'` and `char_length(pathway_concept) <= 120`, `decision text check in ('dismissed','promoted')`, timestamps, `unique (owner_id, pathway_concept)`). Forced RLS; owner-only select.
- `public.explore_pathway_analytics` (`pathway_concept text` same check, `event text check in ('dismissed','promoted')`, `event_count bigint not null default 0 check (event_count >= 0)`, PK `(pathway_concept, event)`). **No owner column by design.** Forced RLS with no authenticated policies; service_role only.
- RPC `public.set_explore_enabled(target_enabled boolean)` — security definer, `set search_path = ''`, approved-access check, generation fence, upsert settings row.
- RPC `public.decide_career_pathway(target_pathway_concept text, target_decision text)` — decisions `dismissed | promoted | clear`; approved-access check, generation fence; `clear` deletes the row; otherwise upsert and increment the matching analytics counter (append-only; `clear` never decrements).
- Extend `public.delete_career_profile_data()` to also delete `career_explore_settings` and `career_pathway_decisions` rows (analytics are aggregate and non-identifying, so they survive deletion — document this).

**pgTAP 013 (static, ~20 assertions):** tables + forced RLS + policies exist; decision/concept/analytics check constraints reject bad values; `explore_pathway_analytics` has exactly the three columns (no owner/user/text column); RPC existence, security-definer, and grant surface; `delete_career_profile_data` still exists.

- [ ] Write migration + pgTAP; update the static verifier expectations test-first; run `corepack pnpm check:supabase` and `corepack pnpm vitest run scripts/verify-supabase-foundation.test.ts`.
- [ ] Commit `feat: add explore pathway schema, decisions, and analytics`.

### Task 3: Explore web repository (fixtures/Supabase split)

**Files:**
- Create: `apps/web/src/lib/explore/types.ts`, `repository.ts`, `get-repository.ts`, `promoted-search.ts`, `development-explore.ts`, `supabase-explore.ts` + matching `.test.ts` files.

**Interfaces:**

```ts
export type PathwayDecision = "dismissed" | "promoted";

export type ExploreSuggestionItem = {
  suggestion: ExploreSuggestion; // from @jobwarden/domain
  decision: PathwayDecision | null;
};

export type ExploreResult = {
  enabled: boolean;
  items: readonly ExploreSuggestionItem[]; // qualifying, not dismissed/promoted
  dismissed: readonly ExploreSuggestionItem[]; // qualifying but dismissed (restorable)
  dataMode: "supabase" | "fixtures";
};

export type ExploreActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unavailable"; message: string };

export interface ExploreRepository {
  getExplore(): Promise<ExploreResult>;
  setEnabled(enabled: boolean): Promise<void>;
  decide(pathwayConcept: string, decision: "dismissed" | "clear"): Promise<void>;
  promote(pathwayConcept: string): Promise<void>;
}
```

- `promoted-search.ts`: pure `buildPromotedSearchDraft(suggestion, careerDraft: CareerProfileDraft | null): NamedSearchProfileDraft` — name = pathway label, `enabled: true`, `roleFamilies: [pathway concept/label]`, `skillConcepts` = matched core-skill labels (≤ 50), seniority copied from the career draft (else `unspecified`), everything else permissive defaults (`allowUnknown: true`, `recencyDays: 14`, `notificationsEnabled: false`, empty allow-lists). Must parse cleanly with `namedSearchProfileDraftSchema`.
- Active target role families = career draft `targetRoleFamilies` ∪ enabled saved searches' `roleFamilies` (normalised concepts).
- `supabase-explore.ts` reuses the same profile-snapshot loading approach as `supabase-target-feed.ts`; reads settings + decisions with the caller-bound client; calls the two RPCs; `promote` builds the draft, calls the profile repository `saveSearch(generation, null, draft)`, then records `promoted` via RPC.
- `development-explore.ts`: derives suggestions from the development profile snapshot with `enabled: true`; all mutations reject with `PreviewExploreUnavailableError` (same pattern as `PreviewDecisionUnavailableError`).

- [ ] TDD each module; run `corepack pnpm --filter @jobwarden/web test -- src/lib/explore` and web `typecheck`.
- [ ] Commit `feat: add explore repository with promote-to-search path`.

### Task 4: `/explore` route, actions, UI, and navigation

**Files:**
- Create: `apps/web/src/app/(protected)/explore/page.tsx`, `actions.ts`, `action-context.ts`, `loading.tsx`, `error.tsx`
- Create: `apps/web/src/components/explore/explore-view.tsx`, `explore-item.tsx`, `explore-ui.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/mobile-navigation.tsx` (add Explore nav item)

**Behaviour:**
- Actions mirror `jobs/actions.ts`: trusted-origin check, Zod-validated form data (`pathwayConcept` bounded by the normalised-concept pattern, decision enum), mapped `ExploreActionState`, `revalidatePath("/explore")`. Three actions: `setExploreEnabledAction`, `decidePathwayAction` (dismiss/restore), `promotePathwayAction` (success message links the user to `/profile`).
- Disabled state: explanation of what Explore is (adjacent careers with substantial transferable-skill overlap, opt-in, deterministic) with an enable control.
- Enabled state: suggestion cards — pathway label + summary, accessible "Overlap N%" figure, matched skills with the confirmed evidence labels used, gaps with significant ones marked, dismiss and "Promote to search profile" controls; a restorable dismissed list; a quiet disable control; empty state when nothing qualifies (must say why: threshold and gap ceiling, without implying the user is deficient).
- Quiet neutral surfaces with state dots; no coloured callouts. Keyboard and mobile accessible; run the existing axe test pattern.

- [ ] TDD components and actions; run the web suite, lint, typecheck.
- [ ] Commit `feat: add opt-in explore pathways experience`.

### Task 5: Full verification, browser checks, and documentation

- [ ] Run the complete release gate from `docs/project-status.md` (frozen install, all workspaces, guardrails, static Supabase verifier, production build, audit, gitleaks, diff checks).
- [ ] Browser-verify `/explore` (disabled → enabled → dismiss → restore → promote path visible) and `/development/admin-preview` unaffected at 1440 px and true 390 px; no console errors or horizontal overflow.
- [ ] Write `docs/reviews/task-12-explore-pathways.md` (acceptance mapping against the five roadmap criteria, verification evidence, environment limitations: Docker/pgTAP runtime still pending) and update `docs/project-status.md` (handoff, task table, Task 12 paragraph).
- [ ] Commit docs.

### Task 6: Independent review, remediation, publication

- [ ] Independent code review of the full branch diff; remediate all findings test-first; re-run the affected gate.
- [ ] Publish through a GitHub pull request, merge into `main`, pull local `main`, re-run verification on the merge commit, and record the publication in `docs/project-status.md`.

## Self-review

Spec coverage: 70% threshold + two-gap ceiling (Task 1), absence outside threshold (Task 1 tests), visible overlap/gaps/evidence (Tasks 1/4), dismiss/disable/promote (Tasks 2/3/4), CV-free aggregate analytics (Task 2 schema + pgTAP). Deletion privacy covered by the `delete_career_profile_data` extension. Types named identically across tasks (`ExploreSuggestion`, `ExploreRepository`, `buildPromotedSearchDraft`). No placeholders remain.
