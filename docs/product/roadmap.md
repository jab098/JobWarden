# JobWarden Product Roadmap

This is the canonical build sequence after the reviewed foundation Tasks 1–6. Read it with the [approved personalised search design](../superpowers/specs/2026-07-18-personalised-job-search-design.md), [project status](../project-status.md), and the task-specific plan named in the active-task record.

Service choices and owner setup gates are maintained in [free-tier services and cost boundaries](../architecture/free-tier-services.md).

Status changes to `reviewed` only after independent review, full verification, pull-request merge to GitHub `main`, and local `main` update.

## Permanent programme constraints

- UK-only, with explicit UK eligibility evidence.
- Private beta with administrator-approved access and RLS as the final boundary.
- No pricing, payments, subscriptions, trials, plan entitlements, or auto-apply.
- Lawful, allowlisted, source-specific ingestion; never scrape prohibited boards.
- Global ingestion rather than a crawl per user.
- Free-tier-first services with hard ceilings and no automatic paid fallback.
- Deterministic matching remains available when optional AI is unavailable.
- Real CVs, contact details, and raw personal data never enter the repository.
- Authentication may remain deferred only for fictional local development; it is mandatory before real users or CVs.

## Delivery sequence

| Task | Deliverable                                                                | Status   | External setup gate                                                                   |
| ---- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| 7    | Administrator operations                                                   | reviewed | None for fixture development                                                          |
| 8    | Shared ingestion runtime                                                   | reviewed | Supabase project for live deployment; local implementation does not wait              |
| 9    | UK coverage and compensation                                               | reviewed | Reed credential only after terms, pgTAP, and controlled live validation               |
| 10   | Career profile, onboarding, and CV extraction                              | reviewed | Delivered by PR #11 (`06b5a9c`); real-CV gates remain pending                         |
| 11   | Target Feed and explainable fit scores                                     | reviewed | Delivered by PR #12 (`c86a14d`)                                                       |
| 12   | Explore and career pathways                                                | reviewed | Delivered by PR #13 (`124216f`); deterministic taxonomy, no AI dependency             |
| 13   | Application tracker and follow-ups                                         | reviewed | Delivered by PR #14 (`9e66b32`)                                                       |
| 14   | Scheduled updates and notifications                                        | reviewed | Delivered by PR #15 (`41ab43f`); Resend account, domain, and DNS remain an owner gate |
| 15   | Evidence-bound CV tailoring                                                | reviewed | Delivered by PR #16 (`ed75c9d`); no AI dependency was needed                          |
| 16   | Privacy, production authentication, deployment, and full-path verification | reviewed | Delivered by PR #18 (`46dacb4`); live activation follows the setup runbook            |
| 17   | Home activity dashboard                                                    | reviewed | Delivered by PR #17 (`2246b49`); no schema change was required                        |
| 18   | Onboarding gate and state machine                                          | reviewed | Delivered by PR #19 (`51f8eaf`)                                                       |
| 19   | Guided setup and first-run population                                      | reviewed | Delivered by PR #20 (`00a5ea7`)                                                       |
| 20   | Administrator audit log and operational health                             | reviewed | Delivered by PR #21 (`babf725`)                                                       |
| 21   | Authentication activation                                                  | pending  | Supabase project and Google OAuth — setup runbook steps 1–4                           |
| 22   | Search Jobs, route naming, and onboarding follow-ups                       | reviewed | Delivered by PR #22 (`0fa46de`); no platform setup was required                       |
| 23   | Single landing destination and public legal footer                         | reviewed | Delivered by PR #23 (`25314de`); no platform setup was required                       |
| 24   | CV upload client                                                           | reviewed | Delivered by PR #24 (`976065b`)                                                       |
| 25   | Location and radius, and slices 25a–25c                                    | reviewed | Delivered by PRs #25–#28; see project status for the per-slice record                 |
| 26   | Settings/sources/support, and 26a card surface                             | reviewed | 26a independently reviewed 2026-07-21; no defect found                                |
| 26b  | Owner surface complaints, early-access dialog                              | shipped  | Delivered by PR #31 (`53d8fbe`); the dialog needs Turnstile keys and the migration    |
| 27   | Onboarding hydration defect                                                | reviewed | Not reproducible; the report was a false negative. Regression test delivered          |
| 28   | Repair the history secret scan                                             | reviewed | Proven by a planted secret on a scratch branch, since deleted                         |
| 29   | Early access list operations                                               | reviewed | Review found a service-role truncate hole; fixed. Needs Turnstile keys                |
| 30a  | Lever adapter (TypeScript only)                                            | reviewed | None; documented public board endpoint, no credential                                 |
| 30b  | Provider vocabulary widening                                               | reviewed | Independently reviewed 2026-07-21; Ashby joined in 31 and Workable in 32              |
| 31   | Ashby adapter                                                              | reviewed | Review found a critical 100× salary defect; fixed. Source ships disabled              |
| 32   | Workable adapter                                                           | reviewed | Review found hidden-location and ordering defects; fixed. Ships disabled              |
| 33   | Emit `JobPosting` structured data                                          | blocked  | Owner decision: public job content, plus a redistribution grant per source            |
| 34   | Read `JobPosting` schema from allowlisted career pages                     | pending  | None; per-employer compliance record before each page is allowlisted                  |
| 35   | Make the live database gate pass                                           | reviewed | Delivered by PR #41 (`ab1515b`); 28 migrations, clean lint, 542 tests                 |
| 36   | Entrance motion, admin in the hub                                          | reviewed | Independently reviewed 2026-07-21; no defect found                                    |
| 37   | Location string-shape recognition                                          | reviewed | Independent pass 2026-07-21; one notation gap closed, no code defect                  |
| 38   | Official UK public-sector sources                                          | reviewed | Independent pass 2026-07-21; duplicate-control limit recorded, no code defect         |
| 39   | Adzuna licence decision                                                    | blocked  | Owner: written licence and attribution terms from Adzuna                              |

## Remaining work, in the order it should be done

Task numbers record when work was _specified_, not when it should be _built_. This is the build order, and the reasons are load-bearing.

