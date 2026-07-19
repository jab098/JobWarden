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
| 20   | Administrator audit log and operational health                             | pending  | None; both datasets already exist with no interface                                   |
| 21   | Authentication activation                                                  | pending  | Supabase project and Google OAuth — setup runbook steps 1–4                           |

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
- the dashboard is a read-only surface: it links to `/jobs`, `/applications`, `/explore`, and `/profile` for action, and adds no new mutation paths;
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

On completion, onboarding writes an enabled named search profile, an Explore opt-in decision, and a digest preference, then lands the user on `/jobs` with their hard preferences carried as URL-backed filters.

Acceptance:

- every question is pre-filled from confirmed evidence wherever evidence exists, and the user approves every field before it becomes active;
- a user with no CV completes through aspirations and receives a working Explore-led setup;
- the first feed after onboarding is non-empty, or states precisely why it is empty and what to change;
- every preference applied to that first feed is **visible and removable in one click**, using the existing URL-backed filters rather than a second filtering mechanism;
- every choice made during onboarding is editable afterwards from `/profile`; nothing is write-once; and
- no CV text reaches logs, analytics, errors, URLs, or emails at any point in the flow.

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

## Continuous source expansion

Source work does not wait for a single final “scraping complete” milestone. After Task 8, authorised connectors can be delivered as independently reviewed slices alongside Tasks 10–15. Prioritise measured UK coverage gaps, job freshness, contract/part-time representation, compensation quality, and duplicate control. Never let a high-profile board bypass the source-access rules.

## Planning rule

Before starting a task, create a focused plan in `docs/superpowers/plans/` with exact files, interfaces, failing tests, verification commands, operational setup, and rollback behaviour. Update `docs/project-status.md` at task start and after the reviewed merge.
