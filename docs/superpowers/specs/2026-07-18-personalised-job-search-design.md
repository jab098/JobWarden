# Personalised UK Job Search Design

**Status:** approved by the owner on 2026-07-18  
**Product:** JobWarden  
**Delivery model:** private beta, administrator-approved access, no pricing or payments

## Purpose

JobWarden should become a UK-only job-search command centre that turns a user's evidence into a useful, explainable stream of roles. It should find permanent, fixed-term, temporary, contract, apprenticeship, internship, casual, zero-hours, full-time, and part-time work, while preserving inside-IR35, outside-IR35, not-applicable, and unknown as distinct states.

The product is not an auto-apply tool. It helps a person discover, assess, organise, and prepare for opportunities; the final application always takes place on the employer's or authorised board's site.

## Experience model

### Onboarding

An approved user creates their first search profile by supplying at least one useful signal:

- upload a CV in DOCX or PDF;
- enter one or more target role families;
- choose an industry or domain;
- enter meaningful skills or keywords; or
- combine any of the above.

The product should encourage, but not require, a CV. A CV produces a richer profile: demonstrated skills, responsibilities, tools, domains, experience, and inferred seniority. The user reviews every extracted or suggested field before it becomes active.

The user records both current seniority and target seniority. Suggestions may widen terminology, but never silently change the user's selected target.

### Named search profiles and Target Feed

A user can maintain multiple named search profiles, for example “Analytics implementation”, “MarTech contracts”, or “Remote part-time”. Each profile stores:

- target role families and literal include/exclude terms;
- industries and domains;
- skills and responsibilities;
- current and target seniority;
- employment and working-time types;
- workplace and UK location preferences;
- contract and IR35 preferences;
- advertised salary/rate range and whether unknown compensation is allowed;
- recency; and
- notification preference.

All enabled profiles feed one primary **Target Feed**. Every result states which profile matched and why. The user may refresh the feed on demand, but refresh searches the shared indexed catalogue; it does not launch an unrestricted source scrape for one person.

### Explore

**Explore** is a separate, opt-in feed for credible adjacent careers. A role family qualifies only when it has at least 70% weighted overlap with the user's demonstrated core skills, no more than two significant trainable gaps, and is outside the user's active target role families. Generic title or keyword coincidence is insufficient.

The user can promote an Explore suggestion into a named search profile, dismiss it, or disable Explore entirely.

### Applications

Users can save, dismiss, consider, and track jobs through applied, screening, interviewing, offer, accepted, rejected, withdrawn, and archived stages. Each application can store a next action and due date. JobWarden may report funnel and follow-up insights, but it must not invent outcomes or submit an application.

## Career evidence model

The canonical profile separates evidence from preferences:

- **Evidence:** CV-derived or user-confirmed skills, responsibilities, tools, industries, role history, tenure, education, and seniority evidence.
- **Preferences:** desired roles, seniority, locations, work patterns, compensation, employment types, IR35, exclusions, and notification settings.
- **Suggestions:** machine-proposed skills, role families, seniority, or career pathways that remain inactive until accepted.

Skills are not a flat keyword bag. Store the normalised concept, user-facing label, category, evidence origin, confidence, evidence snippet reference, proficiency signal, recency, and confirmation state. Store only the minimum snippet needed for review; do not copy whole CV sections into analytics or logs.

Role families should initially use JobWarden's curated UK taxonomy, with ONS SOC 2020 and ESCO as reference vocabularies rather than unquestionable truth. Titles remain searchable as raw text because similar UK work often appears under very different titles.

### Anonymised overlap example

An analytics/MarTech profile may demonstrate event instrumentation, analytics implementation, data quality and governance, behavioural-data pipelines, experimentation, consent and privacy, attribution, BI delivery, and stakeholder implementation work. Direct role families could include analytics implementation, MarTech implementation, measurement and attribution, digital analytics lead, and conversion-rate optimisation. Credible adjacent paths could include product analytics implementation, event-data governance, analytics solutions consulting, consent-technology implementation, and technical customer success for analytics platforms.

Generic software engineering or data science should not qualify merely because JavaScript, SQL, or a technical degree appears in the evidence.

## Explainable matching

Matching is deterministic and evidence-bound. AI may normalise or propose structured concepts, but it does not produce the final score.

### Eligibility gate

Before scoring, exclude jobs that fail a hard preference:

- no explicit UK eligibility evidence;
- excluded employment, working-time, workplace, location, contract, or IR35 state;
- compensation below a hard minimum when compensation is known; or
- unknown compensation when the profile does not allow it.

Unknown is not a negative inference. It is a distinct value controlled by the user.

### Target Feed score

The score is an integer from 0 to 100:

| Component | Weight | Meaning |
| --- | ---: | --- |
| Demonstrated skills and tools | 45 | Weighted overlap between confirmed evidence and explicit or normalised job requirements |
| Responsibilities and work patterns | 20 | Similarity of actual work, not title wording |
| Seniority and experience | 15 | Evidence supports the role's scope and requested level |
| Industry and domain | 10 | Domain familiarity where it materially matters |
| Location, employment, workplace, and IR35 preference fit | 10 | Match against soft preferences after the hard gate |

Salary is a filter and a visible decision reason, not a score booster. A high score must display matched evidence, important gaps, profile name, compensation treatment, and the reason any title synonym or adjacent role was recognised. A role cannot receive credit for evidence absent from both the job and the user profile.

## Compensation

Compensation is stored with provenance:

- **advertised:** explicit source value;
- **estimated:** a JobWarden estimate with methodology, confidence, and date; or
- **unknown:** no responsible value is available.