1. ~~**Task 35 — make the live database gate pass.**~~ **Done, 2026-07-21.** `pnpm verify:live` exits zero, `db lint` is clean, and all 25 pgTAP files run their full plan for 542 tests. The `service_role` privilege question was answered first and with evidence: it was a test artefact, the grants are correct least privilege, and no grant was added to any product table. Three real production defects were found and fixed along the way, and a fourth — no `auth.users` row can be deleted — is recorded in `docs/project-status.md` for an owner decision. See the Task 35 record there.
2. ~~**Task 30b — provider vocabulary widening.**~~ **Done, 2026-07-21.** `lever` is a value the database accepts, so the Task 30a adapter is configurable. Only `lever` shipped: adding a value with no adapter would let an administrator configure a source that saves, enables and then fails at dispatch, so the vocabulary stays in lockstep with the adapters and Tasks 31 and 32 each add their own value. See the plan for the corrected site map and the generator approach that made the seven-line diff provable.
3. ~~**Task 37 — location string-shape recognition.**~~ **Done, 2026-07-21.** Full UK postcodes, the ISO code `GB`, multi-location strings and a closed set of nation-wide phrasings are now recognised. Measured on the same 44-shape probe the task was specified from: 16 published before, 23 after, with no regression and nothing new published that should not be. The remaining drops are settlement-name gaps rather than shapes, and belong to their own task — see the section.
4. ~~**Task 38 — official UK public-sector sources.**~~ **Done, 2026-07-21.** Access-confirmation pass and the first adapter both landed; the dated records are in `docs/product/source-coverage.md`. Of six services: **Teaching Vacancies is approved and needs no owner action** — no API key, Open Government Licence v3, `/api` permitted by robots.txt, and its one licence restriction is one JobWarden's no-pricing rule already guarantees. **Find an apprenticeship** needs a free self-service key from the owner. **Find a Job, NHS Jobs and Civil Service Jobs all stop at the owner**, and Find a Job must never be reached by working around its firewall. **JobApplyNI** was not reached and needs its own record. **The Teaching Vacancies adapter is delivered** and ships disabled until the owner enables it. Remaining work in this task is owner action only.
5. ~~**Task 31 — Ashby adapter**, then **Task 32 — Workable adapter.**~~ **Both done, 2026-07-21.** Each landed its adapter, provider value and compliance record together, and each ships disabled. **The ATS source work is complete and the provider vocabulary is closed.** Both vocabulary migrations were **generated rather than transcribed**, as `docs/project-status.md` requires. Task 32's access confirmation earned its keep twice over: the endpoint most Workable documentation describes needs a Bearer token and had to be rejected in favour of a genuinely public one, and probing a live board revealed that a multi-location advert arrives as one row per location sharing a single `application_url` — a shape no documentation mentions and which would have produced non-deterministic listings. See the Task 32 record in `docs/project-status.md`.
6. ~~**Task 29 — early access list operations.**~~ **Done, 2026-07-21.** An administrator surface at `/admin/early-access` reads the pending queue oldest first and marks somebody invited, auditably. The enumeration property is structural rather than promised: the invite function is keyed on the row `uuid`, so there is no argument that could ask whether a given address is on the list. **The queue will stay empty until the owner adds Turnstile keys**, because the landing dialog cannot accept an entry without them.
7. **Task 34 — read `JobPosting` schema.** The last source path, and the strictest, since it reads a page rather than an API.
8. **Task 21 — authentication activation.** Owner platform setup; can happen at any point once the owner is ready.

Ordering note, 2026-07-21: 37 and 38 were inserted ahead of 31 and 32 after an owner review of a proposed ingestion blueprint. The reasoning is that recognition width multiplies across sources while an ATS adapter adds one employer at a time, which is the same principle already recorded in `docs/project-status.md` — widening the gazetteer is cheaper stock than a new adapter.

Not in the order because they are not buildable: **Task 33** is blocked on two owner decisions, and **Task 39** is an owner licensing decision rather than engineering. See their sections.

**Numbering note, 2026-07-20.** Tasks 24, 25 and 26 in an earlier revision of this file described the ATS adapters, Google Jobs schema and early-access operations. Those numbers were already taken by shipped work recorded in `docs/project-status.md`, so that outstanding work was renumbered 29–34 and the sections below match. No section in this file now shares a number with another.

## Task 7 — Administrator operations

Build audited screens for access decisions, source compliance, and ingestion visibility. Keep the real `/admin` boundary protected by server-controlled administrator status. Because authentication setup is deferred, use only a read-only fictional development preview that cannot call privileged mutations and cannot exist outside exact development mode.

Acceptance:

- administrators can approve, reject, suspend, and restore access with required reasons and confirmation;
- source configuration accepts only known providers and validated provider identifiers/hosts;
- ingestion status shows bounded counts, freshness, duration, and sanitised error codes;
- manual run requests are globally coalesced and respect source minimum intervals;
- action tests prove the database derives the actor from the authenticated session; and
- no production admin privilege is introduced by the local preview.

## Task 8 — Shared ingestion runtime

Connect the reviewed ingestion package to an idempotent Supabase Edge Function and weekday scheduler. The schedule targets 09:00, 12:00, 15:00, and 18:00 Europe/London, while each source still respects its own allowed cadence and quota.

Acceptance:

- scheduled and manual requests enter the same globally bounded queue/path;
- one source failure does not abort other sources or close unseen jobs;
- closure still requires two consecutive complete successful omissions;
- secrets live in Vault/environment configuration, never migrations or logs;
- repeated payloads do not duplicate jobs or audit noise; and
- the operations guide covers pause, retry, quota exhaustion, rotation, and recovery.

## Task 9 — UK coverage and compensation

Add one broad authorised GB source, then the highest-value official UK sources, while improving compensation extraction and provenance. Reed, LinkedIn, Indeed, and Glassdoor remain governed by `docs/product/source-coverage.md`; importance does not override access terms.

Acceptance:

- every new connector has a dated compliance record, attribution rules, cadence, fixtures, and removal behaviour;
- duplicate jobs reconcile to canonical records without losing source provenance;
- salary/rate data distinguishes advertised, estimated, and unknown;
- unknown compensation remains filterable rather than discarded by default;
- source health and measured coverage gaps are visible to administrators; and
- JobWarden does not claim to contain every UK job.

## Task 10 — Career profile, onboarding, and CV extraction

Create user onboarding, named search profiles, private DOCX/PDF upload, deterministic extraction, optional structured AI proposal, seniority review, and deletion/retention controls.

Acceptance:

- onboarding works with a CV, role family, industry, skills/keywords, or combinations;
- skills preserve evidence, confidence, origin, recency, and user confirmation;
- current and target seniority are separate;
- private Storage policies are owner-only and real personal data cannot be used in repository fixtures;
- unsafe archives, DOCM, oversized files, and unexpected content are rejected before extraction;
- AI calls have a hard free-tier ceiling and a deterministic fallback; and
- no real CV upload is enabled until live authentication and RLS/Storage verification are complete.

## Task 11 — Target Feed and explainable fit scores

Match indexed jobs against enabled named profiles using the approved deterministic 45/20/15/10/10 formula. Replace the generic jobs list as the main experience without losing broad search and filters.

Acceptance:

- hard eligibility and compensation filters run before scoring;
- each score exposes matched evidence, important gaps, profile, and compensation treatment;
- salary does not inflate the score;
- title synonyms receive credit only through documented role/responsibility evidence;
- users can save, dismiss, and mark a role as considering; and
- model unavailability never hides deterministic matches.

