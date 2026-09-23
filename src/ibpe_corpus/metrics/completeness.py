"""Pipeline completeness scoreboard + answer coverage / license reports.

Computed from the export files (the same rows ``publish-teaching.ts`` ships),
so the reports always match the exports:

    PYTHONPATH=src python3 -m ibpe_corpus.metrics.completeness

rewrites ``reports/answer-coverage-report.md``, ``reports/pipeline-completeness.md``
and ``reports/license-review.md`` from ``exports/`` + ``config/github_sources.yml``.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml

ROOT = Path(__file__).resolve().parents[3]
PLACEHOLDER_RE = re.compile(r"^\s*structure a clear interview answer to\s*:", re.IGNORECASE)
PREFIX_RE = re.compile(r"^\s*(?:question|q)\s*(?:#|no\.?)?\s*\d{1,4}\s*[:.)\]\-–—]", re.IGNORECASE)
TEACHING_DOMAINS = {"ib", "pe", "both"}


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _pct(n: int, d: int) -> float:
    return (n / d) if d else 0.0


def _norm(text: str | None) -> str:
    return " ".join((text or "").split())


def compute_metrics(
    questions: list[dict[str, Any]],
    answers: list[dict[str, Any]],
    joins: list[dict[str, Any]] | None = None,
    proposals: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """All scoreboard numbers from export rows."""
    joins = joins or []
    proposals = proposals or []
    q_ids = {q["id"] for q in questions}
    ans = [a for a in answers if a.get("canonical_question_id") in q_ids]
    usable = [
        a
        for a in ans
        if a.get("provenance_type") != "rejected"
        and a.get("validation_status") != "needs_generation"
        and not PLACEHOLDER_RE.match(a.get("concise_answer") or "")
    ]
    answered = {a["canonical_question_id"] for a in usable}
    taxonomy_ok = [
        q for q in questions
        if q.get("topic") and q.get("topic") != "untagged" and q.get("domain") in TEACHING_DOMAINS
    ]
    rubric_ok = [a for a in usable if (a.get("rubric") or {}).get("review_status") == "approved"]
    exp_eq = [a for a in usable if _norm(a.get("expanded_explanation")) == _norm(a.get("concise_answer"))]
    total_occ = sum(int(r.get("occurrences") or 0) for r in joins)
    tagged_occ = sum(
        int(r.get("occurrences") or 0) for r in joins if r.get("topic") not in {None, "", "untagged"}
    )
    joined_occ = sum(int(r.get("occurrences") or 0) for r in joins if r.get("canonical_question_id"))
    prov = Counter(a.get("provenance_type") for a in usable)
    rubric_kind = Counter((a.get("rubric") or {}).get("kind") for a in rubric_ok)
    rubric_prov = Counter((a.get("rubric") or {}).get("provenance") for a in rubric_ok)
    prop_status = Counter(p.get("status") for p in proposals)
    return {
        "teaching_questions": len(questions),
        "answers_exported": len(ans),
        "answered_questions": len(answered),
        "c1": _pct(len(answered), len(questions)),
        "taxonomy_ok": len(taxonomy_ok),
        "c2": _pct(len(taxonomy_ok), len(questions)),
        "topic_filled": sum(1 for q in questions if q.get("topic") and q.get("topic") != "untagged"),
        "domain_filled": sum(1 for q in questions if q.get("domain") in TEACHING_DOMAINS),
        "difficulty_filled": sum(1 for q in questions if q.get("difficulty")),
        "rubric_approved": len(rubric_ok),
        "c11": _pct(len(rubric_ok), len(usable)),
        "rubric_kinds": dict(rubric_kind),
        "rubric_provenance": dict(rubric_prov),
        "placeholders": sum(1 for a in ans if PLACEHOLDER_RE.match(a.get("concise_answer") or "")),
        "prefix_wordings": sum(1 for q in questions if PREFIX_RE.match(q.get("canonical_wording") or "")),
        "expanded_equals_concise": len(exp_eq),
        "expanded_equals_concise_rate": _pct(len(exp_eq), len(usable)),
        "needs_expansion_tagged": sum(1 for a in usable if "needs_expansion" in (a.get("quality_tags") or [])),
        "with_mistakes_or_follow_ups": sum(
            1 for a in usable if a.get("common_mistakes") or a.get("follow_ups")
        ),
        "provenance": dict(prov),
        "validated": sum(
            1 for a in usable if a.get("validation_status") in {"pass", "pass_with_assumptions"}
        ),
        "signal_occurrences": total_occ,
        "c3": _pct(tagged_occ, total_occ),
        "c4": _pct(joined_occ, total_occ),
        "join_methods": dict(
            Counter(r.get("join_method") for r in joins if r.get("join_method"))
        ),
        "domains": dict(Counter(q.get("domain") for q in questions)),
        "topics": dict(Counter(q.get("topic") or "null" for q in questions).most_common()),
        "proposal_status": dict(prop_status),
        "proposals": len(proposals),
        "auto_approved": sum(1 for p in proposals if p.get("auto_approved")),
    }


def _status(value: float, target: float) -> str:
    return "**green**" if value >= target else "**red**"


def write_answer_coverage_report(path: Path, m: dict[str, Any]) -> None:
    prov = m["provenance"]
    lines = [
        "# Answer coverage report",
        "",
        f"_Generated {datetime.now(timezone.utc).date().isoformat()} from `exports/` "
        "by `ibpe_corpus.metrics.completeness` — do not hand-edit._",
        "",
        "| Metric | Value |",
        "|--------|------:|",
        f"| Publishable teaching questions | {m['teaching_questions']} |",
        f"| Questions with a publishable answer (C1) | {m['answered_questions']} ({m['c1']:.1%}) |",
        f"| Answers exported | {m['answers_exported']} |",
        f"| Validated (pass / pass_with_assumptions) | {m['validated']} |",
        f"| Placeholder answers (`Structure a clear interview answer to:`) | {m['placeholders']} |",
        f"| Wordings still prefixed `Question N:` | {m['prefix_wordings']} |",
        f"| `expanded == concise` | {m['expanded_equals_concise']} ({m['expanded_equals_concise_rate']:.1%}) |",
        f"| Tagged `needs_expansion` | {m['needs_expansion_tagged']} |",
        f"| With common mistakes or follow-ups | {m['with_mistakes_or_follow_ups']} |",
        f"| Approved rubric (C11) | {m['rubric_approved']} ({m['c11']:.1%}) |",
        "",
        "## Provenance",
        "",
        "| Provenance | Answers |",
        "|------------|--------:|",
        *[f"| `{k}` | {v} |" for k, v in sorted(prov.items(), key=lambda kv: -kv[1])],
        "",
        "## Rubrics",
        "",
        f"- Kinds: {', '.join(f'`{k}` {v}' for k, v in sorted(m['rubric_kinds'].items())) or 'none'}",
        f"- Provenance: {', '.join(f'`{k}` {v}' for k, v in sorted(m['rubric_provenance'].items())) or 'none'}",
        "- Heuristic rubrics are extractive (key points are verbatim teaching-answer sentences)",
        "  and auto-approved only when validators pass: weights sum to 1 ± 0.01, ≥ 1 must-have,",
        "  ≤ 6 key points, numeric checks recompute via `calculators.py`. They are not",
        "  human-reviewed; with an OpenRouter key, LLM `rubric-v1` drafts replace only the ones",
        "  that fail validation or fall below the auto-approve bar (small model, primary on retry).",
        "",
        "## Provenance rules",
        "",
        "- Synthesised answers are never labelled `source_provided`.",
        "- Glassdoor bank rows never supply teaching answers, key points or expected values.",
        "- Generic placeholders are `needs_generation` and withheld by the publish gate.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_completeness_report(path: Path, m: dict[str, Any]) -> None:
    c1_status = "**green**" if m["c1"] >= 0.98 else "**watch**" if m["c1"] >= 0.9 else "**red**"
    rows = [
        ("C1", "Teaching answer coverage",
         f"{m['answered_questions']}/{m['teaching_questions']} ({m['c1']:.1%}); placeholders {m['placeholders']}",
         "100% non-rejected, 0 placeholders", c1_status,
         "Placeholders withheld (`needs_generation`); remaining gaps need LLM/editorial answers"),
        ("C2", "Teaching taxonomy",
         f"{m['taxonomy_ok']}/{m['teaching_questions']} ({m['c2']:.1%}) topic + domain ∈ ib/pe/both",
         "≥80%", _status(m["c2"], 0.8),
         f"Heuristic enrich (rules v4 + source labels); {m['proposal_status'].get('pending', 0)} proposals pending review"),
        ("C3", "Signal topic coverage",
         f"{m['c3']:.1%} of {m['signal_occurrences']} bank occurrences tagged (local export)",
         "≥70%", _status(m["c3"], 0.7), "Keyword rules v4 in Python; LLM tagger when key exists"),
        ("C4", "Signal↔teaching join",
         f"{m['c4']:.1%} joined ({', '.join(f'{k} {v}' for k, v in sorted(m['join_methods'].items()))})",
         "≥25%", _status(m["c4"], 0.25), "`exports/occurrence_joins.jsonl` → publish-teaching `--occurrence-joins`"),
        ("C5", "PE breadth", f"domains {m['domains']}", "Thresholds in `pe_target_matrix.yml`", "**watch**",
         "See `reports/pe-coverage-report.md`"),
        ("C6", "Mode B drills", "Checkpoint seed 039 + runtime topic fill", "≥3 Qs per checkpoint in prod",
         "**watch**", "Curriculum track (P2.10)"),
        ("C7", "Practice mode readiness", "Mode pack builders + `rag` alias shipped", "Dense `rag` in prod",
         "**watch**", "Run `embed:rag` (now embeds concepts + answer chunks)"),
        ("C8", "License", "Owner attestation 2026-09-23: permission for all listed sources",
         "Cleared for prod expand", "**green**", "`reports/license-review.md`"),
        ("C9", "LLM practice scoring", "Grader wired (`llm`→`deterministic`→`self`)", "`score_source=llm` in prod",
         "**watch**", "Needs OpenRouter key (ADR 0007)"),
        ("C10", "Diagram coverage", "040 adds WACC/MOIC/accretion/paper-LBO", "Core concepts + embed a11y",
         "**watch**", "Diagram track"),
        ("C11", "Rubric coverage",
         f"{m['rubric_approved']}/{m['answered_questions']} ({m['c11']:.1%}) approved rubrics",
         "≥90% publishable answers", _status(m["c11"], 0.9),
         "Heuristic rubrics auto-approved only when validators pass (not human-reviewed)"),
        ("C12", "Grader quality", "not measured by content pipeline", "Eval MAE ≤0.12, `correct` ≥90%",
         "**watch**", "Grader eval harness (P3.6)"),
        ("C13", "Daily loop live", "not measured by content pipeline", "Daily set + streaks on in prod",
         "**watch**", "Retention track (Phases 4–6)"),
        ("C14", "Drill coverage", "not measured by content pipeline",
         "≥1 numeric drill template per core calc concept", "**watch**",
         "Drills track (P2.8); `calculators.py` exposes the parity functions"),
    ]
    extra = [
        ("Q-prefix", "`Question N:` wordings", str(m["prefix_wordings"]), "0",
         "**green**" if m["prefix_wordings"] == 0 else "**red**"),
        ("Depth", "`expanded == concise`",
         f"{m['expanded_equals_concise']} ({m['expanded_equals_concise_rate']:.1%})", "<5%",
         "**green**" if m["expanded_equals_concise_rate"] < 0.05 else "**red**"),
        ("Proposals", "Enrichment proposals",
         f"{m['proposals']} ({m['auto_approved']} auto-approved; {m['proposal_status']})", "durable + reviewable",
         "**green**" if m["proposals"] else "**watch**"),
    ]
    lines = [
        "# Pipeline completeness scoreboard",
        "",
        f"**Updated:** {datetime.now(timezone.utc).date().isoformat()} (generated from `exports/` by "
        "`ibpe_corpus.metrics.completeness`)  ",
        "**Contract:** [docs/data-pipeline.md](../docs/data-pipeline.md)  ",
        "**Plan:** docs/plans/2026-09-23-001-learning-loop-grading-retention-plan.md (C11–C14)",
        "",
        "| ID | Dimension | Current | Target | Status | Blocker / note |",
        "|----|-----------|---------|--------|--------|----------------|",
        *[f"| {a} | {b} | {c} | {d} | {e} | {f} |" for a, b, c, d, e, f in rows],
        "",
        "## Content quality gates",
        "",
        "| Gate | Dimension | Current | Target | Status |",
        "|------|-----------|---------|--------|--------|",
        *[f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in extra],
        "",
        "## Mode readiness (product)",
        "",
        "| Mode | Ready? | Why |",
        "|------|--------|-----|",
        "| `rag` (alias `pseudo_rag`) | partial | Pack freezes real/lexical RAG; prod dense key still env-dependent |",
        "| `company` | partial | Heat-biased RAG pack + grader context; joins now exported with score/method |",
        "| `concept` | partial | Checkpoint seed 039 + runtime fill; needs DB apply |",
        "| `adaptive_weak` | partial | Weak mastery + topic fill; cold-start honest |",
        "| `simulator` | partial | Stage topic map + heat bias; grader on attempts |",
        "",
        "## Regenerate",
        "",
        "```bash",
        "PYTHONPATH=src python3 -m ibpe_corpus.cli run-pipeline --mode fixtures --force",
        "PYTHONPATH=src python3 -m ibpe_corpus.metrics.completeness   # reports only, from exports",
        "```",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def load_sources(config_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not config_path.is_file():
        return [], {}
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    return list(payload.get("sources") or []), dict(payload.get("owner_attestation") or {})


def write_license_review(path: Path, config_path: Path | None = None) -> None:
    """License review generated from ``config/github_sources.yml`` attestations."""
    sources, attestation = load_sources(config_path or ROOT / "config" / "github_sources.yml")
    teaching = [s for s in sources if str(s.get("product_role")) == "teaching_qa"]
    pattern = [s for s in sources if str(s.get("product_role")) != "teaching_qa"]
    date = attestation.get("date", "n/a")
    lines = [
        "# License review — GitHub teaching corpora",
        "",
        f"**Status: CLEARED by owner attestation ({date}).** The repository owner confirmed",
        "permission to use all listed teaching sources. This report is generated from",
        "`config/github_sources.yml` — edit the config, not this file.",
        "",
        "## Owner attestation",
        "",
        f"- **Date:** {date}",
        f"- **Attested by:** {attestation.get('attested_by', 'repository owner')}",
        f"- **Scope:** {attestation.get('scope', 'all sources listed with product_role teaching_qa')}",
        f"- **Statement:** {attestation.get('statement', '')}",
        f"- **Recorded by:** {attestation.get('recorded_by', 'content track')}",
        "",
        "Attestation is the owner's representation; it does not replace an upstream SPDX",
        "licence. Keep attribution on published provenance and revisit if a source adds",
        "restrictive terms.",
        "",
        "| Source | Commit | Product role | Imported content | Decision |",
        "|--------|--------|--------------|------------------|----------|",
    ]
    for s in teaching:
        sha = str(s.get("commit_sha") or "")[:8]
        lines.append(
            f"| `{s['repo']}` | `{sha}…` | `{s.get('product_role')}` | {s.get('imported_content', s.get('format'))} "
            f"| **{str(s.get('license_status', 'pending_review')).replace('_', ' ')}** |"
        )
    lines += [
        "| Static seed (`fixtures/corpus/seed_ib_pe_questions.json`) | n/a | `teaching_qa` | Synthetic in-repo fixture | **Allowed (synthetic)** |",
        "| Behavioural seed (`fixtures/corpus/behavioural_seed.json`) | n/a | `teaching_qa` | Synthesised coaching guidance (not Glassdoor) | **Allowed (synthetic)** |",
        "| `data/question_bank.json` | n/a | `firm_signal` | Occurrence heat only — never teaching answers | **Signal-only (no teaching publish)** |",
        "",
        "## Pattern-only / not imported",
        "",
        *[f"- `{s['repo']}` — `{s.get('import_priority')}` ({s.get('product_role')})" for s in pattern],
        "",
        "## Gate",
        "",
        f"- [x] Owner signs off listed GitHub teaching sources ({date})",
        "- [x] Attribution recorded on answer provenance (`source_ids`, source artefact URLs)",
        "- [x] Pattern-only scraper repos remain non-imported",
        "- [x] `[Interview process]` placeholders absent from published exports",
        "",
        "## References",
        "",
        "- `config/github_sources.yml`",
        "- `docs/source-registry.md`",
        "- `packages/contracts` `ProvenanceEnum` (`github_source` | `static_seed` | `glassdoor_occurrence` | …)",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_reports(
    exports_dir: Path,
    reports_dir: Path,
    *,
    config_path: Path | None = None,
    enrichment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    questions = _read_jsonl(exports_dir / "questions.jsonl")
    answers = _read_jsonl(exports_dir / "answers.jsonl")
    joins = _read_jsonl(exports_dir / "occurrence_joins.jsonl")
    proposals = _read_jsonl(exports_dir / "enrichment_proposals.jsonl")
    m = compute_metrics(questions, answers, joins, proposals)
    if enrichment:
        m["enrichment"] = enrichment
    reports_dir.mkdir(parents=True, exist_ok=True)
    write_answer_coverage_report(reports_dir / "answer-coverage-report.md", m)
    write_completeness_report(reports_dir / "pipeline-completeness.md", m)
    write_license_review(reports_dir / "license-review.md", config_path)
    return m


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regenerate completeness reports from exports")
    parser.add_argument("--exports", type=Path, default=ROOT / "exports")
    parser.add_argument("--reports", type=Path, default=ROOT / "reports")
    args = parser.parse_args(list(argv) if argv is not None else None)
    m = write_reports(args.exports, args.reports)
    print(json.dumps({k: v for k, v in m.items() if not isinstance(v, dict)}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
