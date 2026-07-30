# Status: glassdoor

State: complete (Wave 1) · policy updated ADR 0006  
Wave: 1  
Updated: 2026-07-30

## Notes

- Preferred path: `python main.py login` (manual captcha) → browser batch / parallel browser workers.
- BFF remains in-repo but is **not** required; `FLAG_SCRAPE_BFF_DEFAULT=false`.
- PE/VC targets expanded for occurrence coverage.
- Do not block Wave 2 on residential proxy.
