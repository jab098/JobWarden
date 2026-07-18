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

| Source    | Current status                                                    | Evidence and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reed      | **Implemented; disabled pending owner setup and live validation** | Reed's [Jobseeker API documentation](https://www.reed.co.uk/developers/jobseeker) documents search and job-detail endpoints, API-key registration, and HTTP Basic authentication with the key as username and a blank password. The adapter uses one newest-first page of at most 50 results per run, at most four concurrent detail calls, and a six-hour minimum cadence. Reed's page does not state a data-retention, redistribution, attribution, or termination/removal grant. The owner must therefore review the terms presented during registration, record the decision, and obtain written clarification where required before enabling the source. |
| LinkedIn  | **Do not scrape**                                                 | LinkedIn's partner interfaces are centred on authorised [job posting and synchronisation](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/job-posting-overview), not a general job-search ingestion API for JobWarden. Its [crawling terms](https://www.linkedin.com/legal/crawling-terms) require express permission for automated crawling. Do not collect LinkedIn listings without a written permission and an applicable partner agreement.                                                                                                                                                                                               |
| Indeed    | **Authorised feed or written permission required**                | Indeed's current [partner documentation](https://docs.indeed.com/) focuses on job posting, employer, and candidate workflows; access is provisioned through its partner programme. Its [Terms of Service](https://www.indeed.com/legal?hl=en_US) prohibit unapproved bots, scraping, spiders, agentic automation, and data mining. Do not scrape. Reconsider only with a written permission or authorised discovery feed whose display, attribution, and retention terms fit JobWarden.                                                                                                                                                                       |
| Glassdoor | **Permission required**                                           | Glassdoor exposes [API registration](https://www.glassdoor.com/developer/register_input.htm) and [public API terms](https://www.glassdoor.com/crs/api/glassdoor-public-api-terms.pdf), indicating controlled or partner access with display conditions. Its [site terms](https://www.glassdoor.com/about/terms-2022-12-01/) prohibit unapproved scraping, stripping, or mining. Do not implement a connector until access and the applicable display, attribution, caching, and retention terms are confirmed in writing.                                                                                                                                     |

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
