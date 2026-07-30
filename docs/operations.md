# Operations

## Install & migrate

```bash
pip install -e ".[dev]"
ibpe migrate --db data/db/corpus.db
```

## Controlled collection (fixtures)

```bash
ibpe run-pipeline --mode fixtures --force
```

Outputs:

- `exports/*.jsonl`, `exports/questions.csv`
- `reports/run-summary.json` and coverage/quality reports
- `data/db/corpus.db`

## Resume / idempotency

Jobs use stable keys such as `extract:glassdoor-fixtures:v1`. Re-running without
`--force` skips completed job rows; DB inserts use `insert_ignore` / hash remapping.

## Rate limits

`GlassdoorFetcher` defaults to ~1.5s delay, no cookies, stop-on-block.

## Dead letters

```bash
ibpe inspect-dead-letters
```

## CI

GitHub Actions runs `pytest` on push/PR (`.github/workflows/ci.yml`).
