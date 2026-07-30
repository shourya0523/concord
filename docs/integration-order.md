# Integration Order

1. Shared schemas and interfaces (`src/ibpe_corpus/schemas/`)
2. Raw storage and source registry (`storage/`, `docs/source-registry.md`)
3. Existing-corpus importers (`adapters/github/`, `adapters/static/`)
4. Glassdoor fetch and fixture capture (`adapters/glassdoor/fetch.py`)
5. Deterministic parsers (`adapters/glassdoor/parse.py`)
6. PE relevance and coverage (`pe/`)
7. Answer acquisition (`answers/`)
8. Extraction and canonicalisation (`canonical/`)
9. Validation (`answers/validate.py`)
10. End-to-end orchestration (`orchestration/`, `cli.py`)
11. Full controlled collection run (`ibpe run-pipeline --mode fixtures`)

## Merge policy

- Integrate one workstream at a time against the advancing canonical tree.
- Re-run focused tests after each merge.
- Never rewrite shared migrations; add numbered migration files only.
- Config fragments are additive YAML under `config/` merged by loader.
