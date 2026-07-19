# Free-Tier Services and Cost Boundaries

**Reviewed:** 2026-07-18
**Rule:** verify provider limits and data terms again immediately before each live integration. Provider allowances can change.

JobWarden is designed to operate as close to free as practical during private beta. Free-tier-first does not mean “call until a bill appears”: metered paths fail closed at an owner-configured ceiling, preserve deterministic product behaviour, and never opt into paid overage automatically.

## Approved baseline

| Capability                                                         | Default                                                                      | Why                                                                                                            | Hard boundary                                                                                                                                                                                                                                                                                                                                   | Setup task              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Database, RLS, authentication, private files, functions, schedules | Supabase                                                                     | One security boundary and fewer moving parts                                                                   | Monitor database, Storage, egress, and function usage; no real data until live RLS/Storage checks pass                                                                                                                                                                                                                                          | Tasks 8, 10, and 16     |
| Web application                                                    | Cloudflare Workers through OpenNext                                          | Suitable free deployment path and same provider as optional AI                                                 | No paid plan assumption; preview and production limits documented before deployment                                                                                                                                                                                                                                                             | Task 16                 |
| Structured AI proposals and embeddings                             | Cloudflare Workers AI                                                        | Free daily allocation, server-side binding, and no separate default API bill                                   | Owner-configured neurons/day below the provider allowance; exceeding the ceiling stops AI work and never disables deterministic search                                                                                                                                                                                                          | Tasks 10–12 and 15      |
| Email digests                                                      | Resend                                                                       | Simple transactional delivery with a private-beta free allowance                                               | Daily and monthly application counters stay below configured limits; suppress rather than over-send                                                                                                                                                                                                                                             | Task 14                 |
| Semantic storage                                                   | Supabase pgvector, only if justified                                         | Avoids a second data store and separate operational/privacy boundary                                           | No Pinecone by default                                                                                                                                                                                                                                                                                                                          | Task 11 or 12           |
| Error reporting                                                    | Sentry EU, optional                                                          | Useful production fault visibility                                                                             | No default PII, raw CV, job description, request body, cookie, or token; app works without it                                                                                                                                                                                                                                                   | Task 16                 |
| UK place centroids for radius search                               | Ordnance Survey Open Names via postcodes.io, and OpenStreetMap via Nominatim | Distance search needs coordinates, and a centroid written from memory returns wrong jobs while looking correct | **Build time only.** `scripts/build-uk-places.mjs` runs by hand and commits its output; the product makes no geocoding request at runtime and works with no network at all. OGL v3 (OS, Royal Mail) and ODbL (OpenStreetMap); attribution travels in `packages/domain/src/uk-places.generated.json` and `supabase/seed/uk-places.generated.sql` | Task 25                 |
| Product analytics                                                  | Disabled                                                                     | Consent and personalisation make premature tracking high-risk                                                  | No browser analytics SDK until affirmative consent and a separate data review                                                                                                                                                                                                                                                                   | Separate owner decision |

The Reed Jobseeker API is a credentialed source integration, not a metered AI service. JobWarden still treats it as a bounded external dependency: one shared page of at most 50 jobs, a six-hour minimum source interval, four concurrent detail calls, and no automatic paid or alternative-provider fallback. A provider limit or unavailable credential fails only that source and cannot spend money or abort later sources.

Task 10's career extraction path keeps optional AI disabled with `CAREER_PROFILE_AI_DAILY_ALLOWANCE=0` unless the owner deliberately activates it. The database accepts an application-wide daily allowance only from `0` through `25`, reserves it under a global transaction lock, records each reservation against its user, and permits only one extraction per user at a time. No user's daily count can exceed the same global ceiling. Each optional call is limited to 60,000 input characters, 4,000 output tokens, and 30 seconds. Invalid output, timeout, unavailable credentials, or exhausted allowance falls back to deterministic extraction with no retry or paid route. The usage ledger stores only user, day, count, and timestamp; prompts and CV-derived text are excluded. Raw structured proposals expire after 24 hours through the hourly database retention job.

## Current provider references

- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) documents a free daily allocation and failed requests rather than free-plan overage after the allocation is exhausted. JobWarden still sets its own lower reserve so a single feature cannot consume the day.
- [Cloudflare Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) states that customer content is not used to train or improve models without consent. This must be rechecked before CV processing is activated.
- [Cloudflare Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) does not guarantee valid schema output. Every response is untrusted and Zod-validated.
- [Supabase billing and usage](https://supabase.com/docs/guides/platform/billing-on-supabase) is the source of truth for current free database, Storage, egress, and Edge Function allowances.
- [Supabase Cron](https://supabase.com/docs/guides/cron) documents pg_cron scheduling and execution constraints.
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns) is the approved vector route if semantic retrieval proves valuable.
- [Resend limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) is the source of truth for current daily and monthly email allowances.
- [Reed's Jobseeker API documentation](https://www.reed.co.uk/developers/jobseeker) is the source of truth for its search/detail interface and credential method. Its public page does not document a price, quota, retention grant, or redistribution terms, so the source remains disabled until the owner reviews registration terms and confirms the intended use.

## Services not in the default architecture

- **Claude API:** strong document reasoning, but production API usage is paid. It may be reconsidered only as an owner-funded or bring-your-own-key option with explicit usage and privacy controls.
- **Gemini free API:** not the default for CVs because free-service data terms may permit submitted content to improve provider products. Never route CV personal data to it without a new reviewed agreement and owner decision.
- **Pinecone:** unnecessary while Supabase pgvector can serve the product's limited private-beta retrieval needs.
- **Upstash Redis:** unnecessary until measured workload demonstrates a cache, rate-limit, or queue problem that Postgres and platform primitives cannot responsibly handle.
- **Clerk/Auth0:** unnecessary because the reviewed architecture already uses Supabase Auth and RLS. Authentication remains deferred locally, not redesigned.

Resend is now an active, tightly bounded exception. Task 14 replaced the global ban with an exact-path allowlist in the executable guardrail: only the adapter in `supabase/functions/send-digests/`, its test, and that function's deployment entry point may reference it, and the guard now reads the whole `supabase/functions` tree as well as `apps` and `packages`. Delivery uses the documented Resend HTTP API rather than the npm SDK, so no dependency was added to the workspace at all.

Ceilings are application-wide and counted from `career_notification_deliveries`, which is both the user-visible delivery status and the auditable counter — there is no second ledger that could disagree with it. In-flight `pending` rows count towards both ceilings, so a send cannot race past the allowance. Defaults are 80 per day and 2,500 per month, deliberately below the documented free allowances; a reached ceiling records a `suppressed_daily_cap` or `suppressed_monthly_cap` row and sends nothing, with no paid fallback. Setting `NOTIFICATION_DAILY_LIMIT=0` is the documented immediate pause. Without `RESEND_API_KEY` the runtime is inert.

## Cost-control pattern

Every metered operation records the feature, provider, model/version, units reserved and consumed, result state, and non-sensitive correlation ID. Before making a call, the server checks:

1. per-user request cooldown;
2. per-feature daily allowance;
3. global daily reserve;
4. input-size and output-size caps;
5. concurrency limit; and
6. provider availability/circuit state.

The counter must be atomic. Failure states are `capacity_exhausted`, `provider_unavailable`, `invalid_output`, `timed_out`, and `cancelled`; none causes an automatic paid call or provider fallback. Prompts and outputs containing CV data are never written into the usage ledger.

## Private-beta capacity assumptions

- Ingestion is shared across all users and driven by source cadence, so user growth does not multiply source requests.
- Task 8 schedules four shared weekday Edge Function invocations in `Europe/London`, admits at most four sources and 500 received jobs per invocation, and allows at most three five-minute leased attempts per request. On 2026-07-18 Supabase documented 500,000 monthly Edge Function invocations on Free; provider, database, egress, and runtime ceilings remain separate and must be rechecked before activation.
- Target matching is deterministic and runs over already indexed jobs.
- AI enriches profile suggestions, pathway explanations, and CV wording only when capacity is available.
- Notification email is sent only when new target matches exist, at most once per enabled scheduled slot.
- If private-beta usage approaches a free allowance, reduce optional AI/email frequency or pause the optional feature before considering a paid plan.

## Owner setup gates

No platform setup is required for Task 7's fictional local implementation. When a task reaches a live gate, its operations guide must give the owner exact click-by-click/CLI steps and request only the values required for that service:

- Task 8: Supabase project URL, server secret, and Vault/Cron setup using the exact [shared ingestion operations guide](../operations/ingestion.md). A publishable key is not used by the custom bearer-protected scheduler path.
- Task 9: Reed API registration and server-only `REED_API_KEY` setup using the exact [Reed ingestion runbook](../operations/reed-ingestion.md). Do not send the key in chat. Create the source disabled, validate it against a staging database, and enable it only after the documented terms/retention decision and real pgTAP checks are complete.
- Task 10: the private bucket/policies, extraction function, retention schedule, and authenticated deletion path must pass the Docker-backed and linked-environment checks in [Career Profile Data Operations](../operations/career-profile-data.md) before any real CV test. Cloudflare Workers AI is optional and stays disabled by default; it is not a prerequisite for deterministic extraction.
- Task 14: Resend account, API key, verified sending subdomain, and SPF/DKIM/DMARC records using the exact [scheduled digest operations guide](../operations/notifications.md). The implementation is complete and inert until those are in place.
- Task 16: Google OAuth/Supabase callbacks, administrator bootstrap UUID, Cloudflare deployment/domain, and optional Sentry EU project.

Secrets are supplied through local/deployment environment configuration and are never pasted into repository documentation, issues, pull requests, or client-visible variables.