## Task 12 — Explore and career pathways

Add an opt-in adjacent-career feed based on substantial transferable-skill overlap rather than novelty or title similarity.

Acceptance:

- every suggestion meets the 70% weighted core-skill threshold and has no more than two significant gaps;
- suggestions outside the threshold are absent even if keywords overlap;
- the user sees overlap, gaps, and the evidence used;
- dismiss, disable, and promote-to-search-profile controls work; and
- aggregate pathway analytics contain no CV snippets or identifying text.

## Task 13 — Application tracker and follow-ups

Build application stages, next actions, due dates, notes, and useful funnel/follow-up insights around manual external applications.

Acceptance:

- status transitions are explicit and audited at user level;
- overdue and upcoming actions are visible without inventing recruiter activity;
- list and board views remain keyboard and mobile accessible;
- insights distinguish observed outcomes from unknown/ghosted states; and
- no feature submits applications or emails recruiters.

## Task 14 — Scheduled updates and notifications

Compute new matches after shared weekday runs and send at most one useful digest per enabled slot when new Target Feed matches exist.

Task 14 owns the deliberate Resend guardrail transition. Its first failing tests must prove the existing global dependency ban, then replace it with a server-only path allowlist for the notification adapter; imports from client components, unrelated server modules, or packages remain forbidden.

Acceptance:

- no-match slots send no email;
- deduplication prevents the same job/profile match being announced twice;
- unsubscribe, per-profile controls, quiet failure, and delivery status are available;
- email payloads contain no CV text;
- daily/monthly delivery guardrails keep the owner below the configured free allowance; and
- the executable dependency guard rejects Resend everywhere except the reviewed server-only notification adapter; and
- on-demand refresh cannot create per-user source costs.

## Task 15 — Evidence-bound CV tailoring

Produce conservative, reviewable, downloadable DOCX variants for a selected job while preserving the user's document structure and never fabricating evidence.

Acceptance:

- the user must supply a DOCX for layout-preserving output;
- all proposed changes trace to existing CV evidence and the selected job;
- changed wording and omissions are shown before save/download;
- deterministic OOXML code owns document editing and rejects unsafe relationships/content;
- unsaved variants expire after 24 hours and saved variants remain user-controlled; and
- model or quota failure cannot corrupt the original.

## Task 16 — Privacy, production access, deployment, and full-path verification

Activate live Supabase authentication and approval, finish data export/deletion, deploy through Cloudflare, add least-privilege CI/security checks, and verify real service boundaries before accepting real users.

Acceptance:

- a new identity remains pending until the administrator approves it;
- direct Supabase access proves RLS denial for other users and non-admins;
- CV Storage, deletion, retention, AI data handling, email processing, and incident recovery are documented and exercised;
- production cannot enable any development bypass;
- optional analytics is still disabled until affirmative consent and a separate review;
- production build, Cloudflare preview, browser paths, pgTAP, secret scan, dependency audit, and recovery exercises pass; and
- the owner receives exact setup instructions only for the services required at this gate.

## Task 17 — Home activity dashboard

Owner decision, 2026-07-19: give the signed-in user a home statistics page that summarises their own activity over time — the kind of at-a-glance dashboard ad platforms give publishers, applied to a job search. Everything is deterministic, owner-only, and derived from data JobWarden already stores; nothing is invented, estimated, or sourced from third parties.

Earliest start is after Task 13, because the most valuable statistics come from the application tracker. If Task 14 has shipped, digest/notification statistics join the dashboard; otherwise they are added in a follow-up slice. If Task 17 lands after Task 16, it follows the full production standards like any other slice; if it lands before, Task 16's full-path verification must cover it.

Statistics a real user of this product wants (scope for the plan, trimmed to what the schema can answer truthfully):

- **Applications:** total tracked; applications started this week versus the previous week; count per stage (applied, screening, interviewing, offer, accepted, rejected, withdrawn, archived); observed funnel conversion between stages; time-in-stage; share of applications with no observed outcome, labelled honestly as "no response observed", never "rejected".
- **Follow-ups:** next actions due today, this week, and overdue.
- **Decisions:** saved / considering / dismissed counts and their trend over a selected window.
- **Target Feed:** new matches per day over the window, current match count, and the enabled search profile producing the most matches.
- **Explore:** suggestions currently qualifying, dismissed, and promoted-to-search counts.
- **Profile health:** confirmed evidence items, enabled search profiles, CV present or not — as a nudge toward better matching, not a score.
- **After Task 14:** digests sent, suppressed-as-duplicate, and no-match slots.

Acceptance:

- every figure derives from the owner's own rows in existing owner-only tables (applications, application events, job decisions, pathway decisions, search profiles, evidence) through RLS-safe reads or owner-fenced RPCs; no cross-user data, no CV text, and no new analytics collection;
- comparison windows ("last 7 days vs previous 7 days") are computed deterministically and label empty or short histories honestly instead of fabricating a baseline;
- unknown/ghosted outcomes are shown as distinct observed states, never converted into implied rejections or invented recruiter activity;
- the dashboard is a read-only surface: it links to `/matches`, `/applications`, `/pathways`, and `/profile` for action, and adds no new mutation paths;
- the page is keyboard and mobile accessible, follows `docs/design/ui-direction.md` (quiet neutral surfaces, state dots, no decorative colour callouts), and renders sparkline-style trends without a charting dependency unless one is separately approved; and
- the fictional development preview serves frozen fixture statistics and refuses mutations, exactly like every other surface.

## Task 18 — Onboarding gate and state machine

Owner decision, 2026-07-19: a new approved user must complete onboarding before the product hub is usable. Today an approved user lands on an empty Target Feed with no explanation, because nothing has ever required them to build a profile.

This task is the plumbing only: resumable per-owner onboarding state, the gate itself, and the branch logic including every fallback. The guided experience is Task 19.

The gate lives in `resolveProtectedAccess`, which already returns typed redirects. The hub is gated; `/admin` is deliberately **not**, because an administrator surface must never be lockable by a product gate — if onboarding broke, the owner would lose the ability to administer. `/privacy`, `/terms`, `/access/pending`, `/unsubscribe`, the sign-in route, and sign-out stay reachable throughout.

A CV is the strongly encouraged default but is **not** hard-required: the user must make an explicit choice, because hard-requiring one would lock out the student and career-changer cases this task exists to serve.

Acceptance:

