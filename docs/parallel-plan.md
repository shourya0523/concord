# Parallel Plan — IB/PE Interview Corpus

## Context

Repository `shourya0523/concord` was empty at mission start (blank README only).
There is no pre-existing Glassdoor scraper to extend; this plan builds the corpus
pipeline greenfield while honouring the mission's Glassdoor gaps (answers + PE coverage).

Live Glassdoor fetches from this environment return HTTP 403 Cloudflare/CAPTCHA.
Parsers and pagination are therefore fixture-first with honest access-state handling.

## Workstreams and ownership

| WS | Name | Owns (disjoint) | Depends on |
|----|------|-----------------|------------|
| Coord | Interfaces | `docs/parallel-plan.md`, `docs/interface-contracts.md`, `docs/integration-order.md`, `src/ibpe_corpus/schemas/`, `pyproject.toml` | — |
| A | Audit & fixtures | `docs/research/*`, `fixtures/glassdoor/**`, `reports/glassdoor-frontend-report.md` | — |
| B | Glassdoor fetch | `src/ibpe_corpus/adapters/glassdoor/`, `tests/unit/test_glassdoor*` | schemas, fixtures |
| C | PE coverage | `config/private_equity_taxonomy.yml`, `config/pe_target_matrix.yml`, `src/ibpe_corpus/pe/`, `tests/unit/test_pe*` | schemas |
| D | Answers | `src/ibpe_corpus/answers/`, `tests/unit/test_answer*` | schemas |
| E | GitHub ingest | `src/ibpe_corpus/adapters/github/`, `src/ibpe_corpus/adapters/static/`, `config/github_sources.yml`, `tests/unit/test_import*` | schemas |
| F | Canonical / dedup | `src/ibpe_corpus/canonical/`, `migrations/`, `tests/unit/test_canonical*` | schemas, storage |
| G | Orchestration | `src/ibpe_corpus/orchestration/`, `src/ibpe_corpus/export/`, `src/ibpe_corpus/storage/`, `src/ibpe_corpus/cli.py`, CI, docs ops, exports | all |

## Parallel rules

1. Freeze schemas before parallel coding.
2. No concurrent edits to migrations, shared models, lockfiles, or source registry.
3. Additive config fragments only; coordinator merges.
4. Every workstream ships tests + docs.
5. Integrate in the order in `docs/integration-order.md`.

## Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Python 3.11+ | Data pipeline fit; Chrome available for optional browser research |
| Storage | SQLite via SQLAlchemy | Zero-ops local reproducibility |
| Live Glassdoor | Fixture-first + block detection | Environment blocked by Cloudflare |
| Answers | Layered: source → corpus match → synthesised | Mission acceptance criteria |
| PE discovery | Broad taxonomy + classifier | Exact "private equity" phrase is insufficient |
| Orchestration | Restartable job runner with idempotency keys | Required by §17 |
