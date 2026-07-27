"""Unit tests for PE taxonomy loading, queries, classifier, and coverage."""

from __future__ import annotations

from pathlib import Path

import pytest

from ibpe_corpus.pe.classifier import classify_role
from ibpe_corpus.pe.coverage import (
    compute_coverage,
    matrix_inventory_summary,
    write_coverage_report,
)
from ibpe_corpus.pe.queries import (
    DEFAULT_MAX_PHRASES,
    estimate_expansion_size,
    generate_occupation_search_phrases,
    phrase_strings,
)
from ibpe_corpus.pe.taxonomy import (
    clear_caches,
    employer_names,
    load_target_matrix,
    load_taxonomy,
)
from ibpe_corpus.schemas.models import PERelevance

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _clear_pe_caches():
    clear_caches()
    yield
    clear_caches()


class TestTaxonomy:
    def test_taxonomy_loads_required_sections(self):
        tax = load_taxonomy()
        assert "core_investing_roles" in tax
        assert "strategy_roles" in tax
        assert "exclusion_classes" in tax
        assert "relevance_labels" in tax
        assert "concept_queries" in tax
        assert len(tax["core_investing_roles"]) >= 10
        assert len(tax["strategy_roles"]) >= 15
        assert len(tax["concept_queries"]) >= 10

    def test_relevance_labels_match_enum(self):
        tax = load_taxonomy()
        labels = set(tax["relevance_labels"].values())
        for member in PERelevance:
            assert member.value in labels

    def test_target_matrix_has_50_plus_employers(self):
        matrix = load_target_matrix()
        employers = matrix["employers"]
        assert len(employers) >= 50
        assert len(employer_names(matrix)) >= 50
        assert "geographies" in matrix
        assert "seniority_bands" in matrix
        assert "strategies" in matrix
        names = {e["name"] for e in employers}
        assert "Blackstone" in names
        assert "HarbourVest Partners" in names
        assert "Golub Capital" in names


class TestQueries:
    def test_phrases_include_role_aliases_and_are_bounded(self):
        phrases = generate_occupation_search_phrases()
        texts = [p.phrase for p in phrases]
        assert any("Private Equity Associate" in t for t in texts)
        assert len(phrases) <= DEFAULT_MAX_PHRASES
        assert len(phrases) == len({p.phrase.lower() for p in phrases})

    def test_strategy_combos_and_concepts_present(self):
        phrases = generate_occupation_search_phrases()
        sources = {p.source for p in phrases}
        assert "role_alias" in sources
        assert "strategy_combo" in sources
        assert "concept" in sources
        texts = phrase_strings()
        assert any("LBO" in t or "MOIC" in t or "IRR" in t for t in texts)

    def test_expansion_estimate(self):
        sizes = estimate_expansion_size()
        assert sizes["bounded_phrases"] <= DEFAULT_MAX_PHRASES
        assert sizes["role_aliases"] > 0


class TestClassifierBenchmarks:
    @pytest.mark.parametrize(
        ("title", "context", "expected"),
        [
            ("Private Equity Associate", "", PERelevance.CORE_PE_INVESTING),
            ("PE Associate", "Blackstone New York", PERelevance.CORE_PE_INVESTING),
            ("Investment Associate", "Private Equity buyout fund", PERelevance.CORE_PE_INVESTING),
            ("Pre-MBA Associate", "PE middle market", PERelevance.CORE_PE_INVESTING),
            ("Private Equity Analyst", "", PERelevance.CORE_PE_INVESTING),
            ("Fund Accountant", "Private Equity fund", PERelevance.FUND_OPERATIONS),
            ("PE Fund Accountant", "", PERelevance.FUND_OPERATIONS),
            ("Investor Relations Associate", "Private Equity", PERelevance.FUND_OPERATIONS),
            ("PE Recruiter", "", PERelevance.NOT_PE),
            ("Private Equity Recruiter", "executive search", PERelevance.NOT_PE),
            ("Portfolio Operations", "", PERelevance.PORTFOLIO_OPERATIONS),
            ("Portfolio Ops Associate", "value creation", PERelevance.PORTFOLIO_OPERATIONS),
            ("Value Creation Associate", "PE portfolio", PERelevance.PORTFOLIO_OPERATIONS),
            ("Financial Sponsors Associate", "", PERelevance.PE_ADVISORY),
            ("Transaction Services Associate", "QoE for PE", PERelevance.PE_ADVISORY),
            ("Growth Equity Associate", "", PERelevance.ADJACENT_PE_INVESTING),
            ("Private Credit Associate", "", PERelevance.ADJACENT_PE_INVESTING),
            ("Fund of Funds Associate", "", PERelevance.ALLOCATOR_OR_FUND_SELECTION),
            ("Wealth Manager", "HNWI", PERelevance.NOT_PE),
            ("Software Sales", "PE SaaS vendor", PERelevance.NOT_PE),
        ],
    )
    def test_classify_role_benchmarks(self, title, context, expected):
        assert classify_role(title, context) == expected


