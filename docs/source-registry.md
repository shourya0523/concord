# Source Registry — GitHub & Static Corpora

Research inventory: [`docs/research/github-source-inventory.md`](research/github-source-inventory.md).  
Config: [`config/github_sources.yml`](../config/github_sources.yml) (optional additive fragment: `config/github_sources.local.yml`).

Live Glassdoor access is blocked in this environment (HTTP 403 / CAPTCHA). GitHub and static seed corpora are the critical bootstrap path and **must never be labeled with Glassdoor provenance**.

## Source families

| Family | Adapter | Staging | Provenance label |
|--------|---------|---------|------------------|
| `github` | `ibpe_corpus.adapters.github.GitHubSourceAdapter` | `data/staging/github/<owner_repo>/` | `source_provided` / `source_family=github` |
| `static` | `ibpe_corpus.adapters.static.StaticSeedAdapter` | `data/staging/seed/` | `fixture_origin=synthetic_seed` |

## High-priority GitHub sources

| Repo | Commit | Path | Format | Importer | Notes |
|------|--------|------|--------|----------|-------|
| `ddeng5/Capital-Markets-Question-Bank-App` | `05dca57601532f95f7be72b83b76ce80a5c7dcca` | `www/investment-banking-qb-export.json` | `firebase_export_json` | `import_firebase_qb_export` | **385** IB Q&A pairs (best ready import) |
| `coryjburk/intv-playbook-ib_vc` | `c174e326e0325c31c50a734c71d86fae254f44b6` | `index.html` | `single_file_html_js_structured_questions` | `import_html_playbook` | 100 IB Q&A via `addQuestion(...)` |
| `coryjburk/intv-playbook-pe_vc` | `ae3b269379dd972277e6f3089e76b130ced1f098` | `index.html` | `single_file_html_js_structured_questions` | `import_html_playbook` | 100 PE Q&A |
| `HireAbo/awesome-interview-questions-5000-jobs` | `837a40fbf61a502b3f6d68eca2d32c8d70e0eec5` | Finance `*.md` | `markdown_numbered_question_lists` | `import_markdown_questions` | Questions only; no fake answers |
| `offergenieai/Finance-Interview-Questions` | `b651edc039fe9fcded7a6b071eb65b23dfc76a5f` | `README.md` | markdown titles | (treat as markdown / manual) | Titles only |

Pattern-only Glassdoor scraper repos are listed in config with `import_priority: pattern_only` or `no` and are **not** imported as corpora.

## Static seed

- Fixture: `fixtures/corpus/seed_ib_pe_questions.json` (~18 synthetic IB/PE Q&A)
- Explicit metadata: `fixture_origin: synthetic_seed`, `not_glassdoor: true`
- Staged copy: `data/staging/seed/seed_ib_pe_questions.json` (created on load)

## Import commands

Python API (preferred while CLI wiring lands in orchestration):

```python
from pathlib import Path
from ibpe_corpus.adapters.github import GitHubSourceAdapter, fetch_github_path
from ibpe_corpus.adapters.github.importers import (
    import_firebase_qb_export,
    import_html_playbook,
    import_markdown_questions,
)
from ibpe_corpus.adapters.static import load_seed_corpus

# 1) Offline synthetic seed
seed = load_seed_corpus()
print(seed.metrics)  # exact_questions / source_answers

# 2) Fetch pinned Capital Markets export (idempotent)
fetched = fetch_github_path(
    "ddeng5/Capital-Markets-Question-Bank-App",
    "05dca57601532f95f7be72b83b76ce80a5c7dcca",
    "www/investment-banking-qb-export.json",
)
artefact = fetched.artefacts[0]
path = Path(artefact.metadata["staging_path"])
cm = import_firebase_qb_export(path, artefact=artefact)
print(cm.metrics)  # expect exact_questions=385, source_answers=385

# 3) Markdown questions-only (HireAbo style)
md = import_markdown_questions("path/to/Investment Banker.md")

# 4) HTML playbook (coryjburk style)
pb = import_html_playbook("path/to/index.html")

# 5) Config-driven discover → fetch → parse (high priority)
adapter = GitHubSourceAdapter()
result = adapter.run(config={"import_priority": "high"})
print(result.metrics)
```

Shell helpers:

```bash
# Stage Capital Markets JSON via raw.githubusercontent.com
python - <<'PY'
from ibpe_corpus.adapters.github import fetch_github_path, import_firebase_qb_export
from pathlib import Path
r = fetch_github_path(
    "ddeng5/Capital-Markets-Question-Bank-App",
    "05dca57601532f95f7be72b83b76ce80a5c7dcca",
    "www/investment-banking-qb-export.json",
)
p = Path(r.artefacts[0].metadata["staging_path"])
print(import_firebase_qb_export(p).metrics)
PY

# Offline seed
python - <<'PY'
from ibpe_corpus.adapters.static import load_seed_corpus
print(load_seed_corpus().metrics)
PY

# Tests (no network required for core suite)
pytest tests/unit/test_import_seed.py tests/unit/test_import_github.py -q
# Optional live download:
pytest tests/unit/test_import_github.py -q -m network
```

## Record contract

- Every import produces `RawArtefact` (`content_hash`, `commit_sha` when GitHub) plus `ExtractedRecord` rows.
- Questions use `ExtractionClass.exact_question` with `exact_source_text`.
- Answers use `ExtractionClass.source_provided_answer` and metadata `answer_provenance=source_provided`, linked via `pair_id` / `question_record_id`.
- Idempotent fetch: identical `content_hash` + `commit_sha` skips rewrite (`pages_unchanged`).
- **Never** set Glassdoor URLs, employers, or live-scrape provenance on these records.

## HTML playbook note

`import_html_playbook` regex/token-parses `addQuestion(...)` calls and resolves `MA_CATEGORIES[n]`-style arrays. If a playbook uses an unsupported embedding shape, the importer returns zero records and a diagnostic instead of inventing content.