- no protected hub surface is reachable before onboarding completes, and the gate fails closed — an unreadable or unknown state counts as not onboarded;
- `/admin` remains reachable to an administrator regardless of onboarding state, and this exemption is tested;
- onboarding state is durable and resumable: signing out, changing browser, or abandoning mid-flow resumes at the same step;
- the branch classifier is a pure deterministic function covering rich CV, thin CV, failed parse, no CV, and PDF-only outcomes, each independently tested;
- a user who chooses "no CV yet" reaches a working aspiration-led path rather than a dead end; and
- the fictional development preview exercises every branch and refuses mutations.

## Task 19 — Guided setup and first-run population

The onboarding experience itself, and making the product come alive the moment it ends.

Questions are **pre-filled from CV evidence** rather than blank, because Task 10's extraction already produces confirmed skills, tools, responsibilities, role history, and seniority. The user confirms and corrects rather than typing from nothing. Where evidence is absent — the student and career-changer paths — the same steps ask about aspirations instead: target role families, skills to develop, and the direction they want to move in.

On completion, onboarding writes an enabled named search profile, an Explore opt-in decision, and a digest preference, then lands the user on the hub.

> **Superseded by Task 23 (2026-07-19).** This section originally landed the user on `/jobs` with their hard preferences carried as URL-backed filters. That only ever worked on a page that reads those filters, and the page an enabled search profile produced was not one, so the parameters applied nothing. The destination is now `/home`, and the preferences are applied where they always actually were — in the saved search profile that drives matching — and edited from `/profile`. Do not reintroduce `buildFirstRunFilters`.

Acceptance:

- every question is pre-filled from confirmed evidence wherever evidence exists, and the user approves every field before it becomes active;
- a user with no CV completes through aspirations and receives a working Explore-led setup;
- onboarding refuses to complete with nothing to match on, and says exactly what is missing, rather than unlocking an empty hub;
- ~~every preference applied to that first feed is **visible and removable in one click**, using the existing URL-backed filters rather than a second filtering mechanism~~ — **retracted by Task 23**: every preference is instead editable in one place, `/profile`, and no second filtering mechanism exists;
- every choice made during onboarding is editable afterwards from `/profile`; nothing is write-once; and
- no CV text reaches logs, analytics, errors, URLs, or emails at any point in the flow.

## Task 23 — Single landing destination and public legal footer

Three paths answered "signed in and set up" differently: finishing onboarding went to `/jobs` with filter parameters, revisiting a completed `/onboarding` went to `/home`, and signing in went to `/matches`. A product with one hub should have one landing.

Acceptance:

- every path that means "signed in, approved, and onboarded" lands on `/home`: the OAuth callback fallback, the approved branch of `/access/pending`, a revisit to a completed `/onboarding`, and onboarding completion itself;
- no code path carries onboarding preferences as URL filters, and `buildFirstRunFilters` does not exist — preferences reach matching through the saved search profile and are edited from `/profile`;
- the open-redirect protection on the callback destination is unchanged apart from its fallback constant; and
- `/privacy` and `/terms` are reachable from the public landing and sign-in pages through a quiet footer that meets WCAG AA contrast and does not compete with the call to action.

## Task 20 — Administrator audit log and operational health

The `audit_log` table has been populated since Task 1 and the AI usage ledger since Task 10; neither has ever had an interface. Notification delivery health is currently visible only to the individual owner, not to the administrator responsible for the free-tier ceiling.

Acceptance:

- the audit log is read-only, paginated, and bounded, and exposes no CV text or user content;
- delivery health shows application-wide sent, suppressed, and failed counts with remaining daily and monthly headroom, read from the same rows the runtime writes;
- AI usage shows consumption against the configured ceiling, including when that ceiling is zero; and
- every figure is derived, never estimated, and the surface adds no new mutation path.

## Task 21 — Authentication activation

Execute setup runbook steps 1–4 against a real Supabase project and Google OAuth client, close whatever gaps a live session exposes, and verify the pending-until-approved path end to end. The Task 5 code has been reviewed but has never met a real session.

This task cannot complete without owner platform setup.

Acceptance:

- a new identity reaches `/access/pending` and stays there until an administrator approves it, proven with two real accounts;
- session refresh, sign-out, and callback handling work against real Supabase Auth;
- the development bypass is absent from every deployed environment, re-proven after activation; and
- the full-path browser verification covers every surface including `/home` and onboarding, as Task 16 requires.

## Task 27 — Onboarding hydration defect — closed, not reproducible

**Outcome, 2026-07-20: there was no hydration defect.** The report held that `OnboardingFlow` attached no React fiber, that every client effect inside it was inert, and that the step buttons worked only through progressive enhancement. It was checked at `9d2b49b`, the commit the report itself cited as proof, in a clean worktree with its own dev server, and again on `main`. The flow hydrates in both.

The root cause is the measurement, not the code. Counting `__reactFiber$` properties is a mechanism check that yields false negatives easily: most elements on any page legitimately carry no fiber, and `<head>`, `<link>` and `<script>` — which never do — sort first in `document.querySelectorAll("*")`. The report's own supporting facts were consistent with a working page all along: chunks returning 200 and a clean console are what hydration looks like.

Three checks, each of which the report would have failed had it been true:

- `main`, both submit buttons, and both `Enter` divs carry `__reactFiber$` and `__reactProps$`; the only elements without them are `<head>`, `<link>` and `<script>`;
- `sessionStorage["jobwarden:seen-surfaces"]` contains `onboarding-cv-cv`, the key belonging to the `Enter` **inside** the flow, so its `useEffect` ran — the observable proof this task's acceptance asked for; and
- with `window.__probe` set, submitting a step advanced "Your CV" to "Where you want to go" while the probe survived and `performance.getEntriesByType("navigation")` stayed at one entry. A progressively-enhanced form POST unloads the document and would have destroyed both. React had intercepted the submit through `useActionState`. `seenSurfaces` then grew to include `onboarding-aspiration-aspirations`, so the next step's effect ran in place too.

What was genuinely missing, and is now delivered, is the regression test. `onboarding-ui.test.tsx` server-renders the flow with `renderToString`, hydrates against that markup with `hydrateRoot`, and asserts both that the `Enter` effect recorded its surface key and that `onRecoverableError` stayed silent. Both halves were mutation-checked: suppressing the effect fails the first assertion, and a genuine server/client divergence fails the second.

`"use client"` deliberately has no test of its own. A React hook in a server component fails the production build that `pnpm verify` already runs, so a test for it would duplicate the compiler.

`docs/standards/frontend-traps.md` carried the false claim and told the next agent that client behaviour inside onboarding was dead code. It has been corrected, because a wrong entry in that file is more expensive than no entry.

## Task 28 — Repair the history secret scan — done

The `verify` workflow's secret scan failed with GitHub 403 `Resource not accessible by integration` when listing pull-request commits, and crashed before scanning. It had therefore never scanned a pull request, while presenting as a configured control.

