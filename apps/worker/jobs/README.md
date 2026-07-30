# Worker job wiring stubs (Workstream J)

Infra owns deploy/schedule hooks. Job implementations belong to:

| Job family | Owner |
|------------|-------|
| Glassdoor fetch / BFF / session | `ibpe-glassdoor` |
| GitHub import / transform / publish | `ibpe-data-quality` |
| Gemini enrich / validators | `ibpe-answers` |

## Hook points (Wave 1)

| Stub | Purpose |
|------|---------|
| `enqueue_scrape.sh.example` | Host/cron entry that would call scrape CLI |
| `upload_artefact.sh.example` | Placeholder for Blob/S3 put after raw fetch |

Do not add scrape parsers or product UI here.
