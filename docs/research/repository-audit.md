# Repository audit for Glassdoor interview scraping research

Date: 2026-07-27 UTC

## Current repository state

The workspace is effectively greenfield for implementation purposes:

- `README.md` is blank.
- `/workspace/src` contains no files.
- No existing scraper, parser, scheduler, storage model, or tests were found.
- No existing Glassdoor fixtures or reports were present before this research pass.

This research task did not implement scraper code and did not modify `src/`.

## Files added by this research pass

Research docs:

- `/workspace/docs/research/glassdoor-frontend-analysis.md`
- `/workspace/docs/research/repository-audit.md`
- `/workspace/docs/research/glassdoor-scraper-audit.md`

Report:

- `/workspace/reports/glassdoor-frontend-report.md`

Raw attempt log:

- `/workspace/data/raw/glassdoor_research_log.jsonl`

Fixtures:

- `/workspace/fixtures/glassdoor/html/`
- `/workspace/fixtures/glassdoor/json/`

## Implications for future scraper design

Given the empty `src/` tree and the blocked live fetches, a future implementation should start from a small, testable architecture rather than a broad crawler.

Recommended modules:

1. **URL seed builder**
   - Constructs supported occupation, company, and question-detail URL patterns.
   - Stores the canonical source URL and semantic surface type with each request.

2. **Fetcher**
   - Performs one request at a time with explicit rate limits and retry budgets.
   - Sends no cookies unless explicitly provided by a compliant user workflow.
   - Detects Cloudflare/CAPTCHA/access-denied pages and returns a typed `Blocked` result.
   - Does not solve CAPTCHA, replay challenge tokens, or circumvent access controls.

3. **Response classifier**
   - Classifies response as blocked page, app HTML, JSON payload, redirect, error, or empty/inconclusive.
   - Checks for `__NEXT_DATA__`, Apollo state, GraphQL markers, pagination links, `QTN_` links, and answer/comment evidence.

4. **Fixture writer**
   - Saves sanitized fixtures only when allowed.
   - Writes sidecar metadata with origin, source URL, capture time, status, hash, and sanitization details.
   - Redacts emails, phone numbers, IP addresses, cookie-like values, challenge tokens, and any account-specific identifiers.

5. **Parser layer**
   - Parses static HTML and embedded JSON separately.
   - Prefers structured data from `__NEXT_DATA__`/Apollo-like state when available.
   - Falls back to DOM selectors for question cards, answer counts, comment counts, pagination, and detail links.

6. **Storage/export**
   - Stores normalized records for page attempts, pages, questions, answers, comments, employers, occupations, and pagination links.
   - Preserves provenance and fixture hashes for reproducibility.

7. **Tests**
   - Unit tests against synthetic fixtures.
   - Block-page classification tests against sanitized live blocked fixtures.
   - Parser contract tests that fail clearly when expected markers are missing.

## Guardrails

A future scraper should:

- stop on CAPTCHA or Cloudflare challenge pages;
- avoid credential or cookie persistence;
- avoid high-volume crawling;
- maintain a durable request log;
- expose clear block metrics;
- distinguish synthetic fixtures from live captures;
- avoid claiming live frontend structure unless it has been observed directly.

The current research can support parser scaffolding and block detection, but not a verified production extraction path for Glassdoor application content.