**Fixed 2026-07-20 by PR #34.** The job held only `contents: read`; the step lists a pull request's commits through the GitHub API, which needs `pull-requests: read`. That permission is required by this step and by nothing else, so least privilege is preserved.

The step was also renamed from "Scan full history for secrets" to "Scan incoming commits for secrets". The action's own log shows it running `gitleaks detect --log-opts` with `--no-merges --first-parent` over a commit range: on a pull request it scans that pull request's commits, on a push the pushed commits, and only a manual or scheduled run walks the whole history. The old name claimed something untrue on every event this workflow handles, which is the same class of defect as the 403 — a control describing itself as more than it is.

Both halves of the acceptance were proven, not assumed:

- **It runs.** PR #34 completed the step green, with `event type: pull_request` in the log — the exact path that used to 403.
- **It catches.** A scratch branch off the fix carried one deliberately planted fictional Slack bot token. Its run passed every other step and failed at the scan, reporting `RuleID: slack-bot-token`, `File: SCAN-PROOF-DELETE-ME.md`, commit `5441c32`, `1 commits scanned`, with the value redacted in the log. The branch and its pull request were closed and deleted immediately afterwards; the commit is unreachable and the value was never a real credential.

Recorded because it cost a step to learn: the planted value has to be chosen against the scanner, not assumed. The obvious first choice — an AWS-style `AKIA…` key, including AWS's own published `AKIAIOSFODNN7EXAMPLE` — is **not** flagged by gitleaks 8, so planting one would have produced a green run and "proven" the control worked when it had caught nothing. `slack-bot-token` and `stripe-access-token` both fire reliably. Slack was chosen because a `sk_live_` string risks tripping this repository's own payments guardrail and failing `pnpm verify` before the scan is ever reached, which would have failed the proof at the wrong step.

## Task 29 — Early access list operations

The list ships in the landing dialog but has no interface. The owner currently reads it with SQL.

Acceptance:

- an administrator surface lists pending signups oldest first, with the free-text field rendered as text and never as markup;
- marking somebody invited sets `invited_at` and is auditable;
- the surface is read-mostly, imports no production mutation action beyond the invite mark, and exposes no product data; and
- the enumeration property holds: nothing in the interface or its errors reveals whether a given address is on the list to anybody but an administrator.

## Tasks 30–32 — ATS source adapters: Lever, Ashby, Workable

Only Greenhouse and Reed exist. The three remaining mainstream ATS boards are the cheapest real coverage available: each publishes a documented, free, employer-authored JSON feed, so they need no commercial agreement and carry no access-control risk. They are three separately reviewed and separately merged tasks, one provider each, because half-adding them would put sources in the allowlist that cannot be trusted to produce eligible UK listings.

Rejected alternative, recorded so it is not re-proposed: **LinkedIn is not a source.** There is no public jobs-search API at any partner tier, and scraping it breaks both their terms and the allowlisted-source rule in `AGENTS.md`. "Sign in with LinkedIn" returns name, email and photo only, never work history, so it cannot populate a career profile either. Do not spend a slice discovering this again.

Do not carry a provider endpoint forward from this file. Each slice confirms the current documented public board endpoint against the provider's own documentation at its start, and records it in the dated compliance record in `docs/product/source-coverage.md` beside Reed and Adzuna. An endpoint that turns out to need a credential or a commercial agreement stops the slice and comes back to the owner; it does not become a scrape.

### What the first slice carries, and the other two do not

The provider vocabulary is not one check constraint. It is hardcoded in every layer, and widening it is most of why Task 30 is larger than Tasks 31 and 32. Task 30 widens it once, from a two-value list to a list the remaining providers join by adding a value; Tasks 31 and 32 then add a value, an adapter, and fixtures. The known sites:

- `job_sources_supported_provider` and `job_sources_reed_minimum_interval` in `202607180003_uk_coverage_compensation.sql`, which also bind `coverage_mode` per provider — the three ATS boards are `complete` like Greenhouse, not `incremental` like Reed;
- the `provider is distinct from 'greenhouse'` and `provider not in ('greenhouse', 'reed')` guards in `configure_job_source`, `request_source_ingestion`, `begin_source_ingestion` and `enqueue_scheduled_ingestion`, across `202607170003_audit_and_ingestion.sql`, `202607180002_shared_ingestion_runtime.sql` and `202607180003_uk_coverage_compensation.sql`;
- the `case source.provider when 'greenhouse' then 0 else 1 end` orderings in `202607180003` and `202607200003_job_locations_writer.sql`;
- the `z.enum(["greenhouse", "reed"])` row schema and the Reed-shaped row assertion in `supabase/functions/ingest-jobs/repository.ts`;
- the adapter dispatch in `supabase/functions/ingest-jobs/index.ts`;
- the `JobSource` discriminated union in `packages/ingestion/src/types.ts`; and
- `components/admin/source-form.tsx`, `components/admin/source-list.tsx`, `lib/admin/types.ts` and `lib/sources/development-sources.ts`.

Every widened database function must use `create or replace`, never `drop function` plus `create`. Task 25c's review found that a drop resets the ACL to PostgreSQL's default `EXECUTE` to `PUBLIC`, which left a security-definer ingestion function reachable by the anon key while the static verifier certified it as revoked. If a signature genuinely has to change, the migration revokes and grants explicitly and `verify-supabase-foundation.mjs` is checked against it.

### Acceptance, per provider

- the adapter reads only the provider's documented public board endpoint for an allowlisted employer, with bounded retries, sanitised errors, and append-only audit records, reusing `retry.ts` and the `ProviderAdapter` contract rather than a second fetching mechanism;
- the response is validated in full before any part of it is trusted, and non-visible or unsafe provider content is stripped before every classifier, exactly as Greenhouse does;
- `job_sources.provider` accepts the new value through a migration, the admin source form can configure it, and the source's `coverage_mode` and minimum sync interval are constrained at the database boundary rather than by convention;
- UK eligibility evidence is extracted explicitly, never inferred, and a listing without it is not published, including a remote role without explicit UK permission — an unrecognised location quarantines rather than publishes, per Task 25b;
- compensation keeps advertised, estimated, and unknown as visibly distinct provenance, never estimating a figure the advert did not state, and IR35 is never inferred from contract status;
- duplicate control across providers is proven with a fixture listing that appears on two boards, reconciling through the Task 9 canonical occurrence key without losing either provider's provenance;
- the shared ingestion run stays global, cooldown-bound, and free of per-user cost, and a failure of the new source does not abort the others or close their unseen jobs;
- the drop-reason counts and unrecognised-location list added by Task 25c populate for the new provider, so a slice that discards most of its stock is visible instead of silent; and
- a dated compliance record with attribution rules, cadence, fixtures, and removal behaviour lands in `docs/product/source-coverage.md`, and the source ships disabled until the owner enables it.

