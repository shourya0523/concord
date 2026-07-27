"""PE corpus coverage metrics and markdown report generation."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from ibpe_corpus.pe.classifier import classify_role
from ibpe_corpus.pe.taxonomy import load_target_matrix, load_taxonomy
from ibpe_corpus.schemas.models import PERelevance

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REPORT_PATH = REPO_ROOT / "reports" / "pe-coverage-report.md"

CORE_ADJACENT = {
    PERelevance.CORE_PE_INVESTING.value,
    PERelevance.ADJACENT_PE_INVESTING.value,
}


@dataclass
class CoverageCheck:
    name: str
    passed: bool
    detail: str


@dataclass
class CoverageReport:
    total_records: int = 0
    relevance_counts: dict[str, int] = field(default_factory=dict)
    search_phrase_counts: dict[str, int] = field(default_factory=dict)
    strategy_counts: dict[str, int] = field(default_factory=dict)
    employer_counts: dict[str, int] = field(default_factory=dict)
    checks: list[CoverageCheck] = field(default_factory=list)
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @property
    def all_passed(self) -> bool:
        return all(c.passed for c in self.checks) if self.checks else False


def _as_mapping(record: Any) -> Mapping[str, Any]:
    if isinstance(record, Mapping):
        return record
    if hasattr(record, "model_dump"):
        return record.model_dump()
    if hasattr(record, "__dict__"):
        return vars(record)
    raise TypeError(f"Unsupported record type: {type(record)!r}")


def _relevance_of(record: Mapping[str, Any]) -> str:
    if record.get("pe_relevance"):
        return str(record["pe_relevance"])
    title = str(record.get("role") or record.get("title") or "")
    context = str(record.get("context") or "")
    if not context:
        context = " ".join(
            str(record.get(k) or "")
            for k in ("employer", "exact_source_text", "process", "office")
        )
    return classify_role(title, context).value


def compute_coverage(
    records: Sequence[Any],
    *,
    matrix: dict[str, Any] | None = None,
    taxonomy: dict[str, Any] | None = None,
) -> CoverageReport:
    """
    Compute PE coverage metrics from interview / question records.

    Expected optional fields per record:
    ``role``/``title``, ``employer``, ``search_phrase``, ``pe_strategy``/``strategy``,
    ``pe_relevance``, ``context``.
    """
    _ = taxonomy or load_taxonomy()
    mat = matrix or load_target_matrix()
    thresholds = mat.get("coverage_thresholds") or {}
    max_phrase_share = float(thresholds.get("max_single_search_phrase_share", 0.40))
    min_strategies = int(thresholds.get("min_strategy_diversity", 5))
    min_employers = int(thresholds.get("min_employer_count", 50))
    min_core_adj = float(thresholds.get("min_core_plus_adjacent_share", 0.50))

    relevance = Counter()
    phrases = Counter()
    strategies = Counter()
    employers = Counter()

    for raw in records:
        rec = _as_mapping(raw)
        relevance[_relevance_of(rec)] += 1
        if phrase := rec.get("search_phrase"):
            phrases[str(phrase)] += 1
        strategy = rec.get("pe_strategy") or rec.get("strategy")
        if strategy:
            strategies[str(strategy)] += 1
        if employer := rec.get("employer"):
            employers[str(employer)] += 1

    total = sum(relevance.values())
    report = CoverageReport(
        total_records=total,
        relevance_counts=dict(relevance.most_common()),
        search_phrase_counts=dict(phrases.most_common()),
        strategy_counts=dict(strategies.most_common()),
        employer_counts=dict(employers.most_common()),
    )

    # Check: no single search phrase > threshold share of phrase-tagged records.
    phrase_total = sum(phrases.values())
    if phrase_total == 0:
        report.checks.append(
            CoverageCheck(
                name="search_phrase_concentration",
                passed=True,
                detail="No search_phrase fields present; concentration check skipped.",
            )
        )
    else:
        top_phrase, top_count = phrases.most_common(1)[0]
        share = top_count / phrase_total
        report.checks.append(
            CoverageCheck(
                name="search_phrase_concentration",
                passed=share <= max_phrase_share,
                detail=(
                    f"Top phrase {top_phrase!r} is {share:.1%} of phrase-tagged "
                    f"records (limit {max_phrase_share:.0%})."
                ),
            )
        )

    # Strategy diversity among records that carry a strategy.
    distinct_strategies = len(strategies)
    if not strategies:
        # Fall back to configured matrix strategy list coverage intent.
        configured = len(mat.get("strategies") or [])
        report.checks.append(
            CoverageCheck(
                name="strategy_diversity",
                passed=configured >= min_strategies,
                detail=(
                    f"No per-record strategies; matrix lists {configured} strategies "
                    f"(need >= {min_strategies})."
                ),
            )
        )
    else:
        report.checks.append(
            CoverageCheck(
                name="strategy_diversity",
                passed=distinct_strategies >= min_strategies,
                detail=(
                    f"{distinct_strategies} distinct strategies observed "
                    f"(need >= {min_strategies})."
                ),
            )
        )

    # Employer count: observed employers, else configured matrix size.
    observed_employers = len(employers)
    configured_employers = len(mat.get("employers") or [])
    employer_basis = max(observed_employers, configured_employers)
    report.checks.append(
        CoverageCheck(
            name="employer_count",
            passed=employer_basis >= min_employers,
            detail=(
                f"Observed {observed_employers} employers in records; "
                f"matrix lists {configured_employers} "
                f"(need >= {min_employers})."
            ),
        )
    )

    # Core + adjacent share of classified records.
    if total == 0:
        report.checks.append(
            CoverageCheck(
                name="core_adjacent_share",
                passed=False,
                detail="No records to evaluate core+adjacent share.",
            )
        )
    else:
        core_adj = sum(relevance[label] for label in CORE_ADJACENT)
        share = core_adj / total
        report.checks.append(
            CoverageCheck(
                name="core_adjacent_share",
                passed=share >= min_core_adj,
                detail=(
                    f"Core+adjacent share is {share:.1%} "
                    f"({core_adj}/{total}; need >= {min_core_adj:.0%})."
                ),
            )
        )

    return report


def render_coverage_markdown(report: CoverageReport) -> str:
    """Render a coverage report as markdown."""
    lines = [
        "# PE Coverage Report",
        "",
        f"Generated at: `{report.generated_at}`",
        "",
        f"Total records: **{report.total_records}**",
        "",
        "## Checks",
        "",
    ]
    for check in report.checks:
        status = "PASS" if check.passed else "FAIL"
        lines.append(f"- **{check.name}**: `{status}` — {check.detail}")
    lines.extend(["", f"Overall: **{'PASS' if report.all_passed else 'FAIL'}**", ""])

    lines.extend(["## Relevance distribution", ""])
    if report.relevance_counts:
        lines.append("| Relevance | Count |")
        lines.append("|---|---:|")
        for label, count in report.relevance_counts.items():
            lines.append(f"| `{label}` | {count} |")
    else:
        lines.append("_No relevance counts._")
    lines.append("")

    lines.extend(["## Search phrase concentration", ""])
    if report.search_phrase_counts:
        lines.append("| Search phrase | Count |")
        lines.append("|---|---:|")
        for phrase, count in list(report.search_phrase_counts.items())[:25]:
            lines.append(f"| {phrase} | {count} |")
    else:
        lines.append("_No search phrases on records._")
    lines.append("")

    lines.extend(["## Strategy distribution", ""])
    if report.strategy_counts:
        lines.append("| Strategy | Count |")
        lines.append("|---|---:|")
        for strategy, count in report.strategy_counts.items():
            lines.append(f"| `{strategy}` | {count} |")
    else:
        lines.append("_No strategies on records._")
    lines.append("")

    lines.extend(["## Employers (top 30)", ""])
    if report.employer_counts:
        lines.append("| Employer | Count |")
        lines.append("|---|---:|")
        for employer, count in list(report.employer_counts.items())[:30]:
            lines.append(f"| {employer} | {count} |")
    else:
        lines.append("_No employers on records._")
    lines.append("")
    return "\n".join(lines)


def write_coverage_report(
    records: Sequence[Any],
    path: str | Path | None = None,
    **kwargs: Any,
) -> CoverageReport:
    """Compute coverage and write markdown to ``reports/pe-coverage-report.md``."""
    report = compute_coverage(records, **kwargs)
    out = Path(path) if path else DEFAULT_REPORT_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_coverage_markdown(report), encoding="utf-8")
    return report


def matrix_inventory_summary(
    matrix: dict[str, Any] | None = None,
) -> dict[str, int]:
    """Quick inventory of the target matrix configuration."""
    mat = matrix or load_target_matrix()
    strategies: set[str] = set(mat.get("strategies") or [])
    for emp in mat.get("employers") or []:
        strategies.update(emp.get("strategies") or [])
    return {
        "employers": len(mat.get("employers") or []),
        "geographies": len(mat.get("geographies") or []),
        "seniority_bands": len(mat.get("seniority_bands") or []),
        "strategies_configured": len(mat.get("strategies") or []),
        "strategies_referenced": len(strategies),
    }
