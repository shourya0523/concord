# Sibling agent progress

Checked: 2026-07-30 (orchestrator environment).

## `bc-a80753a1-8140-425a-88e1-3a90e54c3a7e`

| Field | Value |
|-------|--------|
| MCP list visibility | **Not available** in this environment’s `list-cloud-agents` (only this run + env-setup agent listed) |
| Dashboard URL | https://cursor.com/agents/bc-a80753a1-8140-425a-88e1-3a90e54c3a7e |
| Track via | GitHub PRs with footer bcId + branches ending `-3a7e` |

### Deliverables

| PR | Branch | State | Notes |
|----|--------|-------|-------|
| [#5](https://github.com/shourya0523/concord/pull/5) Add BFF API backend to bypass Indeed Cloudflare | `local/bff-api-cloudflare-bypass-3a7e` | **MERGED** 2026-07-30T04:27:33Z | `scrapers/bff_api.py`, `batch --backend bff`, docs/`HTTPS_PROXY`. Already on trunk — do not redo. |
| [#7](https://github.com/shourya0523/concord/pull/7) Add parallel batch scraper for concurrent collection | `local/parallel-full-scrape-3a7e` | **OPEN** | `scripts/parallel_batch.py` (N Chrome workers, shard banks, merge). PR claims full force scrape of ~82 jobs with 3 workers + `glassdoor_state.json` **in progress**. Last branch tip commit ~07:34Z; bank file on tip still ~2842 Q / 52 jobs / 18 PE — scrape results may not be committed yet. |

### Gaps for Workstream F

1. Parallel runner does **not** pass `--backend bff` (browser-only).
2. Absorb parallel script; add BFF worker mode + PE-focused shards.
3. Re-check PR #7 / bank counts before assuming collection finished.
4. Prefer residential `HTTPS_PROXY` + BFF on cloud over multi-Chrome when session/proxy allows.

### Action for programme

- Treat BFF path as **done baseline**.
- Watch/merge PR #7; do not invent a competing parallel runner.
- Continue PE coverage + fixtures + raw artefacts under `ibpe-glassdoor`.