## Task 33 — Emit `JobPosting` structured data — blocked on an owner decision, do not build

**Stopped before implementation, 2026-07-20.** The premise does not survive the programme's own constraints. Recorded here in full so it is not re-proposed, in the same spirit as the LinkedIn note above.

The task read: emit `JobPosting` markup for published listings so indexed roles are discoverable, described as a rendering change on pages JobWarden already serves. Three findings, each independently fatal:

1. **No crawler can reach a job page.** Every job surface lives under `app/(protected)`, whose layout calls `requireProtectedAccess()`; an unauthenticated request is answered with `redirect()`, not markup. The only public pages are the landing, `/privacy`, `/terms`, `/unsubscribe`, `/access/pending` and the sign-in route. There is no `robots.txt` and no `sitemap.ts`. Structured data on a page Googlebot is redirected away from is inert, so the task as written would ship a control that looks configured and does nothing — the exact failure mode Task 28 just repaired.

2. **Making those pages public contradicts a permanent constraint.** "Private beta with administrator-approved access and RLS as the final boundary" is the second bullet of this file, and `AGENTS.md` states product data is available only to administrator-approved users. Publishing job pages for indexing means serving product data to anonymous readers, which is not a rendering change; it is a change of product posture.

3. **It would redistribute source content JobWarden has no grant to redistribute.** This is the decisive one. `docs/product/source-coverage.md` requires every source to record its attribution requirements, and states plainly of Reed that its page "does not state a data-retention, redistribution, attribution, or termination/removal grant". Emitting a listing's title, description, location and salary as public structured data is redistribution to a search index. JobWarden holds no redistribution grant from any current source, and the non-negotiable rule that connectors never bypass robots restrictions or access controls exists to keep exactly this boundary.

Nothing survives a reduction. There is no public surface carrying a listing to attach markup to, and creating one is what findings 2 and 3 forbid.

Unblocking it needs owner decisions, not engineering: a deliberate choice to serve some job content publicly outside the private beta, **and** a recorded redistribution and attribution grant from each source whose listings would appear. Until both exist, this task stays closed. Note that Task 34 is unaffected — reading `JobPosting` schema is ingestion, not publication, and redistributes nothing.

## Task 34 — Read `JobPosting` schema from allowlisted career pages

An ingestion path for employers whose careers page carries `JobPosting` markup but who publish through no ATS feed JobWarden supports. This is the only source in the programme that reads a page rather than a documented API, so it carries the strictest rules.

Acceptance:

- an employer's career page is read only after its own dated compliance record exists, its `robots.txt` permits the path, and the owner has allowlisted it — a page is never read because it happened to have markup;
- scraped schema is untrusted input: schema-validated, bounded in size and depth, evidence-checked, and stripped of markup before any classifier, on the same footing as AI-proposed content;
- a listing whose UK eligibility evidence is absent from the markup is not published, and the markup's own `jobLocationType` is treated as a claim needing evidence rather than as evidence;
- compensation provenance comes from what the markup actually states, and a `baseSalary` absent from the page stays `unknown`; and
- the path degrades visibly: a page that stops carrying markup, changes shape, or starts refusing is a recorded source failure, not a silent zero.

## Task 36 — Entrance motion, and administration inside the hub

Owner request, 2026-07-20, from a reference video. Delivered.

**Motion.** Three animations were identified in the reference: opacity, translate and blur. Fade and rise already existed; blur and scroll-triggered entrance did not. Entrances now have their own duration scale (`--duration-entrance: 620ms`, `--duration-entrance-page: 900ms`), deliberately separate from the interaction durations, which are shared with hover tilts, progress bars, the disclosure and the dialog — lengthening those to slow an entrance would have made every hover sluggish.

Blur is reserved for **page-level arrival only**: the landing hero and the first paint of the hub shell. It is never used on a component or on a route change inside the shell, because the shell element persists across navigation. Components use fade and rise through `components/ui/reveal.tsx`, an `IntersectionObserver` reveal that fails visible in every direction.

Owner decision recorded in the code: **every arrival animates**, including a return to a surface seen earlier in the session. `Enter` previously faded on a repeat visit; that branch is gone, and `page-fade` now serves only the cross-document view transition.

**The defect this exposed.** Route entrances did not animate on navigation, only on reload. The cause is structural: the App Router nests `layout → template → Suspense(loading.tsx) → page`, so `template.tsx` sits above the Suspense boundary. Every protected route has a `loading.tsx`, so on navigation the entrance was spent on the loading skeleton and the real content arrived underneath without remounting. Fixed by animating the wrapper's child rather than the wrapper, so the skeleton-to-content swap is itself a new node.

**Skeletons no longer interrupt.** A skeleton does not run the entrance, and is held invisible for `--delay-skeleton: 260ms`, so a navigation that resolves quickly shows no loading state at all. The delay is a backwards animation fill rather than a visibility toggle, so `role="status"` still announces immediately.

**Administration.** `/admin` lives under `(protected)`, so `AdminShell` was rendering a second rail, brand block and sign-out _inside_ the hub shell, on the wrong background. That is why entering administration read as leaving the product. It is now `AdminSection`: the hub rail stays, Admin is lit in it, and the five surfaces are tabs in the hub's own container. `AdminShell` is deleted. An Admin item was added to the rail above Settings, its destination decided on the server — `/admin` for an administrator, the read-only preview under the development bypass, nothing otherwise. `requireAdmin` is unchanged and remains the boundary.

**Left undone, deliberately.** The development admin preview does not render the hub rail. Wrapping it in `AppShell` was tried and backed out: the shell carries a live sign-out form, and `AGENTS.md` requires the preview to import no production mutation action — an invariant its own test enforces by asserting no form and no enabled button appear. Closing that gap means separating the rail's presentation from its sign-out, which is a shell refactor and its own change.

## Task 35 — Make the live database gate pass

Docker was installed on 2026-07-20 and `pnpm verify:live` ran for the first time in the programme's history. Two defects had to be fixed before it could run at all, and once it ran it reported a great deal.

**The two fixes that got it running**, both delivered with this record:

- `202607180007_career_profile_review_and_retention.sql` used `references` as a bare table alias in two `cross join lateral` blocks. `REFERENCES` is a fully reserved word in PostgreSQL, so the migration raised `syntax error at or near "references"` and **could not be applied at all**. Every migration from that point on was therefore unreachable. Renamed to `evidence_refs`.
- `scripts/verify-live.mjs` spawned a bare `supabase` binary. The CLI is not a dependency of this repository and resolves through npx here, so the gate reported `Failed: supabase db reset` — a resolution problem wearing the costume of a migration failure. It now resolves PATH, then npx, and says which it found.

