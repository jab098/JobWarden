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
   - Adzuna's GB API is the first candidate for broad discovery.
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
- Failed or incomplete source runs never close jobs. Closure requires two consecutive complete successful omissions.

## Expansion sequence

The foundation remains one end-to-end Greenhouse vertical slice. After authentication and the initial jobs UI are working, source expansion should be planned as a separate delivery stream:

1. define coverage and freshness metrics;
2. add one broad authorised GB feed;
3. add official national and high-value sector sources;
4. add reusable ATS adapters;
5. use specialist boards to close evidenced gaps;
6. review duplicates, provenance, stale listings, and source health before each rollout.

The product may pursue very broad UK coverage, but it must not claim literal completeness. Some vacancies are unadvertised, duplicated, inaccessible through permitted interfaces, or available only through changing commercial arrangements.

## Current large-board status

These records describe connector eligibility only. Task 5 does not implement an adapter for any board in this table.

| Source    | Current status                                     | Evidence and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reed      | **Documented API candidate**                       | Reed documents a jobseeker [search and job-details API](https://www.reed.co.uk/developers/jobseeker) with API-key registration and Basic-auth requests. Treat it as a valid connector candidate after a source-specific terms, attribution, cadence, retention, and UK-evidence review.                                                                                                                                                                                                                                   |
| LinkedIn  | **Do not scrape**                                  | LinkedIn's partner interfaces are centred on authorised [job posting and synchronisation](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/job-posting-overview), not a general job-search ingestion API for JobWarden. Its [crawling terms](https://www.linkedin.com/legal/crawling-terms) require express permission for automated crawling. Do not collect LinkedIn listings without a written permission and an applicable partner agreement.                                                           |
| Indeed    | **Authorised feed or written permission required** | Indeed's current [partner documentation](https://docs.indeed.com/) focuses on job posting, employer, and candidate workflows; access is provisioned through its partner programme. Its [Terms of Service](https://www.indeed.com/legal?hl=en_US) prohibit unapproved bots, scraping, spiders, agentic automation, and data mining. Do not scrape. Reconsider only with a written permission or authorised discovery feed whose display, attribution, and retention terms fit JobWarden.                                   |
| Glassdoor | **Permission required**                            | Glassdoor exposes [API registration](https://www.glassdoor.com/developer/register_input.htm) and [public API terms](https://www.glassdoor.com/crs/api/glassdoor-public-api-terms.pdf), indicating controlled or partner access with display conditions. Its [site terms](https://www.glassdoor.com/about/terms-2022-12-01/) prohibit unapproved scraping, stripping, or mining. Do not implement a connector until access and the applicable display, attribution, caching, and retention terms are confirmed in writing. |
