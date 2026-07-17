# Shipping Standards — Agent Operating Prompt

Paste this into the project's `CLAUDE.md` / agent config, above your feature specs. It's not a feature spec, it's the lens the agent runs every feature through so it doesn't tunnel-vision on "does the code work" and skip "does this survive contact with real users, real money, and free-tier limits."

---

## Core directive (give this to the agent verbatim)

You are not just implementing a feature. You are shipping something onto infrastructure with real limits, real money moving through it, and real legal exposure once it has UK/EU users. Before writing code for any change, decide which lenses below actually apply, and say so in one line before you start: "Lenses in play: X, Y." Most changes only trigger one or two, not all of them — don't pad a copy fix with a compliance review. If none apply beyond the feature itself, say that explicitly rather than skipping the step. This makes scope creep a decision, not an accident.

## Stack failure map

Reference whenever a change touches one of these. This is where "works on my machine" dies in production.

| Service | Silent failure mode if ignored | Check every time it's touched |
|---|---|---|
| Supabase | Table with no RLS is world-readable/writable via the API | Does every new table have RLS policies for select/insert/update/delete, scoped to the right role? |
| Vercel | Env var set locally but missing from Preview/Production kills the feature only after deploy | Is the var added to all three environments, not just `.env.local`? |
| Stripe | Webhook processed twice charges or grants access twice | Is the handler idempotent (check event ID before acting) and signature-verified? |
| Clerk | Trusting a client-sent user ID instead of the verified session | Does every server action read the user ID from the verified session/token, never from request body? |
| Resend | Emails land in spam because the sending domain isn't authenticated | Are SPF/DKIM/DMARC records live in Cloudflare for the sending domain? |
| Cloudflare | A DNS/SSL edit takes the whole site down, not just one record | If DNS changed, was it tested on a subdomain first? |
| PostHog | Feature ships with zero events, so you can't tell if anyone uses it | Is there at least one event on the primary action of this feature? |
| Sentry | Errors happen in prod and nobody finds out for weeks | Is this code path wrapped so failures actually report to Sentry, not swallowed? |
| Upstash | A public endpoint with no rate limit gets hammered until the free tier dies or it's abused | Is this endpoint rate-limited if it's publicly reachable or costs money per call? |
| Pinecone | Re-embedding unchanged data burns through free-tier quota fast | Is there a check to avoid re-indexing content that hasn't changed? |

## Security & secrets baseline

Run these regardless of what feature is being built — they're not optional add-ons, they're table stakes before anything goes live with real users.

**OWASP basics**
- SQL injection: use the Supabase client's query builder or parameterized RPC calls, never string-concatenate user input into raw SQL
- XSS: never render unescaped user input (`dangerouslySetInnerHTML` or equivalent) without sanitizing; lean on the framework's default escaping
- Broken auth: no custom session or password-reset logic — Clerk owns identity, don't build a parallel auth path "just for this one flow"
- CSRF: every state-changing request checks a verified session, not just the presence of a cookie

**Secrets**
- `.env*` goes in `.gitignore` from the first commit, not added after the fact
- `.gitignore` alone isn't enough once a secret has actually been committed — it's still sitting in git history. If that happens: rotate the real key/secret *and* purge history (`git filter-repo` or BFG), deleting the line from the current file doesn't remove it
- Only variables meant for the browser get a public prefix (`NEXT_PUBLIC_`, `VITE_`); server-only secrets (Supabase service role key, Stripe secret key, Resend API key, Pinecone key) must never carry that prefix or be referenced in client-side code
- Run a secret scanner (gitleaks or trufflehog) before the first push and periodically after — catches what a manual read-through misses
- Strip tokens, API keys, and full request bodies from logs and Sentry breadcrumbs — Sentry capturing a request with an Authorization header is a leak, not a debugging win

**Input validation**
- Every endpoint validates input against a schema (Zod or equivalent) before it touches the database; reject malformed payloads instead of trying to coerce them
- Set a max request body size, don't trust a client-declared content-length
- Auth routes specifically: rate limit around 5 attempts per 15 minutes per IP/account, and return the same generic failure for "wrong password" and "no such user" so account existence isn't leaked

## AI / LLM-specific checks

Applies to anything hitting an LLM API or Pinecone, agent features included.

- Per-user token/spend cap on any LLM call — without one, a single user can run the bill up in one session, not just one day
- Stream responses (SSE or equivalent) instead of waiting for the full completion — agents don't do this by default, has to be asked for explicitly
- Specific, contextual error messages instead of "something went wrong" — matters more here because the AI call itself is often the thing that failed, and a generic string makes it undebuggable
- Timeout and a capped retry count on AI calls specifically, so a hung request doesn't hold a Vercel function open and burn execution time
- Audit/observability log for actions the AI agent takes on a user's behalf — not the same as Sentry, this is a record of what happened, not just what broke, and it's what lets you (or the agent) reconstruct a bug after the fact

## Cross-cutting checks (apply based on what the feature actually touches)

- **Touches user data** → RLS in place, and is there a path to export/delete it on request (GDPR erasure)
- **Touches money** → idempotent webhook handling, signature verification, correct subscription state (trialing / active / past_due / canceled), test keys never mixed with live
- **Touches auth** → server-side session verification, never client-trusted identity
- **Touches email** → deliverability records set up, unsubscribe link present if marketing (not required for transactional)
- **Touches an external API** → what happens when it's slow, down, or rate-limiting you — does the app degrade gracefully or crash
- **Is user-facing** → loading state, empty state, error state, mobile width all handled
- **Adds infra cost** → what's the free-tier ceiling, and what's the behavior when it's hit (fail gracefully vs. silent breakage)
- **Touches an auth route specifically** → ~5 attempts/15 min rate limit, generic non-account-revealing failure message
- **Touches an LLM/AI call** → per-user token cap, streaming response, timeout + capped retries
- **Mutates state (create/update/delete)** → audit log entry: who, what, when, on what resource

## Definition of done

Not "it works" — "it's shippable":

- [ ] RLS covers any new table
- [ ] Env vars set in dev, preview, and prod
- [ ] Errors on this path report to Sentry with useful (non-PII) context
- [ ] A PostHog event exists if this is a funnel step
- [ ] Webhooks are signature-verified and idempotent
- [ ] Public or costly endpoints are rate-limited
- [ ] You know the free-tier ceiling for anything new this touches, and what breaks first
- [ ] If it collects personal data, it's covered by the privacy policy, and consent is gated before non-essential cookies fire
- [ ] Inputs are validated against a schema; oversized or malformed payloads are rejected
- [ ] Secret scan is clean, no key has ever touched a commit
- [ ] Error messages are specific enough to debug from, not a generic "something went wrong"
- [ ] Any mutating action writes an audit log entry
- [ ] If this calls an LLM: per-user cap exists, response streams, timeout and retry cap are set

## Legal baseline (UK/EU users)

This stack routes personal data through US-hosted subprocessors: Supabase, Vercel, Clerk, Resend, Sentry, Upstash, Pinecone. Before real users sign up, the project needs:

- Privacy policy naming the subprocessors and the transfer mechanism (UK IDTA / SCCs)
- Terms of Service
- Cookie consent gate before PostHog or any non-essential cookie fires — this is UK GDPR/PECR, applies regardless of where the user is
- If the product itself sells to UK/EU consumers, Stripe Tax or manual VAT handling on those transactions (separate from your own company's VAT registration)

---

**How to use this:** drop it at the top of `CLAUDE.md`. When you start a feature, tell the agent to state its lenses first, then build. If it skips straight to code on anything touching data, money, or auth, that's the tell it's tunnel-visioning.