**What the first complete run reports.** All 24 migrations apply. `supabase db lint` and 25 pgTAP files then produce:

| Finding                | Detail                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db lint` **error**    | `public.claim_career_profile_extraction` — `column reference "user_id" is ambiguous` (42702). A PL/pgSQL variable and a table column share a name in an `update ... where`. This would raise at runtime. |
| `db lint` warning      | `public.get_job_source_health` is marked `STABLE` but contains a `VOLATILE` expression.                                                                                                                  |
| 9 files abort mid-plan | 001 (0 of 21 ran), 002 (0 of 7), 003 (0 of 12), 011 (0 of 13), 005 (8 of 36), 012 (9 of 21), 006 (14 of 59), 010 (26 of 37), 007 (44 of 54).                                                             |
| 4 files fail a test    | 004 test 8, 013 test 14, 016 test 17, 022 test 16.                                                                                                                                                       |
| Totals                 | 378 tests ran of roughly 500 planned. `Result: FAIL`.                                                                                                                                                    |

**Two distinct causes, and they must not be conflated.** Most aborts are fixture drift: `001` dies on `null value in column "deduplication_key" of relation "jobs"`, a `not null` column added by a later migration to a fixture written before it existed. `022` asserts the forced-RLS table count is 32 when it is now 34, because two tables have since been added. Those are stale tests, and fixing them is bookkeeping.

**The permission failures are not, and are the reason this task exists.** Several files abort on `permission denied for table` — `jobs`, `job_sources`, `ingestion_requests` — inside blocks that have already run `set local role service_role`. The hint PostgreSQL offers is `GRANT SELECT ON public.ingestion_requests TO service_role`. The Edge Function ingestion runtime _is_ `service_role`. So the first question this task must answer, before touching a single test, is whether `service_role` genuinely lacks privileges it needs at runtime — in which case live ingestion is broken and this is a production defect the tests have just caught — or whether every real access path goes through a security-definer RPC that owns the privilege, making it a test artefact. **Do not "fix" these by granting privileges until that question is answered.** Granting to make a test green is precisely how the Task 25c hole was certified.

Acceptance:

- the `service_role` privilege question is answered with evidence and stated in the review, before any grant is added or any test is changed;
- `db lint` reports no error, and the `STABLE`/`VOLATILE` warning is either fixed or recorded with a reason;
- all 25 pgTAP files run their full plan, and `pnpm verify:live` exits zero;
- every fixture change is a fixture change, and any change to a _migration_ is called out separately and justified; and
- `docs/project-status.md` stops describing the database checks as never executed.

## Task 37 — Location string-shape recognition

**Specified 2026-07-21**, from a measured probe of the shipped classifier rather than from a report of a missing place name. It comes before Tasks 31, 32 and 38 because recognition width multiplies across every source at once, while an adapter adds one provider.

### The measurement, and the hypothesis it killed

The expected finding was that the place dataset was too small — `knownUkCities` holds two entries, so the gazetteer looks thin on inspection. **That hypothesis was tested and is wrong.** `classifyUkEligibility` was run over 73 plain UK city names and 72 were published. The 230-place bundled dataset in `uk-places.generated.json`, plus the ceremonial-county and region sets, cover ordinary city names well. Do not re-open dataset size as the primary problem.

The loss is in **string shapes**, not place names. The same probe over the formats ATS feeds and aggregators actually emit:

| Dropped input                                   | Why it matters                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EC2A 4NE`, `SW1A 1AA`, `M1 2AB`                | A valid UK postcode is unambiguous UK evidence, and every one is currently quarantined               |
| `London, GB`, `GB-London`                       | `GB` is the ISO 3166-1 code Greenhouse and Lever routinely emit; it is absent from `ukNationAnchors` |
| `London / Manchester`, `Multiple locations, UK` | Multi-location adverts are discarded whole rather than split                                         |
| `UK Wide`, `Anywhere in the UK`                 | Contain an explicit nation anchor that the tokeniser does not reach                                  |
| `Shoreditch`, `Camden`                          | London districts, where `Canary Wharf` and `Croydon` already publish                                 |
| `Stratford-upon-Avon`, `Ashby-de-la-Zouch`      | Hyphenated names, where `Weston-super-Mare` and `Barrow-in-Furness` already publish                  |

Two cautions the probe also produced. `Nationwide` must **not** become a nation anchor: it is also a UK employer name, and treating it as location evidence would publish on an employer string. Crown dependencies — Isle of Man, Jersey, Guernsey, Gibraltar — currently quarantine, and that is **correct and deliberate**: they are outside the UK for right-to-work purposes. Do not "fix" them into eligibility.

The probe measured which shapes fail, not how much feed volume each shape represents. Size the work from the unrecognised-location list on `/admin/ingestion`, which Task 25c populates with real run data, before deciding how far down the table to go.

Acceptance:

- a valid UK postcode is recognised as explicit UK evidence through a documented format check, and an invalid or non-UK postal format is not;
- `GB` is accepted as a nation anchor wherever `UK` already is, including in a `GB-` prefixed form;
- a multi-location string is split and each part classified independently, publishing only when at least one part carries UK evidence **and no part is unrecognised**;

  **Corrected 2026-07-21 by the independent review pass, and the correction is load-bearing.** This criterion originally read "publishing when _any_ part carries UK evidence". The shipped classifier is stricter than that and deliberately so: `assessLocation` refuses when any label is unrecognised, so "London / Paris" and "London, Ontario" both quarantine rather than publish. An "any part" rule would publish a job on the strength of one recognised UK city sitting beside a foreign qualifier no denylist happens to carry — which is the exact hole the allowlist exists to close, and which the code comment at `packages/domain/src/classification.ts` calls "the barrier". The criterion was wrong, not the code. It is corrected here so that nobody reads the two, believes the implementation has drifted, and "fixes" the classifier toward a right-to-work hole.

  Evidence is recorded as the whole location string rather than the isolated part that qualified. That still names the matched text — a postcode-derived publication contains its postcode — so the audit trail holds, and isolating the part was not worth restructuring the evidence contract for.

- `Nationwide` alone remains ambiguous, and a test asserts it, because it is also an employer name;
- Crown dependencies remain outside UK eligibility and a test asserts each of them, so the boundary cannot be widened by accident;
- eligibility evidence still names the exact matched text, so a postcode-derived publication is auditable to the postcode that produced it;
- the classifier still fails closed: an unrecognised shape quarantines and never publishes; and
- the drop-reason counts and unrecognised-location list show the reduction, measured against the same source before and after.

## Task 38 — Official UK public-sector sources

**Specified 2026-07-21.** `docs/product/source-coverage.md` has ranked official national and public-sector services as coverage layer 1 since it was written, naming GOV.UK Find a Job, JobApplyNI, NHS Jobs, Civil Service Jobs, Teaching Vacancies and Find an Apprenticeship. No task has ever existed for any of them, while three tasks exist for employer ATS boards, which the same document ranks third. This corrects that inversion.

