# Glassdoor = Mode A firm signals (not teaching answers)

Updated: 2026-07-30 · ADR 0006

## Product role

| Layer | Source of truth | Glassdoor role |
|-------|-----------------|----------------|
| Teaching Q/A | GitHub corpus (`src/ibpe_corpus`) + curated answers | **None** — do not treat Glassdoor text as answer content |
| Mode A company prep | Firm topic heat / question *occurrences* | **Directional only** — which themes appear often at a firm |
| Concept lab | Gemini categorisation of teaching corpus | Indirect (optional occurrence hints) |

Glassdoor scrape output feeds **occurrence / preference signals** for Mode A room ranking and firm-flavoured prompts. It must not overwrite or invent teaching answers.

## Collection paths (supported)

| Path | Entry | Notes |
|------|-------|-------|
| **Patchright + manual captcha (preferred)** | `python main.py login` then `batch --backend browser` | Solve captcha/2FA once; reuse `data/glassdoor_state.json` |
| Parallel browser | `python scripts/parallel_batch.py --backend browser` | N Chrome workers + bank shard merge |
| Home login → upload state | Login on residential net; copy state into cloud | Good for Cloud Agents without interactive display |

## Legacy / optional

| Path | Entry | Notes |
|------|-------|-------|
| BFF | `python main.py batch --backend bff` | Needs residential `HTTPS_PROXY`; **not** programme default |
| Parallel BFF | `parallel_batch.py --backend bff` | Same; exits 2 without proxy unless `--allow-no-proxy` |

Never commit `data/glassdoor_state.json`, cookie jars, or real proxy credentials.

## PE / VC coverage

`config/targets.json` expands mega / mid-market / growth / credit PE names from `config/pe_target_matrix.yml` plus a few extra VC platforms. Positions include Summer Analyst and Growth Equity where Glassdoor title filters often match. Position fallbacks live in `scrapers/target_helpers.py`.

## Artefacts

- Fixtures: `fixtures/glassdoor/` (blocked live + synthetic parser shapes)
- Bank: `data/question_bank.json` (firm-signal seed for Mode A)
