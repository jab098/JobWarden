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

| Task | Deliverable                                                                | Status  | External setup gate                                                                  |
| ---- | -------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| 7    | Administrator operations                                                   | pending | None for fixture development                                                         |
| 8    | Shared ingestion runtime                                                   | pending | Supabase project for live deployment; local implementation does not wait             |
| 9    | UK coverage and compensation                                               | pending | Source credentials only when an approved API requires them                           |
| 10   | Career profile, onboarding, and CV extraction                              | pending | Supabase private Storage and Cloudflare Workers AI before real-data testing          |
| 11   | Target Feed and explainable fit scores                                     | pending | No paid AI dependency                                                                |
| 12   | Explore and career pathways                                                | pending | Cloudflare Workers AI optional; deterministic taxonomy is the fallback               |
| 13   | Application tracker and follow-ups                                         | pending | None for fixture development                                                         |
| 14   | Scheduled updates and notifications                                        | pending | Resend account, verified sending domain, and DNS records                             |
| 15   | Evidence-bound CV tailoring                                                | pending | Cloudflare Workers AI and private Storage; DOCX source required for preserved layout |
| 16   | Privacy, production authentication, deployment, and full-path verification | pending | Supabase OAuth, production domain, Cloudflare deployment, Sentry EU if enabled       |

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

Acceptance:

- no-match slots send no email;
- deduplication prevents the same job/profile match being announced twice;
- unsubscribe, per-profile controls, quiet failure, and delivery status are available;
- email payloads contain no CV text;
- daily/monthly delivery guardrails keep the owner below the configured free allowance; and
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

## Continuous source expansion

Source work does not wait for a single final “scraping complete” milestone. After Task 8, authorised connectors can be delivered as independently reviewed slices alongside Tasks 10–15. Prioritise measured UK coverage gaps, job freshness, contract/part-time representation, compensation quality, and duplicate control. Never let a high-profile board bypass the source-access rules.

## Planning rule

Before starting a task, create a focused plan in `docs/superpowers/plans/` with exact files, interfaces, failing tests, verification commands, operational setup, and rollback behaviour. Update `docs/project-status.md` at task start and after the reviewed merge.