class TestCoverage:
    def test_matrix_inventory(self):
        summary = matrix_inventory_summary()
        assert summary["employers"] >= 50
        assert summary["strategies_configured"] >= 5
        assert summary["geographies"] >= 5

    def test_compute_coverage_checks(self, tmp_path: Path):
        records = [
            {
                "role": "Private Equity Associate",
                "employer": "KKR",
                "search_phrase": "Private Equity Associate",
                "pe_strategy": "buyout",
            },
            {
                "role": "Growth Equity Associate",
                "employer": "General Atlantic",
                "search_phrase": "Growth Equity Associate",
                "pe_strategy": "growth_equity",
            },
            {
                "role": "Private Credit Associate",
                "employer": "Golub Capital",
                "search_phrase": "Private Credit Associate",
                "pe_strategy": "private_credit",
            },
            {
                "role": "Secondaries Associate",
                "employer": "HarbourVest Partners",
                "search_phrase": "Secondaries Associate",
                "pe_strategy": "secondaries",
            },
            {
                "role": "Infrastructure Associate",
                "employer": "EQT",
                "search_phrase": "Infrastructure Associate",
                "pe_strategy": "infrastructure",
            },
            {
                "role": "Real Estate Private Equity Associate",
                "employer": "Starwood Capital",
                "search_phrase": "REPE Associate",
                "pe_strategy": "real_estate_pe",
            },
            {
                "role": "Fund Accountant",
                "employer": "Blackstone",
                "search_phrase": "Fund Accountant",
                "pe_strategy": "buyout",
            },
        ]
        report = compute_coverage(records)
        assert report.total_records == 7
        assert report.relevance_counts[PERelevance.CORE_PE_INVESTING.value] >= 1
        phrase_check = next(c for c in report.checks if c.name == "search_phrase_concentration")
        assert phrase_check.passed
        employer_check = next(c for c in report.checks if c.name == "employer_count")
        assert employer_check.passed  # matrix has >= 50 even if sample is small
        strategy_check = next(c for c in report.checks if c.name == "strategy_diversity")
        assert strategy_check.passed

        out = tmp_path / "pe-coverage-report.md"
        write_coverage_report(records, path=out)
        text = out.read_text(encoding="utf-8")
        assert "# PE Coverage Report" in text
        assert "search_phrase_concentration" in text

    def test_phrase_concentration_fails_when_dominated(self):
        records = [
            {
                "role": "Private Equity Associate",
                "employer": f"Firm{i}",
                "search_phrase": "Private Equity Associate",
                "pe_strategy": "buyout",
            }
            for i in range(10)
        ] + [
            {
                "role": "Growth Equity Associate",
                "employer": "GA",
                "search_phrase": "Growth Equity Associate",
                "pe_strategy": "growth_equity",
            }
        ]
        report = compute_coverage(records)
        phrase_check = next(c for c in report.checks if c.name == "search_phrase_concentration")
        assert not phrase_check.passed
