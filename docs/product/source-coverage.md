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
4. **Specialist UK boards**
   - Sector, region, contract, part-time, charity, public-service, graduate, and apprenticeship boards can fill measurable gaps.
   - A board is added only when access is permitted and the connector can meet JobWarden's reliability and provenance standards.

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
- Decision: no connector or credential setup yet. Obtain written permission/licence terms for JobWarden's intended private-beta aggregation, retention, attribution, and deletion behaviour before implementation.

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
