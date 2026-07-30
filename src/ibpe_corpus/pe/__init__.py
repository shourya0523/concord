"""Private equity coverage: taxonomy, queries, classification, metrics."""

from ibpe_corpus.pe.classifier import classify_records, classify_role
from ibpe_corpus.pe.coverage import (
    compute_coverage,
    matrix_inventory_summary,
    render_coverage_markdown,
    write_coverage_report,
)
from ibpe_corpus.pe.queries import (
    generate_occupation_search_phrases,
    phrase_strings,
)
from ibpe_corpus.pe.taxonomy import (
    load_target_matrix,
    load_taxonomy,
)

__all__ = [
    "classify_records",
    "classify_role",
    "compute_coverage",
    "generate_occupation_search_phrases",
    "load_target_matrix",
    "load_taxonomy",
    "matrix_inventory_summary",
    "phrase_strings",
    "render_coverage_markdown",
    "write_coverage_report",
]
