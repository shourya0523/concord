# Glassdoor frontend research report

Date: 2026-07-27 UTC

## Summary

All live Glassdoor interview-page probes from this environment were blocked before application content loaded. HTTP responses for the occupation and company surfaces returned HTTP 403 Cloudflare/CAPTCHA pages. Chrome headless was tried once with a fresh temporary profile and timed out before producing a DOM.

No CAPTCHA was solved, no credentials or cookies were used, and no access controls were circumvented.

## Pages reached

| Page | URL | Result | Blocked? | `__NEXT_DATA__` present? | Answers visible? |
| --- | --- | --- | --- | --- | --- |
| Investment Banking Analyst occupation search | `https://www.glassdoor.com/Interview/investment-banking-analyst-interview-questions-SRCH_KO0,26.htm` | HTTP 403 block page | Yes | No | No |
| Private Equity Associate occupation search | `https://www.glassdoor.com/Interview/private-equity-associate-interview-questions-SRCH_KO0,24.htm` | HTTP 403 block page | Yes | No | No |
| Goldman Sachs company interview page | `https://www.glassdoor.com/Interview/Goldman-Sachs-Interview-Questions-E2800.htm` | HTTP 403 block page | Yes | No | No |
| Investment Banking Analyst occupation search via Chrome headless | same as above | Timed out after 40s | Unknown | Unknown | Unknown |
| QTN detail page | none | Not attempted; no `QTN_` link was discovered from blocked pages | N/A | No | No |

## PE pages found?

The Private Equity Associate occupation URL was attempted, but only the blocked Cloudflare/CAPTCHA page was reached. No live PE interview-question content, pagination, or QTN links were found.

## Fixtures created

Live sanitized blocked HTML fixtures:

- `/workspace/fixtures/glassdoor/html/occupation-investment-banking-analyst-httpx.html`
- `/workspace/fixtures/glassdoor/html/occupation-private-equity-associate-httpx.html`
- `/workspace/fixtures/glassdoor/html/company-goldman-sachs-interviews-httpx.html`

Synthetic parser-development HTML fixtures:

- `/workspace/fixtures/glassdoor/html/synthetic-occupation-search-ib.html`
- `/workspace/fixtures/glassdoor/html/synthetic-company-interviews-goldman.html`
- `/workspace/fixtures/glassdoor/html/synthetic-question-detail-qtn.html`

Synthetic parser-development JSON fixtures:

- `/workspace/fixtures/glassdoor/json/synthetic-occupation-search-ib-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-company-interviews-goldman-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-question-detail-qtn-next-data.json`
- `/workspace/fixtures/glassdoor/json/synthetic-fixtures-index.json`

Each fixture has a sidecar metadata file. Synthetic fixture sidecars include `fixture_origin: synthetic`.

## Logs and docs

Raw attempt log:

- `/workspace/data/raw/glassdoor_research_log.jsonl`

Detailed docs:

- `/workspace/docs/research/glassdoor-frontend-analysis.md`
- `/workspace/docs/research/repository-audit.md`
- `/workspace/docs/research/glassdoor-scraper-audit.md`

## Recommended next step

Build only a block-aware fetcher/parser harness first. It should stop on CAPTCHA/Cloudflare pages, classify responses, write sanitized fixtures, and parse only fixtures or pages that are lawfully reachable without bypassing access controls.
