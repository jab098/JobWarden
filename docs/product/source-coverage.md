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