These services carry UK public-sector vacancies at a volume no per-employer ATS board approaches, and they are public services rather than commercial aggregators, so the access question is different in kind from Reed's or Adzuna's.

**The access terms are not stated here, deliberately.** The rule recorded for Tasks 30–32 applies with full force: do not carry a provider endpoint or a licence assumption forward from this file. The first step of this slice is confirming, against each service's own current documentation, whether a documented public interface exists, what it permits, and whether it requires registration or an agreement. Being a public service is not by itself a grant. A service that turns out to need a credential or a written agreement **stops the slice and returns to the owner**; it never becomes a scrape, and it never proceeds on an assumption that Crown copyright or Open Government Licence terms apply without that being confirmed in writing.

Scope one service per slice, highest confirmed volume first. Do not attempt the whole layer in one task.

Acceptance, per service:

- the documented public interface and its terms are confirmed against the provider's own current documentation at slice start, and a dated compliance record lands in `docs/product/source-coverage.md` beside Reed and Adzuna before any code reads the service;
- registration, attribution, cadence, retention, redistribution and removal obligations are recorded explicitly, including where the provider states none, and an unresolved obligation stops the slice rather than defaulting to permitted;
- the adapter reuses `retry.ts` and the `ProviderAdapter` contract rather than a second fetching mechanism, with bounded retries, sanitised errors and append-only audit records;
- `job_sources.provider` accepts the new value through a migration using `create or replace`, and the source's `coverage_mode` and minimum interval are constrained at the database boundary — note that a national service is likely `incremental` like Reed rather than `complete` like an ATS board, and the coverage semantics decide whether omissions may ever close a job;
- UK eligibility evidence is extracted explicitly and never inferred from the fact that the publisher is a UK public body;
- compensation keeps advertised, estimated and unknown distinct, and public-sector pay bands are read as advertised only when the advert states a figure — a band name alone is not a figure;
- duplicate control is proven against a listing that also appears on an existing source, reconciling through the canonical occurrence key without losing either provenance; and
- the source ships disabled until the owner enables it.

## Task 39 — Adzuna licence decision — owner action, not engineering

The Adzuna GB API was reviewed on 2026-07-18 and the record is in `docs/product/source-coverage.md`. Nothing about it has changed, and it is restated as a numbered item only because it keeps being re-proposed as a free integration.

It is not simply free. The official terms record default limits of 25 requests/minute, 250/day, 1,000/week and 2,500/month; organisational use beyond a stated 14-day validation period may require written consent and a licence; published listings require the specified "Jobs by Adzuna" attribution; and on termination the acquired data must be removed from the product's pages.

The blocking step is a written confirmation from Adzuna covering JobWarden's intended private-beta aggregation, retention, attribution and deletion behaviour. That is an owner action. No connector, credential or fixture work should start before it exists.

## Rejected source approaches, recorded so they are not re-proposed

Recorded 2026-07-21, following an owner review of a proposed ingestion blueprint, in the same spirit as the LinkedIn note in Tasks 30–32 and the Task 33 record. Each of these was proposed in good faith and each fails against a constraint this programme already holds.

**Enumerating ATS company identifiers is not a discovery method.** The proposal was to loop over company IDs against the Greenhouse, Lever and Ashby board endpoints to acquire employers in bulk. The adapters are fine and three of them are roadmapped; the discovery method is not. `AGENTS.md` requires allowlisted sources, and `docs/product/source-coverage.md` states that each employer board is an individual source with its own compliance record and allowed application hosts. Enumeration is the opposite of an allowlist: it acquires employers precisely because nobody chose them. An employer joins the allowlist by decision, never by having a guessable identifier.

**AI must not estimate compensation.** The proposal was to pass raw job descriptions to a model and have it return a `salary_estimate` field. This breaks the compensation provenance rule directly: advertised, estimated and unknown must stay visibly distinct, and AI cannot invent compensation. An advert that states no salary stays `unknown`. A model's guess is not an estimate with provenance, it is a fabricated figure attached to a real employer.

**Do not add a second or third AI provider by default.** The same proposal suggested Gemini and Groq free tiers for enrichment. Cloudflare Workers AI is already the reviewed provider, wired in `supabase/functions/extract-career-profile/environment.ts` with a hard daily allowance that defaults to `0` and resolves to `"disabled"` when credentials are absent. Free-tier-first with hard ceilings is a programme constraint, and two more providers is three ceilings to enforce instead of one. Deterministic local logic is preferred over a model wherever it will do — postcode and location recognition is Task 37's deterministic work precisely because it does not need a model.

**Canonical link tags on job pages would be inert, and publishing to make them work is forbidden.** This is Task 33 restated, because it arrives repeatedly as an SEO suggestion rather than as a structured-data one. Every job surface is under `app/(protected)`, so an unauthenticated request is answered with `redirect()` and no markup; there is no `robots.txt` and no `sitemap.ts`. A canonical tag on a page no crawler can reach is a control that looks configured and does nothing. Making those pages public contradicts the private-beta constraint and would redistribute source content JobWarden holds no grant to redistribute. See Task 33 for the full finding.

**A fixed-age auto-expiry would regress job closure.** The proposal was to archive any posting older than 30 days unless a daily feed reconfirms it. Closure is already implemented and is deliberately stricter: `jobs.consecutive_successful_omissions` requires two consecutive complete successful omissions, incremental sources may never close a job by omission, and failed or incomplete runs never close anything. A fixed-age timer would close live long-running vacancies whenever a source merely failed to confirm them, which is the exact failure the omission counter exists to prevent. An advertised closing date already closes a job through the bounded expiry process.

**Content hashing on title, employer and location alone is weaker than what exists.** The proposal was to hash `Job Title + Company Name + Location` for de-duplication. `packages/ingestion/src/hash.ts` already hashes 21 normalised fields for change detection, alongside a separate `deduplicationKey` for cross-source reconciliation. The two do different jobs: a three-field hash cannot distinguish a re-advertised role from an edited one, so adopting it would lose change detection.

## Continuous source expansion

Source work does not wait for a single final “scraping complete” milestone. After Task 8, authorised connectors can be delivered as independently reviewed slices alongside Tasks 10–15. Prioritise measured UK coverage gaps, job freshness, contract/part-time representation, compensation quality, and duplicate control. Never let a high-profile board bypass the source-access rules.

## Planning rule

Before starting a task, create a focused plan in `docs/superpowers/plans/` with exact files, interfaces, failing tests, verification commands, operational setup, and rollback behaviour. Update `docs/project-status.md` at task start and after the reviewed merge.
