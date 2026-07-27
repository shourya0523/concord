# Private Equity Coverage

Workstream C: taxonomy-driven PE discovery, role classification, and coverage
checks for the IB/PE interview corpus.

## Goals

- Discover PE interview pages beyond the literal phrase "private equity".
- Classify roles into `PERelevance` buckets from `ibpe_corpus.schemas.models`.
- Measure coverage concentration, strategy diversity, employer breadth, and
  core+adjacent share.

## Config

| File | Purpose |
|------|---------|
| `config/private_equity_taxonomy.yml` | Core investing roles, strategy roles, exclusion classes, relevance label map, concept queries, classifier keywords |
| `config/pe_target_matrix.yml` | ≥50 PE employers, geographies, seniority bands, strategies, coverage thresholds |

## Package layout

```
src/ibpe_corpus/pe/
  taxonomy.py    # YAML loaders
  queries.py     # bounded Glassdoor occupation search phrases
  classifier.py  # classify_role(title, context) -> PERelevance
  coverage.py    # metrics + reports/pe-coverage-report.md writer
```

## Runnable commands

Install (from repo root):

```bash
python3 -m pip install -e ".[dev]"
```

Run PE unit tests:

```bash
python3 -m pytest tests/unit/test_pe_coverage.py -q
```

Generate occupation search phrases:

```bash
python3 - <<'PY'
from ibpe_corpus.pe import generate_occupation_search_phrases, phrase_strings
phrases = generate_occupation_search_phrases()
print(f"{len(phrases)} phrases (bounded)")
for p in phrases[:15]:
    print(f"  [{p.source}] {p.phrase}")
print("...")
print(f"sample strings: {phrase_strings()[:5]}")
PY
```

Classify example roles:

```bash
python3 - <<'PY'
from ibpe_corpus.pe import classify_role
examples = [
    ("Private Equity Associate", ""),
    ("Fund Accountant", "PE fund"),
    ("PE Recruiter", ""),
    ("Portfolio Operations", "value creation"),
]
for title, ctx in examples:
    print(f"{title!r:40} -> {classify_role(title, ctx).value}")
PY
```

Compute coverage and write the report:

```bash
python3 - <<'PY'
from pathlib import Path
from ibpe_corpus.pe import write_coverage_report, matrix_inventory_summary

print(matrix_inventory_summary())
# Replace with real ExtractedRecord / occurrence dicts when the pipeline runs.
sample = [
    {"role": "Private Equity Associate", "employer": "KKR",
     "search_phrase": "Private Equity Associate", "pe_strategy": "buyout"},
    {"role": "Growth Equity Associate", "employer": "General Atlantic",
     "search_phrase": "Growth Equity Associate", "pe_strategy": "growth_equity"},
    {"role": "Private Credit Associate", "employer": "Golub Capital",
     "search_phrase": "Private Credit Associate", "pe_strategy": "private_credit"},
    {"role": "Secondaries Associate", "employer": "HarbourVest Partners",
     "search_phrase": "Secondaries Associate", "pe_strategy": "secondaries"},
    {"role": "Infrastructure Associate", "employer": "EQT",
     "search_phrase": "Infrastructure Associate", "pe_strategy": "infrastructure"},
]
report = write_coverage_report(sample, path=Path("reports/pe-coverage-report.md"))
print("overall", report.all_passed)
for check in report.checks:
    print(check.name, check.passed, check.detail)
PY
```

## Relevance labels

| Label | Typical roles |
|-------|----------------|
| `core_pe_investing` | PE Analyst/Associate/Principal/VP, buyout investing |
| `adjacent_pe_investing` | Growth equity, private credit, distressed, RE PE, secondaries |
| `portfolio_operations` | Portfolio ops, value creation, operating partners |
| `allocator_or_fund_selection` | FoF, LP allocators, pension PE |
| `pe_advisory` | Financial sponsors, TS/QoE, consultants serving PE |
| `fund_operations` | Fund accounting, IR, placement, compliance |
| `not_pe` | Recruiters, legal, wealth management, PE software vendors |

## Coverage checks

Configured in `pe_target_matrix.yml` → `coverage_thresholds`:

1. No single `search_phrase` > 40% of phrase-tagged records.
2. Strategy diversity ≥ 5 (observed or matrix-configured).
3. Employer count ≥ 50 (matrix inventory satisfies this at rest).
4. Core + adjacent share ≥ 50% of classified records.

## Integration notes

Glassdoor adapters (Workstream B) should call `phrase_strings()` / 
`generate_occupation_search_phrases()` for occupation discovery and
`classify_role()` when tagging extracted interviews. Orchestration (Workstream G)
should call `write_coverage_report()` after collection jobs.
