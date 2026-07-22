# UK Source Coverage Strategy

## Decision

JobWarden aims for broad, trustworthy coverage of jobs advertised for work in the United Kingdom. Greenhouse is only the first connector used to prove the ingestion path. It is a per-employer applicant-tracking system, not a central UK job database and not the product's long-term coverage ceiling.

No single source contains every UK vacancy. Coverage must be layered, measured, deduplicated, and expanded only through documented public endpoints, licensed feeds, or explicitly permitted collection.

## Coverage layers

1. **Official national and public-sector services**
   - GOV.UK Find a Job for England, Scotland, and Wales.
   - JobApplyNI for Northern Ireland.
   - NHS Jobs, Civil Service Jobs, Teaching Vacancies, Find an Apprenticeship, and other official sector services.
2. **Broad aggregators with an authorised API or feed**
   - Reed's documented Jobseeker API is the first implemented broad-discovery adapter. It remains disabled until the owner completes the source-specific live gate.
   - Adzuna's GB API remains a permission- and licence-gated candidate rather than an automatic fallback.
   - Other aggregators require a source-specific API, licence, terms, rate-limit, attribution, and retention review before implementation.
3. **Employer applicant-tracking systems**
   - Greenhouse first, followed by candidates such as Lever and Ashby where their documented public job-posting APIs permit collection.
   - Each employer board is an individual source with its own compliance record and allowed application hosts.
   - **The allowed application host must be read from the board, never assumed.** It is set by the employer, not the platform, and getting it wrong quarantines every advert on that board while the run still reports success. See [Application hosts vary per employer](#application-hosts-vary-per-employer).
4. **Specialist UK boards**
   - Sector, region, contract, part-time, charity, public-service, graduate, and apprenticeship boards can fill measurable gaps.
   - A board is added only when access is permitted and the connector can meet JobWarden's reliability and provenance standards.

## Application hosts vary per employer

Measured on 2026-07-21 by probing all 46 configured Greenhouse boards, after an earlier revision of the ingestion runbook told the reader to use `boards.greenhouse.io` for every board.

**That instruction was wrong for most of them, and wrong in the worst way.** `allowed_hosts` gates the application URL, so a mismatch quarantines every advert on the board as `invalid_application_url` — while the run itself reports success. Nothing turns red; the board simply contributes nothing forever.

The host is chosen by the employer, not by the platform. Across 46 boards there were **19 distinct hosts**:

| Shape                         | Examples                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `job-boards.greenhouse.io`    | the common default — Monzo, Graphcore, Intercom, GitLab                                                             |
| `job-boards.eu.greenhouse.io` | Gymshark, Speechmatics, TrueLayer                                                                                   |
| `boards.greenhouse.io`        | Figma, Glossier, Cloudflare — still live, but a minority                                                            |
| the employer's own site       | `stripe.com`, `databricks.com`, `careers.datadoghq.com`, `jobs.elastic.co`, `careers.airbnb.com`, `www.mongodb.com` |
| an unrelated third party      | `wayve.firststage.co`, `app.careerpuck.com`                                                                         |

Read it from the board before adding the source:

```sh
curl -s "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" \
  | python3 -c "import json,sys;from urllib.parse import urlparse;\
print({urlparse(j['absolute_url']).netloc for j in json.load(sys.stdin)['jobs']})"
```

The same holds for Lever, Ashby and Workable. Each is a per-employer board, so each carries its own application host, and none of them can be filled in from a template.

There is also **no directory of Greenhouse boards**. Expanding coverage is always probe-and-verify against `boards-api.greenhouse.io`: confirm the board exists, count the UK roles, and read the host. Of roughly 180 well-known UK-hiring employers probed, about 135 had no public board at all — so a list written from memory would be mostly wrong, and confidently so.

### Added 2026-07-22 — eleven boards, now configured and enabled

Eleven more well-known UK-hiring employers were probed-and-verified against `boards-api.greenhouse.io` (about a hundred named candidates probed across two rounds; most 404, and several public boards carried no UK roles at all — Cleo, Stability AI, PlanetScale, Mediatonic, Pleo — so they were dropped). All eleven are **now configured and enabled** in the live project — SumUp via the admin form, the other ten via the audited `upsert_job_source` RPC (actor set to the administrator, one atomic transaction) — taking the Greenhouse board count from 46 to **57**. The `46 boards` / `19 hosts` figures in the section above are the 2026-07-21 snapshot and predate this; four employer-own hosts here (`sumup.com`, `www.dojo.careers`, `www.fireblocks.com`, `www.cockroachlabs.com`) are new to the host set.

UK role counts are a point-in-time snapshot read the day they were added. The `allowed_hosts` value below was read from each board with the one-liner above; getting it wrong quarantines every advert on the board while the run reports success.

| Board token     | Employer    | UK roles (2026-07-22) | `allowed_hosts`               |
| --------------- | ----------- | --------------------- | ----------------------------- |
| `sumup`         | SumUp       | 80                    | `sumup.com`                   |
| `ebury`         | Ebury       | 35                    | `job-boards.eu.greenhouse.io` |
| `dojo`          | Dojo        | 28                    | `www.dojo.careers`            |
| `postman`       | Postman     | 17                    | `job-boards.greenhouse.io`    |
| `algolia`       | Algolia     | 16                    | `job-boards.greenhouse.io`    |
| `contentful`    | Contentful  | 15                    | `job-boards.greenhouse.io`    |
| `toogoodtogo`   | TooGoodToGo | 11                    | `job-boards.greenhouse.io`    |
| `fireblocks`    | Fireblocks  | 8                     | `www.fireblocks.com`          |
| `typeform`      | Typeform    | 7                     | `job-boards.greenhouse.io`    |
| `cockroachlabs` | CockroachDB | 5                     | `www.cockroachlabs.com`       |
| `heycar`        | heycar      | 3                     | `job-boards.greenhouse.io`    |

All are `coverage_mode = complete` like every Greenhouse board — one request returns the whole board, so the two-consecutive-omissions closure rule applies — and were enabled with a 2-hour (`120`-minute) cadence. `ebury` uses the EU Greenhouse host and the rest the common default, apart from the four employer-own hosts noted above. UK eligibility is still decided per advert by the classifier at ingestion — these counts are the ceiling, not a guarantee every one publishes, and jobs appear after the next weekday ingestion run.

## Non-negotiable source rules

- A listing is published only when it contains explicit evidence that the work is in, or open to workers in, the UK.
- Permanent, fixed-term, temporary, contract, apprenticeship, internship, casual, zero-hours, full-time, and part-time roles remain in scope.
- Contract metadata preserves inside-IR35, outside-IR35, not-applicable, and unknown without guessing.
- JobWarden links to the canonical application page and never submits applications.
- Connectors do not bypass authentication, CAPTCHAs, robots restrictions, paywalls, anti-bot controls, or denied access.
- Every source records endpoint/feed provenance, terms and robots review dates, cadence, attribution requirements, and removal handling.
- Failed or incomplete source runs never close jobs.
- Complete snapshots may close a source occurrence only after two consecutive complete successful omissions. Incremental discovery omissions never close a job; an advertised closing date may do so through the bounded expiry process.

## Expansion sequence

The foundation began with one end-to-end Greenhouse vertical slice. Source expansion remains a separate, measured delivery stream:

1. measure coverage and freshness through the administrator source-health view;
2. activate the implemented Reed GB discovery adapter only after its live gate;
3. add official national and high-value sector sources;
4. add reusable ATS adapters;
5. use specialist boards to close evidenced gaps;
6. review duplicates, provenance, stale listings, and source health before each rollout.

The product may pursue very broad UK coverage, but it must not claim literal completeness. Some vacancies are unadvertised, duplicated, inaccessible through permitted interfaces, or available only through changing commercial arrangements.

## Current large-board status

These records describe connector eligibility and implementation state. They do not authorise live access by themselves.

| Source    | Current status                                                    | Evidence and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reed      | **Implemented; disabled pending owner setup and live validation** | Reed's [Jobseeker API documentation](https://www.reed.co.uk/developers/jobseeker) documents search and job-detail endpoints, API-key registration, and HTTP Basic authentication with the key as username and a blank password. The adapter uses the first page of at most 50 results returned by the documented search endpoint, at most four concurrent detail calls, and a six-hour minimum cadence; it makes no undocumented ordering claim. Reed's page does not state a data-retention, redistribution, attribution, or termination/removal grant. The owner must therefore review the terms presented during registration, record the decision, and obtain written clarification where required before enabling the source. |
| LinkedIn  | **Do not scrape**                                                 | LinkedIn's partner interfaces are centred on authorised [job posting and synchronisation](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/job-posting-overview), not a general job-search ingestion API for JobWarden. Its [crawling terms](https://www.linkedin.com/legal/crawling-terms) require express permission for automated crawling. Do not collect LinkedIn listings without a written permission and an applicable partner agreement.                                                                                                                                                                                                                                                                    |
| Indeed    | **Authorised feed or written permission required**                | Indeed's current [partner documentation](https://docs.indeed.com/) focuses on job posting, employer, and candidate workflows; access is provisioned through its partner programme. Its [Terms of Service](https://www.indeed.com/legal?hl=en_US) prohibit unapproved bots, scraping, spiders, agentic automation, and data mining. Do not scrape. Reconsider only with a written permission or authorised discovery feed whose display, attribution, and retention terms fit JobWarden.                                                                                                                                                                                                                                            |
| Glassdoor | **Permission required**                                           | Glassdoor exposes [API registration](https://www.glassdoor.com/developer/register_input.htm) and [public API terms](https://www.glassdoor.com/crs/api/glassdoor-public-api-terms.pdf), indicating controlled or partner access with display conditions. Its [site terms](https://www.glassdoor.com/about/terms-2022-12-01/) prohibit unapproved scraping, stripping, or mining. Do not implement a connector until access and the applicable display, attribution, caching, and retention terms are confirmed in writing.                                                                                                                                                                                                          |

## Dated connector compliance records

### Reed Jobseeker API — reviewed 2026-07-18

- **Official interface:** `GET https://www.reed.co.uk/api/1.0/search` followed by `GET https://www.reed.co.uk/api/1.0/jobs/{jobId}`. The search endpoint supports permanent, contract, temporary, part-time, full-time, and salary criteria, and documents a provider maximum of 100 results per page.
- **Authentication:** API key in the HTTP Basic username with a blank password. `REED_API_KEY` is server-only, must never appear in Git, chat, logs, URLs, or browser code, and has no paid fallback.
- **Facts consumed:** employer, title, description, location, salary range, currency, salary period, contract type, working time, expiry date, Reed URL, and a provider-supplied external URL. Hidden salary remains unknown; JobWarden does not estimate it in Task 9.
- **JobWarden limits:** one 50-job page per eligible run; four detail calls in flight; bounded retry; immediate source failure on rate limiting; six hours minimum between successful source claims.
- **Coverage semantics:** incremental. A missing result in a later page is not evidence that the role closed and cannot advance omission counters.
- **Attribution, storage, redistribution, and termination:** not specified on the public Jobseeker API page. Treat them as unapproved until the registration terms or written Reed confirmation explicitly permit the intended private-beta use. The source stays disabled meanwhile.
- **Disable/removal:** disable the source immediately on permission change, credential compromise, or provider request. Follow the [Reed ingestion runbook](../operations/reed-ingestion.md) for credential removal and controlled deletion; do not silently retain provider data after a termination instruction.

### Adzuna GB API — reviewed 2026-07-18

- The official [overview](https://developer.adzuna.com/overview) documents `https://api.adzuna.com/v1/api/jobs/gb/search/{page}` with required `app_id` and `app_key`; the [search guide](https://developer.adzuna.com/docs/search) exposes job-ad results including predicted-salary provenance.
- The official [API terms](https://developer.adzuna.com/docs/terms_of_service) list default limits of 25 requests/minute, 250/day, 1,000/week, and 2,500/month. Organisational use outside the stated 14-day validation period may require written consent and a licence.
- Published listings require the specified “Jobs by Adzuna” attribution. On termination, acquired Adzuna data must be removed from the product's pages.
- **Decision, updated 2026-07-21: the owner accepted the terms, the credential is configured, and the adapter and provider vocabulary are implemented. The source is NOT enabled and no `job_sources` row exists.**
- **What still blocks enabling it: the "Jobs by Adzuna" attribution.** The terms make it mandatory on published listings, and the job feed does not currently carry a source per listing — `normalisedJobSchema` has no provider field and the feed query does not select one, so displaying it means threading the source through the query, the domain type and the card. Creating the source row before that ships would publish listings in breach of the licence. Do not create it until the attribution renders.
- Live shape confirmed against the GB endpoint on 2026-07-21, not from the documentation: 726,430 adverts indexed; `salary_is_predicted` is the **string** `"0"`/`"1"` and 26% of a fifty-advert sample were predictions, which are `estimated` and never `advertised`; `salary_min` is `0` on 42% of adverts beside a real maximum and means _no minimum stated_, so recording it would advertise a £0 floor; there is **no period field** and the figures are not consistently annual — the same sample held `45000` and `29` — so the period stays `unknown`.
- `location.area[0]` is always the literal `"UK"`. It is never read as the location, following the precedent Lever and Teaching Vacancies set: a provider's country assertion must not become the eligibility evidence.
- **Yield is limited by the gazetteer, not the adapter.** Roughly four fifths of adverts quarantine as `ambiguous_uk_eligibility` because Adzuna surfaces settlements `uk-places.generated.json` does not carry (Caputh, Helsington, Whittington Moor, Newport-On-Tay). Measured across fifty live adverts: `display_name` published 8, the most specific area 11. Widening that dataset lifts every source at once.
- **Cadence is bound by the monthly cap, not the daily one.** 2,500 requests/month is roughly 83 a day for the whole product; the adapter reads four pages of 50 per run. A six-hour floor matches Reed and Teaching Vacancies.
- Descriptions are truncated by the provider to exactly 500 characters with an ellipsis. The full advert exists only behind the redirect, and JobWarden links to it rather than reproducing it.
- On termination, acquired Adzuna data must be removed from the product's pages.

## Official UK public-sector services — reviewed 2026-07-21

Task 38's access-confirmation pass. Coverage layer 1 has been ranked first in this document since it was written while carrying no task at all; this is the record that closes that gap.

Each service below was checked against its own current interface rather than against a summary. Where a claim could not be verified directly, that is stated instead of being smoothed over. Being a public service is **not** by itself a grant, and none of the decisions below assume that Crown copyright or an Open Government Licence applies without the provider saying so.

**Result: one service is usable now, one needs a free self-service key, and three stop at the owner.**

### Teaching Vacancies (Department for Education) — implemented, ships disabled

- **Official interface:** `GET https://teaching-vacancies.service.gov.uk/api/v1/jobs.json`, confirmed by request on 2026-07-21. Read-only. The response carries its own `info` block naming the licence, terms and support contact, so the service documents itself at the endpoint.
- **Authentication:** none. No API key, registration, approval or agreement is required, confirmed by an unauthenticated request succeeding.
- **Licence:** Open Government Licence v3.0, declared in the response as `license.name` "Open Government License" with `license.url` `https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/`.
- **Terms for API users:** the response's own `termsOfService` points at [a dedicated API section](https://teaching-vacancies.service.gov.uk/pages/terms-and-conditions#terms-and-conditions-for-api-users), which states in full: "You are free to reuse job listing data under the terms of the Open Government Licence for public sector information with the following exception: you must not charge any fee or commission for contacting, interviewing or hiring a respondent to your listing if you have reused Teaching Vacancies data."
- **Why that exception is safe here, and why it must stay safe.** JobWarden has no pricing model — no payments, subscriptions, plans, trials, premium UI or plan-based quotas — and applications are manual links to the employer, never submitted by JobWarden. The single restriction this licence imposes is therefore one the product's own permanent constraints already guarantee structurally rather than by promise. **This is now a licence obligation as well as a product rule: charging a fee or commission around a Teaching Vacancies listing would breach the terms this source is ingested under.**
- **robots.txt:** fetched 2026-07-21. Disallows `/check`, `/subscriptions/`, `/documents/`, `/attachments/`, `/*-jobs*?*`, `/jobs*radius=*` and `/support-users` for all agents. **`/api` and `/api/v1` are not disallowed.** Re-check before any change to which paths the adapter requests.
- **Shape:** each vacancy is a schema.org `JobPosting` carrying `title`, `description`, `datePosted`, `validThrough`, `jobLocation` (including postal code), `baseSalary` (currency, value, unit), `employmentType`, `hiringOrganization`, `occupationalCategory`, `directApply` and `url`.
- **Compensation:** `baseSalary` is advertised by the employer, so it is `advertised` provenance where present and `unknown` where absent. Never estimated. An `occupationalCategory` or pay-band name is not a figure.
- **Coverage semantics:** **incremental**, not complete, and this is deliberate. The response is paginated and a bounded free-tier run will not read every page, so an absent vacancy is never evidence that the role closed and must never advance an omission counter. `validThrough` may close a listing through the existing bounded expiry process.
- **Attribution:** OGL v3 requires acknowledging the source. Attribute as Teaching Vacancies with the standard public-sector-information wording wherever listings from this source are shown.
- **Volume:** the API's own `meta` block reported `count: 2970` across `totalPages: 30` on 2026-07-21, at 100 adverts per page. An earlier note here said roughly 6,400 from the service's HTML listing page; **the API is the authority and 2,970 is the correct figure.** Substantially larger than any single employer ATS board, and far smaller than the whole UK market — never describe it as comprehensive.
- **Pagination, confirmed 2026-07-21:** 100 adverts per page. The response carries `links` with `self`, `first`, `last`, `prev` and `next`, and `meta` with `totalPages` and `count`. Two earlier second-hand figures — 50 per page and 25 per page — were both wrong, which is the whole reason this had to be confirmed against the service rather than a summary.
- **JobWarden limits:** five pages per run, which is five requests and cycles the whole service in under two days on the weekday schedule. Bounded retries; the adapter follows only a `next` link that stays on the service's own endpoint, never one that points elsewhere.
- **A trap in the data, recorded so it is not rediscovered:** `baseSalary.value.value` is **free text, not a number**, and its sibling `unitText` is **unreliable** — an hourly rate is served with `unitText: "YEAR"`. Neither is trusted. The raw text goes to the shared deterministic compensation parser, which infers the period from the words the employer actually wrote. A figure is never invented, and text the parser cannot resolve stays advertised with null figures rather than being guessed at.
- **Location evidence:** built from `addressLocality`, `addressRegion` and `postalCode` — places the advert itself names. `addressCountry` is deliberately excluded, following the precedent recorded in the Lever adapter: making a provider's country assertion into eligibility evidence would change the contract for every provider. Task 37's postcode recognition is what lets an advert publish when its locality is missing from the gazetteer.
- **Duplicate control, and its honest limit — recorded by the independent review pass, 2026-07-21.** Task 38's acceptance asked for duplicate control to be _proven_ against a listing that also appears on an existing source. It is not proven, because as built it does not happen. Deduplication reconciles on the exact canonical application URL, and this adapter's canonical destination is the service's own advert page on `teaching-vacancies.service.gov.uk`. A teaching role also carried on the school's own ATS board therefore produces a different canonical key and **will appear twice**. That is not a defect to code around: fuzzy title/employer merging is forbidden by `AGENTS.md`, and the service's advert URL is the only canonical destination it offers, so the alternative would be inventing an identity the provider never asserted. Within the source, deduplication works normally. Expect cross-source duplicates for schools that publish in both places, and treat this as a known property rather than a bug report when the source is enabled.
- **Disable/removal:** disable the source on any provider request, terms change or licence change, and remove acquired data on a termination instruction.

### Find an apprenticeship (Department for Education) — needs a free key, owner action

- The [Apprenticeship service developer hub](https://developer.apprenticeships.education.gov.uk/) documents a **Display Advert API** whose stated purpose is getting and displaying adverts from Find an apprenticeship, which is the direction JobWarden needs.
- **An API key is required**, sent as the `Ocp-Apim-Subscription-Key` request header. The hub states a key is obtained by **self-service registration** — "You can create an account to get an API key" — rather than by commercial negotiation, so this is a small owner action and not a licensing blocker.
- **Licence:** Open Government Licence v3.0, except where otherwise stated. Callers must also comply with the Department for Education privacy notice.
- **Rate limit:** stated as 150 requests per 5 minutes, returning HTTP 429 beyond it. That fits a bounded free-tier run comfortably.
- Decision: **do not implement until the owner has registered and the key exists.** The key is server-only, must never appear in Git, chat, logs, URLs or browser code, and has no paid fallback. Re-read the hub's terms at implementation; they are the provider's and may have changed.

### Find a Job (Department for Work and Pensions) — stopped, needs a written agreement

- The official [DWP section of the government API catalogue](https://www.api.gov.uk/dwp/) was fetched on 2026-07-21 and **lists no Find a Job API.** The ten DWP APIs it does list are unrelated to vacancy retrieval. A secondary search summary claimed such an API existed; the catalogue itself contradicts it, and the catalogue is the authority.
- The service is operated by Adzuna on DWP's behalf, which means any data grant is likely entangled with the separate Adzuna licence question recorded above rather than being a plain public-sector reuse.
- Third-party reports describe the site's web application firewall blocking datacentre IP ranges. **If accurate that is an access control, and working around it — with a residential proxy or otherwise — is forbidden outright.** JobWarden does not bypass anti-bot controls, and this source will not be reached that way under any circumstances.
- Decision: **stop.** Reaching Find a Job needs a written agreement or an authorised feed obtained by the owner. No connector, no credential, no further probing.

### NHS Jobs (NHS Business Services Authority) — stopped, needs owner contact

- NHSBSA publishes an [NHS Jobs integration page](https://www.nhsbsa.nhs.uk/about-nhs-jobs/nhs-jobs-integration-and-benefits) which, per search summaries, describes two API options, one of them explicitly for organisations to retrieve NHS Jobs listings and publish them on their own job boards. That is exactly the direction JobWarden needs.
- **This could not be verified directly: the page returned HTTP 403 to an automated fetch on 2026-07-21.** The description above is therefore second-hand and must not be treated as confirmed. Do not build against it.
- Access appears to be arranged by contacting NHSBSA rather than by self-service registration, which makes it an agreement rather than an open endpoint.
- Decision: **stop.** The owner should contact NHSBSA, obtain the API's actual terms in writing, and record them here before any implementation. High value if it opens — NHS Jobs is among the largest single UK employers' vacancy sources.

### Civil Service Jobs — stopped, no documented public interface found

- No documented public vacancy-retrieval API was found for `civilservicejobs.service.gov.uk` on 2026-07-21. A dataset entry exists on data.gov.uk, and an open government jobs API has been discussed publicly since 2009 without one being published.
- Decision: **stop.** Absence of evidence is not permission. Do not scrape the site. Revisit only if the owner obtains a documented feed or written permission.

### JobApplyNI — not yet reviewed

Northern Ireland's official service is named as coverage layer 1 in this document and was not reached in this pass. It needs its own dated record before any implementation.

### Workable public account API — implemented 2026-07-21, ships disabled

Task 32's access-confirmation step. Confirmed against [Workable's own help documentation](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page) and against two live boards on 2026-07-21, not against a summary.

- **Official interface:** `GET https://www.workable.com/api/accounts/{subdomain}?details=true`. Workable's own careers-page article documents this and the sibling `/locations` and `/departments` endpoints as usable **without an API key**. `?details=true` is what includes the job descriptions.
- **Authentication:** none, confirmed by unauthenticated `200` responses from two boards. **This is not the endpoint most Workable documentation describes.** The API reference's `GET https://{subdomain}.workable.com/spi/v3/jobs` **requires a Bearer token with the `r_jobs` scope** and must not be used — a credentialed endpoint is outside what this task may reach.
- **robots.txt:** fetched 2026-07-21. Disallows `/user_password_resets`, `/admin`, `/auth/google` and `/j/` for all agents. **`/api` and `/api/accounts` are not disallowed.** Note that `/j/` — the advert permalink — _is_ disallowed, which is another reason this adapter reads the API and never the advert page.
- **Rate limits:** Workable's API documentation states **10 requests per 10 seconds**, returning `429` on exceed. One request per board per run sits far below that. Unlike Reed, a `429` here is treated as transient and retried under the shared bounded backoff, because the caller is anonymous, uncredentialed, and nowhere near the stated ceiling.
- **Terms:** the provider states **no** attribution, retention, redistribution, caching or removal obligations for these public endpoints. Recorded explicitly as "none stated" rather than as "permitted"; treat unstated as unstated, and re-check before any change to what the adapter requests.
- **Per-employer, not national.** Each board is an individual source with its own compliance record and allowed hosts, like Greenhouse, Lever and Ashby, and is administrator-configurable.
- **Coverage:** one request returns the whole board, so coverage is **complete** and the two-consecutive-omissions closure rule applies.
- **Response fields, confirmed live:** `name`, `description`, and `jobs[]` carrying `title`, `shortcode`, `code`, `employment_type`, `telecommuting`, `department`, `url`, `shortlink`, `application_url`, `published_on`, `created_at`, `country`, `city`, `state`, `education`, `experience`, `function`, `industry`, `locations[]`, `description`.

Five implementation facts worth carrying into any future change, so they are not rediscovered:

1. **A multi-location advert is served as one row per location, all sharing one `shortcode`.** This is the defining shape of this source and it was found by probing, not by reading. One live board returned **six rows for two actual adverts** — a single advert repeated five times for Leicester, Coventry, London, Northampton and Royal Tunbridge Wells, each row carrying a one-element `locations` array. Every duplicate row also carries an **identical `application_url`**, so emitting them as separate jobs would give five rows the same canonical deduplication key and let them overwrite one another non-deterministically. The adapter therefore **groups rows by `shortcode` and joins their locations**, which is what Task 37's multi-location splitting already handles.
2. **There is no compensation field of any kind.** Not in the job, not in the account. Compensation from this source is always `unknown`, never estimated, and that is a property of the provider rather than a gap in the adapter.
3. **`telecommuting` is never UK evidence.** It is a bare boolean with no country attached, so a remote role carries no explicit UK permission and must not publish on the strength of it.
4. **`country` and `locations[].countryCode` are provider assertions, not evidence**, following the precedent recorded for Lever and Ashby. `city` and `state` are places the advert itself names, so those are what become location evidence.
5. **`employment_type` states working time, not contract type.** `"Full-time"` must not be read as permanent, and IR35 is never inferred from any of it.

### Ashby public job posting API — implemented 2026-07-21, ships disabled

Task 31's access-confirmation step. Confirmed against [Ashby's own documentation](https://developers.ashbyhq.com/docs/public-job-posting-api) and against a live board on 2026-07-21, not against a summary.

- **Official interface:** `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true`. One request returns the whole board, so coverage is **complete** like Greenhouse and Lever, and the two-consecutive-omissions closure rule applies.
- **Authentication:** none. Ashby documents this as a public endpoint for published postings; the more capable endpoints that do need a key are a separate customer API JobWarden does not use.
- **Terms and rate limits:** Ashby's page states none for this endpoint. Treat that as unstated rather than unlimited: keep the bounded retries and the per-source minimum interval, and stop on any provider signal.
- **Per-employer, not national.** Each board is an individual source with its own compliance record and allowed hosts, exactly like Greenhouse and Lever, and is administrator-configurable.
- **Response fields, confirmed live:** `id`, `title`, `department`, `team`, `employmentType`, `location`, `secondaryLocations`, `publishedAt`, `isListed`, `isRemote`, `workplaceType`, `address.postalAddress`, `jobUrl`, `applyUrl`, `descriptionHtml`, `descriptionPlain`, `compensation`.

Five implementation facts worth carrying into the slice, so they are not rediscovered:

1. **`isListed` must be honoured.** A posting with `isListed: false` is not on the employer's board and must not be published.
2. **`isRemote` and `workplaceType` are never UK evidence.** The live sample's first posting is `isRemote: true`, `workplaceType: "Remote"`, `location: "Remote - European Union"` — remote, and explicitly _not_ the UK. Remote work needs explicit UK permission, and this field is exactly the trap that rule exists for.
3. **`address.postalAddress` is frequently empty strings rather than absent** — `postalCode: ""`, `addressLocality: ""`, `addressCountry: "European Union"`. Empty strings must be treated as missing, and `addressCountry` is a provider assertion rather than evidence, following the precedent recorded in the Lever adapter.
4. **`employmentType` uses Ashby's own vocabulary** (`"FullTime"`), not the schema.org tokens Teaching Vacancies uses. It states working time, not contract type, so it must not be read as permanent.
5. **`compensation` is a nested object** — `compensationTierSummary`, `scrapeableCompensationSalarySummary`, `compensationTiers`, `summaryComponents` — and needs `includeCompensation=true`. Summaries are free text, so the same discipline Teaching Vacancies needed applies: parse deterministically, keep advertised and unknown distinct, and never estimate.
6. **`secondaryLocations` is deliberately not used for eligibility.** The primary `location` is what the advert headlines. Reading secondary locations changes what a listing's location means, so it is its own decision rather than a detail of this slice.

**Implementation record, Task 31.** The adapter is `packages/ingestion/src/ashby.ts` and every fact above is honoured, each with a test naming the trap it guards.

- **Location evidence** is the primary `location` string as the advert wrote it. The postal address is a **fallback for when that is absent, never an addition to it** — appending a locality to a location that already publishes can only lose publications, because eligibility requires every label to be recognised, so `"Manchester" + "Head Office"` would quarantine where `"Manchester"` alone publishes. `addressCountry` is excluded from the schema entirely, following the Lever precedent.
- **`coverage_mode` is `complete`**, constrained at the database boundary by `job_sources_supported_provider`, so an Ashby source cannot be configured as incremental. The two-consecutive-omissions closure rule therefore applies.
- **No provider-specific minimum interval.** Ashby follows the Greenhouse and Lever precedent and takes the general 15-minute floor. Reed and Teaching Vacancies keep their 6-hour floors because they are national discovery services read repeatedly, which is a different shape. Ashby's terms state no rate limit; that is treated as unstated rather than unlimited, which is what the bounded retries and the per-source interval are for.
- **Administrator configurable**, unlike Reed and Teaching Vacancies, because it is a per-employer board. It appears in the source form.
- **Duplicate control is proven**, and unlike Teaching Vacancies it genuinely reconciles: Ashby's canonical destination is the employer's own `applyUrl`, so a listing carried on both an Ashby board and a Greenhouse board resolves to one occurrence through the canonical key once tracking parameters are removed. A test asserts the shared key and that each source keeps its own provenance.
- **The source ships disabled.** No row is inserted by any migration; an administrator must configure and enable a board.

- **Decision:** approved for implementation as an employer-board adapter. Each Ashby board still needs its own dated employer entry and allowlisted hosts before it is enabled, and the source ships disabled.
