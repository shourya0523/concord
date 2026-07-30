# Glassdoor = Mode A firm signals (not teaching answers)

Updated: 2026-07-30

## Product role

| Layer | Source of truth | Glassdoor role |
|-------|-----------------|----------------|
| Teaching Q/A | GitHub corpus (`src/ibpe_corpus`) + curated answers | **None** — do not treat Glassdoor text as answer content |
| Mode A company prep | Firm topic heat / question *occurrences* | **Directional only** — which themes appear often at a firm |
| Concept lab | Gemini categorisation of teaching corpus | Indirect (optional occurrence hints) |

Glassdoor scrape output feeds **occurrence / preference signals** for Mode A room ranking and firm-flavoured prompts. It must not overwrite or invent teaching answers.

## Collection paths (post PR #5 / #7)

| Path | Entry | Cloud notes |
|------|-------|-------------|
| BFF (preferred) | `python main.py batch --backend bff` | Needs residential `HTTPS_PROXY`; no Indeed login |
| Parallel BFF | `python scripts/parallel_batch.py --backend bff --workers N` | Same proxy requirement; stubs exit 2 if proxy missing unless `--allow-no-proxy` |
| Browser | `python main.py batch --backend browser` | Patchright `data/glassdoor_state.json` or manual login |
| Parallel browser | `python scripts/parallel_batch.py --backend browser` | N Chrome workers + bank shard merge |

## Proxy stub

Without `HTTPS_PROXY` / `HTTP_PROXY` / `GLASSDOOR_PROXY`, BFF workers on datacenter IPs typically receive Cloudflare 403. Parallel BFF therefore:

1. PrefLights for a proxy env var.
2. Exits with a clear stub message (code 2) when missing.
3. Allows override via `--allow-no-proxy` for residential-home smoke tests.

Never commit `data/glassdoor_state.json`, cookie jars, or real proxy credentials.

## PE / VC coverage

`config/targets.json` expands mega / mid-market / growth / credit PE names from `config/pe_target_matrix.yml` plus a few extra VC platforms. Positions include Summer Analyst and Growth Equity where Glassdoor title filters often match. Position fallbacks live in `scrapers/target_helpers.py`.

## Artefacts

- Fixtures: `fixtures/glassdoor/` (blocked live + synthetic parser shapes)
- Bank merges: `data/question_bank.json` (firm-tagged questions; still signal layer)
- Parallel workdir (gitignored): `data/parallel_batch/`
