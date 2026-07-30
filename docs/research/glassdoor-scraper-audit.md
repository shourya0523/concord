# Glassdoor scraper architecture audit

Date: 2026-07-27 UTC

## Executive recommendation

Do not build a scraper that assumes Glassdoor interview pages are directly reachable from this environment. The controlled fetches all returned HTTP 403 Cloudflare/CAPTCHA block pages, and no live application DOM or data payload was observed.

A safe implementation should focus first on:

- deterministic URL construction;
- conservative fetch orchestration;
- block detection and backoff;
- sanitized fixture capture;
- parsers that can be tested against clearly labeled fixtures.

## Recommended pipeline

```text
seed -> request budget/rate limiter -> fetcher -> response classifier
                                       -> block result + log
                                       -> sanitized fixture writer
                                       -> parser -> normalized records
```

## Components

### 1. Seed model

Represent each target as structured data:

```json
{
  "surface": "occupation_search",
  "keyword": "Investment Banking Analyst",
  "url": "https://www.glassdoor.com/Interview/investment-banking-analyst-interview-questions-SRCH_KO0,26.htm",
  "attempt": 1
}
```

Supported surfaces:

- `occupation_search`
- `company_interview`
- `question_detail`

### 2. Fetcher

Fetcher responsibilities:

- request exactly one URL per call;
- use explicit timeouts;
- avoid cookies and credential persistence by default;
- record status code, final URL, elapsed time, and content length;
- never store `Set-Cookie` headers;
- never solve CAPTCHA or replay challenge values;
- return typed outcomes such as `FetchedHtml`, `Blocked`, `Redirect`, `NetworkError`, or `Timeout`.

### 3. Block detection

Block detection should run before parsing. Signals observed in the live blocked fixtures include:

- HTTP 403;
- `captcha`;
- `robot`;
- `blocked`;
- `Cloudflare`;
- `Enable JavaScript and cookies to continue`;
- `captcha-container`;
- `_cf_chl_opt`;
- `data-cf-beacon`;
- `<meta name="robots" content="noindex, nofollow">`.

If these appear, the scraper should:

1. write a redacted attempt log;
2. optionally save a sanitized block fixture;
3. mark the seed as blocked;
4. stop expanding pagination or detail links from that response.

### 4. Response classifier

For non-blocked HTML, classify and extract evidence:

- `__NEXT_DATA__`: `script#__NEXT_DATA__[type="application/json"]`
- Apollo: `__APOLLO_STATE__`, `apolloState`, `ApolloClient`, or normalized cache objects
- GraphQL: `graphql`, `operationName`, `__typename`, endpoint references
- pagination: `nav[aria-label*="pagination"]`, `data-test*="pagination"`, `href` patterns such as `_IP2.htm` or `p=2`
- question detail links: `QTN_<digits>`
- answer/comment evidence: answer counts, comment counts, `#answers`, `#comments`, `data-test="answer"`, `data-test="comment"`

The classifier should emit evidence fields even when values are absent so blocked/incomplete runs are auditable.

### 5. Parser strategy

Recommended parser order:

1. Parse structured JSON from `__NEXT_DATA__`.
2. Inspect Apollo-like normalized cache entries for `InterviewQuestion`, `InterviewReview`, `Employer`, answer, and comment records.
3. Fall back to DOM extraction for:
   - question text;
   - job title;
   - employer/company;
   - QTN detail URL;
   - answer count;
   - comment count;
   - pagination URLs.
4. Validate records with a schema before export.

The parser should not treat synthetic fixtures as proof that selectors match the live site.

### 6. Fixture policy

Fixture metadata should include:

- `fixture_origin`: `live_sanitized` or `synthetic`;
- source URL;
- final URL;
- status code;
- capture timestamp;
- method;
- block classification;
- data-layer evidence;
- sanitization list;
- SHA-256 hash of sanitized content.

Sanitize:

- emails;
- phone numbers;
- IP addresses;
- cookies;
- challenge tokens;
- Cloudflare rays/beacon values;
- account or user identifiers.

### 7. Data model

Suggested normalized tables or document types:

- `fetch_attempts`
- `pages`
- `pagination_links`
- `employers`
- `occupations`
- `interview_reviews`
- `questions`
- `answers`
- `comments`
- `parser_warnings`

Every extracted record should reference:

- source URL;
- fixture path or response hash;
- capture timestamp;
- parser version;
- whether the source was live or synthetic.

## Testing plan

Start with focused tests:

- blocked-page classifier tests using the live sanitized block fixtures;
- synthetic occupation-search parser tests;
- synthetic company-interview parser tests;
- synthetic QTN detail parser tests;
- JSON extraction tests for `__NEXT_DATA__` and Apollo-like state;
- sanitization tests for PII and challenge-token redaction.

## Operational constraints

The implementation should expose safe knobs:

- per-host request delay;
- total request budget;
- per-seed retry budget;
- timeout;
- fixture capture enabled/disabled;
- maximum fixture size;
- stop-on-block behavior enabled by default.

It should not include:

- CAPTCHA solving;
- proxy rotation intended to bypass blocks;
- credential capture;
- cookie persistence;
- Cloudflare challenge replay;
- automated account workflows.

## Bottom line

The current evidence supports building a conservative research harness and parser test bed, not a live Glassdoor crawler. The first production-quality milestone should be a block-aware fetcher plus parsers validated against fixtures whose origins are explicit.

## 2026-07-30 addendum (Workstream F)

PR #5 landed a **browserless BFF** path (`scrapers/bff_api.py` + `batch --backend bff`) using `curl_cffi` Chrome impersonation. It still depends on a **residential** `HTTPS_PROXY` on datacenter cloud IPs. PR #7’s `scripts/parallel_batch.py` now forwards `--backend bff` to workers with an explicit proxy preflight stub.

Product constraint unchanged and reinforced: Glassdoor feeds **Mode A firm occurrence / preference signals only** — teaching Q/A remains the GitHub corpus path. See `docs/research/glassdoor-mode-a-signals.md`.