Never render an estimate as advertised pay. Preserve period, currency, lower and upper values, inclusive/exclusive wording, and raw source text. Support annual salary and contract rates without silently converting one into the other. Filters include a user-visible “include unknown compensation” control.

The roadmap must not assume every UK advert is legally required to show pay. Product copy and filters must remain accurate if legislation changes.

## Shared ingestion and notifications

Job collection is global and source-aware, never multiplied by the number of users. The target weekday cadence is 09:00, 12:00, 15:00, and 18:00 Europe/London. Each source may run less often when its terms, minimum interval, quota, or observed update pattern requires it.

After a completed shared run, JobWarden computes new matches against enabled search profiles. A user receives at most one digest per scheduled slot, and only when at least one genuinely new target match exists. A digest reports the number of new roles and links to the filtered Target Feed; it does not expose CV content.

Manual refresh recomputes against the indexed catalogue. If the catalogue is stale, it may request one coalesced ingestion subject to source cooldown and a global rate limit. It never starts a separate crawl for every click.

## CV storage, extraction, and tailoring

### Upload and retention

- Store original CVs in a private Supabase Storage bucket protected by owner-only policies.
- Accept DOCX and PDF initially. Reject macro-enabled DOCM and unsupported formats.
- Validate extension, MIME type, magic bytes, size, decompression limits, and archive entry paths before extraction.
- Do not follow external OOXML relationships or execute embedded content.
- Never commit a real CV, contact detail, or raw extracted CV to the repository.
- Retain the original until the user replaces or deletes it.
- Delete unsaved generated variants after 24 hours; retain saved variants until the user deletes them.

### Extraction

Extraction produces a versioned structured profile proposal. DOCX is the required input for layout-preserving tailored DOCX output. PDF upload supports profile extraction, but a PDF-only user must be told that an editable DOCX is required for a layout-preserving tailored download.

AI output is untrusted structured input. Validate it with Zod, compare it with deterministic extraction evidence, show the proposal to the user, and record acceptance or rejection. Never place CV text in logs, analytics, Sentry, notification payloads, URLs, or repository fixtures.

### Tailoring

Tailoring is conservative and evidence-bound:

- reorder or emphasise existing skills and achievements relevant to the selected job;
- make wording clearer and closer to the advert where truthful;
- never invent employers, dates, titles, responsibilities, tools, qualifications, or outcomes;
- preserve the original document's layout and section structure wherever technically possible;
- show a change summary and require confirmation before saving; and
- produce a locally downloadable DOCX. PDF export may be added only when it preserves quality reliably.

The document-editing layer, not the language model, owns OOXML modification. Generated content must fit the existing structure or surface a review warning.

## Free-tier-first AI and infrastructure

The product must work without a paid AI dependency. The default architecture is:

- Supabase Postgres, Auth, private Storage, pgvector, Edge Functions, and Cron within documented free limits;
- Cloudflare Workers AI for bounded structured proposals and embeddings;
- deterministic rules for eligibility, matching, scoring, deduplication, scheduling, quotas, and retention;
- Resend only when notification delivery is implemented and remains within its free allowance; and
- no Pinecone, Upstash, Clerk, or paid Claude API by default.

Every metered AI path has a hard free-tier ceiling, per-operation budget, timeout, input-size cap, concurrency cap, and auditable usage counter. There is no automatic paid fallback and no silent model switch. When AI capacity is exhausted or unavailable, JobWarden keeps deterministic search and scoring available, marks the optional suggestion as unavailable, and invites a later retry.

Cloudflare AI output is schema-validated and treated as a proposal. CV content is never used with a provider whose free terms permit training or product improvement from submitted content. A future owner-funded or bring-your-own-key provider requires a separate privacy, retention, cost, and failure review.

Use Supabase pgvector if semantic retrieval becomes justified; a separate vector database is not part of the approved architecture.

## Privacy and security boundaries

- RLS is the final data boundary. A user's CVs, profiles, matches, applications, and generated variants are owner-only; administrators receive only the minimum operational visibility explicitly designed for support.
- Authentication remains deferred for local product development, but production activation is mandatory before any real user or CV data is accepted.
- The development bypass is fictional, server-only, fail-closed outside development, and never grants administrator authority.
- Raw CVs and job descriptions are excluded from application logs, error tracking, analytics, audit metadata, and email.
- Prompts defend against instructions embedded in CVs and job adverts: provider text is data, never system instruction.
- Deletion workflows cover Storage objects, structured profile data, saved variants, notification subscriptions, and user-visible application records, subject only to documented legal or security retention.

## Failure and cost behaviour

The interface must distinguish:

- source stale or unavailable;
- deterministic match available but AI explanation unavailable;
- AI daily allowance exhausted;
- notification queued, delivered, suppressed, or failed;
- compensation advertised, estimated, or unknown; and
- CV extraction incomplete or awaiting user review.

No failure should trigger an unbounded retry, duplicate email, repeated model call, per-user crawl, or automatic paid usage.

## Delivery boundaries

The feature programme is split into independently reviewable Tasks 7–16 in `docs/product/roadmap.md`. Each task gets a focused implementation plan before code is changed. Source coverage expands continuously through the lawful process in `docs/product/source-coverage.md`; broad coverage is an objective, not a claim of literal completeness.

## Acceptance outcomes

The programme is complete when an approved UK user can:

1. build and review a career profile from a CV, role, industry, skills, or keywords;
2. create named search profiles and receive an explainable Target Feed;
3. explore only high-overlap adjacent careers when opted in;
4. filter accurately by recency, role, work pattern, location, contract/IR35, and compensation provenance;
5. track applications and next actions;
6. receive bounded weekday digests only for genuinely new matches;
7. request a truthful, layout-preserving tailored DOCX and approve its changes; and
8. delete their stored CV and derived personal data through a documented, verified path.

