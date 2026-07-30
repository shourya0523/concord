# Status: glassdoor

State: in_progress
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-glassdoor-a9ff`

## Notes

- Glassdoor = **Mode A firm-signal / occurrence layer only** — not teaching answer SoT (see `docs/research/glassdoor-mode-a-signals.md`).
- PR #5 BFF + PR #7 `parallel_batch` already on main; **not** re-implemented.
- **BFF worker parity:** `scripts/parallel_batch.py` now accepts `--backend bff|browser`, `--pages`, and `--allow-no-proxy`.
- **Proxy gate:** `--backend bff` without `HTTPS_PROXY`/`HTTP_PROXY`/`GLASSDOOR_PROXY` exits code 2 with stub guidance (cloud datacenter CF block). Set residential proxy in Cloud Agents Secrets to run live collection.
- **PE/VC targets:** expanded mega/mid-market/growth/credit PE + Founders Fund / Tiger Global / Coatue VC; Summer Analyst + Growth Equity titles; `target_helpers` fallbacks updated.
- CLI preserved: `python main.py batch|login|query|ui`.
- Do not commit credentials, `glassdoor_state.json`, or session cookies.

## Verify

```bash
source .venv/bin/activate
python scripts/parallel_batch.py --backend bff --help
python scripts/parallel_batch.py --backend bff --workers 1 --limit 1   # expect stub exit 2 if no proxy
python main.py query --track PE | head
```

## Next (ops)

1. Add residential `HTTPS_PROXY` secret → `parallel_batch.py --backend bff --track PE --workers 3`.
2. Or residential `python main.py login` → browser parallel path.
