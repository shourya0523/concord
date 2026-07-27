# Glassdoor frontend/network research

Date: 2026-07-27 UTC

## Scope and constraints

This was a controlled research pass for Glassdoor interview pages. The probing was intentionally minimal:

- no credentials, cookies, or saved browser profiles were used;
- CAPTCHA and Cloudflare challenges were not solved or bypassed;
- direct HTTP was tried first, with one Chrome headless DOM dump fallback after all HTTP attempts were blocked;
- raw attempt metadata was written to `/workspace/data/raw/glassdoor_research_log.jsonl`;
- blocked response fixtures were sanitized before saving.

## URLs attempted

| Surface | URL | Method | Status/result | Blocked? | `__NEXT_DATA__` | Apollo evidence | GraphQL evidence | Pagination evidence | Answer/comment evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Occupation search: Investment Banking Analyst | `https://www.glassdoor.com/Interview/investment-banking-analyst-interview-questions-SRCH_KO0,26.htm` | `httpx` GET | HTTP 403 | Yes; CAPTCHA/Cloudflare/robot block page | No | No | No | No | No |
| Occupation search: Private Equity Associate | `https://www.glassdoor.com/Interview/private-equity-associate-interview-questions-SRCH_KO0,24.htm` | `httpx` GET | HTTP 403 | Yes; CAPTCHA/Cloudflare/robot block page | No | No | No | No | No |
| Company interview page | `https://www.glassdoor.com/Interview/Goldman-Sachs-Interview-Questions-E2800.htm` | `httpx` GET | HTTP 403 | Yes; CAPTCHA/Cloudflare/robot block page | No | No | No | No | No |
| Occupation search: Investment Banking Analyst | Chrome headless `--dump-dom` | Timed out after 40s | Inconclusive; no DOM captured | Unknown | Unknown | Unknown | Unknown | Unknown |
| QTN question detail page | Not attempted | No discovered `QTN_` link | N/A | N/A | No | No | No | No | No |

## Observed blocked-page structure

The successful HTTP responses were not application pages. They were Cloudflare/Glassdoor block pages with:

- HTTP 403 status;
- `<meta name="robots" content="noindex, nofollow">`;
- text explaining automated traffic/blocked access;
- a CAPTCHA/challenge container;
- a `noscript` message: `Enable JavaScript and cookies to continue`;
- Cloudflare managed-challenge JavaScript and beacon scripts.

The saved live block fixtures preserve only the useful structural signals and redact dynamic challenge fields:

- challenge script body replaced with `window._cf_chl_opt = { cZone: "www.glassdoor.com", cType: "managed", redacted: true };`
- Cloudflare beacon replaced with `[CF_BEACON_REDACTED]`;
- IP address, email, phone-like values, and dynamic challenge tokens are redacted.

Live sanitized blocked fixtures:

- `/workspace/fixtures/glassdoor/html/occupation-investment-banking-analyst-httpx.html`
- `/workspace/fixtures/glassdoor/html/occupation-private-equity-associate-httpx.html`
- `/workspace/fixtures/glassdoor/html/company-goldman-sachs-interviews-httpx.html`

## Frontend/application evidence

No live Glassdoor application HTML was reached. Specifically:

- no `#__NEXT_DATA__` script was present in any HTTP response;
- no Apollo cache marker such as `__APOLLO_STATE__`, `ApolloClient`, or `apolloState` appeared in live responses;
- no GraphQL operation names, endpoint names, or embedded GraphQL payloads appeared in live responses;
- no application pagination controls were visible;
- no interview question cards, answer counts, comments, or `QTN_` links were visible.

Because all live application pages were blocked, any parser assumptions about the application DOM or data layer must be validated later from allowed, non-blocked access or from separately provided fixtures.

## URL pattern notes

The seed URLs use public Glassdoor URL conventions:

- occupation search: `/Interview/<keyword-slug>-interview-questions-SRCH_KO<start>,<end>.htm`
  - `Investment Banking Analyst` length is 26, yielding `SRCH_KO0,26`;
  - `Private Equity Associate` length is 24, yielding `SRCH_KO0,24`;
- company interview page: `/Interview/<company-slug>-Interview-Questions-E<employerId>.htm`;
- question detail URLs, when available, commonly contain `QTN_<numeric-id>`.

No `QTN_` link was discovered from live pages because the pages were blocked before application content rendered.

## Synthetic parser fixtures

Since live application content was blocked, synthetic fixtures were created and explicitly labeled with `fixture_origin: synthetic` in sidecar metadata. They are intended only for parser development shape coverage and are not evidence of the live DOM.

Synthetic HTML fixtures:

- `/workspace/fixtures/glassdoor/html/synthetic-occupation-search-ib.html`
- `/workspace/fixtures/glassdoor/html/synthetic-company-interviews-goldman.html`
- `/workspace/fixtures/glassdoor/html/synthetic-question-detail-qtn.html`

Synthetic JSON fixtures:

- `/workspace/fixtures/glassdoor/json/synthetic-occupation-search-ib-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-company-interviews-goldman-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-question-detail-qtn-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-fixtures-index.json`

The synthetic fixtures include:

- `#__NEXT_DATA__` JSON;
- Apollo-like normalized state under `pageProps.apolloState`;
- explicit `window.__APOLLO_STATE__` and synthetic GraphQL endpoint markers;
- pagination links using page-2 URL conventions;
- `QTN_` detail links;
- answer count, comment count, answer sections, and comment sections.

## Research conclusion

The environment was blocked by Glassdoor/Cloudflare before any interview application payload loaded. A production scraper should treat this as a hard stop: detect the block page, record the failed attempt, and back off. It should not attempt CAPTCHA solving, challenge replay, credential use, cookie reuse, or other access-control circumvention.
