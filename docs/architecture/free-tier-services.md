# Free-Tier Services and Cost Boundaries

**Reviewed:** 2026-07-18
**Rule:** verify provider limits and data terms again immediately before each live integration. Provider allowances can change.

JobWarden is designed to operate as close to free as practical during private beta. Free-tier-first does not mean “call until a bill appears”: metered paths fail closed at an owner-configured ceiling, preserve deterministic product behaviour, and never opt into paid overage automatically.

## Approved baseline

| Capability                                                         | Default                              | Why                                                                          | Hard boundary                                                                                                                          | Setup task              |
| ------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Database, RLS, authentication, private files, functions, schedules | Supabase                             | One security boundary and fewer moving parts                                 | Monitor database, Storage, egress, and function usage; no real data until live RLS/Storage checks pass                                 | Tasks 8, 10, and 16     |
| Web application                                                    | Cloudflare Workers through OpenNext  | Suitable free deployment path and same provider as optional AI               | No paid plan assumption; preview and production limits documented before deployment                                                    | Task 16                 |
| Structured AI proposals and embeddings                             | Cloudflare Workers AI                | Free daily allocation, server-side binding, and no separate default API bill | Owner-configured neurons/day below the provider allowance; exceeding the ceiling stops AI work and never disables deterministic search | Tasks 10–12 and 15      |
| Email digests                                                      | Resend                               | Simple transactional delivery with a private-beta free allowance             | Daily and monthly application counters stay below configured limits; suppress rather than over-send                                    | Task 14                 |
| Semantic storage                                                   | Supabase pgvector, only if justified | Avoids a second data store and separate operational/privacy boundary         | No Pinecone by default                                                                                                                 | Task 11 or 12           |
| Error reporting                                                    | Sentry EU, optional                  | Useful production fault visibility                                           | No default PII, raw CV, job description, request body, cookie, or token; app works without it                                          | Task 16                 |
| Product analytics                                                  | Disabled                             | Consent and personalisation make premature tracking high-risk                | No browser analytics SDK until affirmative consent and a separate data review                                                          | Separate owner decision |

## Current provider references

- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) documents a free daily allocation and failed requests rather than free-plan overage after the allocation is exhausted. JobWarden still sets its own lower reserve so a single feature cannot consume the day.
- [Cloudflare Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) states that customer content is not used to train or improve models without consent. This must be rechecked before CV processing is activated.
- [Cloudflare Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) does not guarantee valid schema output. Every response is untrusted and Zod-validated.
- [Supabase billing and usage](https://supabase.com/docs/guides/platform/billing-on-supabase) is the source of truth for current free database, Storage, egress, and Edge Function allowances.
- [Supabase Cron](https://supabase.com/docs/guides/cron) documents pg_cron scheduling and execution constraints.
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns) is the approved vector route if semantic retrieval proves valuable.
- [Resend limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) is the source of truth for current daily and monthly email allowances.

## Services not in the default architecture

- **Claude API:** strong document reasoning, but production API usage is paid. It may be reconsidered only as an owner-funded or bring-your-own-key option with explicit usage and privacy controls.
- **Gemini free API:** not the default for CVs because free-service data terms may permit submitted content to improve provider products. Never route CV personal data to it without a new reviewed agreement and owner decision.
- **Pinecone:** unnecessary while Supabase pgvector can serve the product's limited private-beta retrieval needs.
- **Upstash Redis:** unnecessary until measured workload demonstrates a cache, rate-limit, or queue problem that Postgres and platform primitives cannot responsibly handle.
- **Clerk/Auth0:** unnecessary because the reviewed architecture already uses Supabase Auth and RLS. Authentication remains deferred locally, not redesigned.

Resend is an approved future exception, not a current dependency. The executable repository guardrail continues to reject it until Task 14 replaces the global ban with a server-only import allowlist limited to the notification adapter and proves daily/monthly ceilings, deduplication, and no client-bundle import.

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
- Target matching is deterministic and runs over already indexed jobs.
- AI enriches profile suggestions, pathway explanations, and CV wording only when capacity is available.
- Notification email is sent only when new target matches exist, at most once per enabled scheduled slot.
- If private-beta usage approaches a free allowance, reduce optional AI/email frequency or pause the optional feature before considering a paid plan.

## Owner setup gates

No platform setup is required for Task 7's fictional local implementation. When a task reaches a live gate, its operations guide must give the owner exact click-by-click/CLI steps and request only the values required for that service:

- Task 8: Supabase project URL, publishable key, server secret, Vault/Cron setup.
- Task 10: private Storage bucket/policies and Cloudflare Workers AI binding before real CV tests.
- Task 14: Resend account, API key, verified sender, and DNS records.
- Task 16: Google OAuth/Supabase callbacks, administrator bootstrap UUID, Cloudflare deployment/domain, and optional Sentry EU project.

Secrets are supplied through local/deployment environment configuration and are never pasted into repository documentation, issues, pull requests, or client-visible variables.
