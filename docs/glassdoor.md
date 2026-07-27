# Glassdoor adapter

Fixture-first Glassdoor interview fetch/parse for the IB/PE corpus.

Live Glassdoor requests from this environment return HTTP 403 Cloudflare/CAPTCHA
pages. The adapter detects that honestly, archives the response, and does **not**
attempt CAPTCHA solving, cookie reuse, or challenge replay.

## Layout

| Module | Role |
|--------|------|
| `adapters/glassdoor/urls.py` | Occupation / company / pagination URLs; `QTN_` extraction |
| `adapters/glassdoor/access.py` | `AccessState` from status + HTML signals |
| `adapters/glassdoor/fetch.py` | Rate-limited fetcher; fixture loader; raw HTML archive |
| `adapters/glassdoor/parse.py` | `__NEXT_DATA__` / Apollo + DOM fallback parser |
| `adapters/glassdoor/adapter.py` | `discover` / `fetch` / `parse_artefact` |

Parser version: `glassdoor-parser-v1` (`ibpe_corpus.PARSER_VERSION`).

## Replay synthetic fixtures

```bash
cd /workspace
python -c "
from pathlib import Path
from ibpe_corpus.adapters.glassdoor import GlassdoorFetcher

f = GlassdoorFetcher()
occ = f.fetch_fixture('fixtures/glassdoor/html/synthetic-occupation-search-ib.html')
print(occ.access_state, len(occ.extracted), occ.artefacts[0].metadata.get('pagination_next_urls'))

detail = f.fetch_fixture('fixtures/glassdoor/html/synthetic-question-detail-qtn.html')
print(detail.access_state, len(detail.responses), [r.response_type for r in detail.responses])
"
```

## Fetch (expects block)

```bash
python -c "
from ibpe_corpus.adapters.glassdoor import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.urls import occupation_search_url

url = occupation_search_url('Investment Banking Analyst')
with GlassdoorFetcher(rate_limit_s=1.5) as f:
    result = f.fetch_url(url)
print(result.access_state, result.diagnostics)
print('questions', len(result.extracted))  # expected 0 when blocked
"
```

Raw HTML is written under `data/raw/glassdoor/<sha256>.html` with a sidecar meta JSON.

## Occupation search URL shape

```text
/Interview/<slug>-interview-questions-SRCH_KO0,<len>.htm
/Interview/<slug>-interview-questions-SRCH_KO0,<len>_IP{n}.htm   # page n >= 2
```

Example:

```python
from ibpe_corpus.adapters.glassdoor.urls import occupation_search_url
occupation_search_url('Investment Banking Analyst')
# .../investment-banking-analyst-interview-questions-SRCH_KO0,26.htm
occupation_search_url('Investment Banking Analyst', page=2)
# .../investment-banking-analyst-interview-questions-SRCH_KO0,26_IP2.htm
```

Company pages:

```text
/Interview/<Company-Slug>-Interview-Questions-E{id}.htm
```

## Discover targets

```python
from ibpe_corpus.adapters.glassdoor import GlassdoorAdapter

adapter = GlassdoorAdapter(fixture_mode=True)
targets = adapter.discover({
    'roles': ['Investment Banking Analyst', 'Private Equity Associate'],
    'employers': [{'name': 'Goldman Sachs', 'slug': 'Goldman-Sachs', 'employer_id': 2800}],
})
```

## Tests

```bash
cd /workspace && python -m pytest tests/unit/test_glassdoor*.py -q
```

## Fixtures

- Synthetic (parser development): `fixtures/glassdoor/html/synthetic-*.html`
- Live sanitized blocks: `fixtures/glassdoor/html/*-httpx.html` (`access_state` CAPTCHA/BLOCKED, zero questions)
