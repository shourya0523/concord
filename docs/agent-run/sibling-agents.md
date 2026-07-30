# Sibling agent progress

Checked: 2026-07-30 (orchestrator Phase 0). Post-merge into `main` (`639191b`).

## Data thesis (product direction)

- Open-source **GitHub Q/A** = teaching source of truth (question/answer pairs).
- **Glassdoor** = directional firm preferences / topic heat for Mode A only.
- **Gemini** enriches and categorises into company-prep + concept-lab.
- Corpus importers from former PR #2 are **on main** under `src/ibpe_corpus/`.

## Absorb status (do not re-implement)

| PR | Branch | State | Notes |
|----|--------|-------|-------|
| [#1](https://github.com/shourya0523/concord/pull/1) GlassCleaner2 import | `local/cloud-environment-setup-1147` | **MERGED** | Baseline scraper |
| [#2](https://github.com/shourya0523/concord/pull/2) IB/PE corpus | `local/ibpe-interview-corpus-042f` | **MERGED** into main | GitHub adapters, fixtures, answer pipeline, PE taxonomy — **teaching truth path** |
| [#3](https://github.com/shourya0523/concord/pull/3) Patchright/Cloudflare | `local/cloud-environment-setup-1147` | **MERGED** | Session capture + login flows |
| [#5](https://github.com/shourya0523/concord/pull/5) BFF API | `local/bff-api-cloudflare-bypass-3a7e` | **MERGED** | `scrapers/bff_api.py` — firm-signal path |
| [#6](https://github.com/shourya0523/concord/pull/6) Fullstack prompt | `local/update-fullstack-prompt-9954` | **CLOSED** (content on main) | This programme prompt + agents |
| [#7](https://github.com/shourya0523/concord/pull/7) Parallel batch | `local/parallel-full-scrape-3a7e` | **MERGED** | `scripts/parallel_batch.py` — browser workers only; still needs BFF parity |

## Live bank snapshot (main)

| Metric | Value |
|--------|------:|
| Questions | 3492 |
| Completed jobs | 105 |
| IB / Banking / PE / VC | 2861 / 493 / 101 / 37 |
| Companies | 42 |
| Updated | 2026-07-30T08:17:05+00:00 |

## Programme action

1. Absorb GitHub Q/A further into product contracts/DB (`ibpe-data-quality` + `ibpe-database`).
2. Glassdoor = Mode A signal layer only (`ibpe-glassdoor`); add BFF mode to parallel runner.
3. Gemini categorises into company rooms + concept labs (`ibpe-answers`).
4. Do **not** duplicate BFF or corpus importers.
