"""End-to-end fixture-mode corpus pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ibpe_corpus import GENERATOR_VERSION, PARSER_VERSION, VALIDATOR_VERSION
from ibpe_corpus.adapters.github.adapter import GitHubSourceAdapter
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.adapters.static.seed_corpus import load_seed_corpus
from ibpe_corpus.answers.ingest_source import ingest_extracted_record
from ibpe_corpus.answers.pipeline import fill_answers
from ibpe_corpus.canonical.canonicalise import canonicalise
from ibpe_corpus.canonical.families import build_relationship_graph
from ibpe_corpus.canonical.firm_signals import join_firm_signals
from ibpe_corpus.canonical.publish_gate import (
    filter_extracted_for_publish,
    filter_publishable_answers,
    filter_publishable_questions,
    is_interview_process_placeholder,
)
from ibpe_corpus.export.exporters import export_all
from ibpe_corpus.metrics.collector import MetricsCollector
from ibpe_corpus.orchestration.jobs import JobRunner
from ibpe_corpus.pe.classifier import classify_role
from ibpe_corpus.pe.coverage import compute_coverage, write_coverage_report
from ibpe_corpus.pe.queries import phrase_strings
from ibpe_corpus.schemas.models import (
    Answer,
    AnswerProvenance,
    CanonicalQuestion,
    Domain,
    ExtractionClass,
    ExtractedRecord,
    PERelevance,
    QuestionResponse,
    ValidationStatus,
)
from ibpe_corpus.storage.db import (
    CorpusStore,
    answers as answers_table,
    canonical_questions as cq_table,
    interview_occurrences as occ_table,
    merge_audit as merge_table,
    question_responses as resp_table,
    question_variants as qv_table,
    raw_records as raw_table,
    source_artefacts as art_table,
)

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_HTML = ROOT / "fixtures" / "glassdoor" / "html"
DEFAULT_DB = ROOT / "data" / "db" / "corpus.db"
EXPORTS_DIR = ROOT / "exports"
REPORTS_DIR = ROOT / "reports"
GITHUB_SOURCES = ROOT / "config" / "github_sources.yml"
GITHUB_STAGING = ROOT / "data" / "staging" / "github"


def _persist_artefacts(store: CorpusStore, artefacts: list) -> int:
    n = 0
    for art in artefacts:
        inserted = store.insert_ignore(
            art_table,
            {
                "id": art.id,
                "source_family": art.source_family,
                "url_or_path": art.url_or_path,
                "commit_sha": art.commit_sha,
                "retrieved_at": art.retrieved_at.isoformat(),
                "raw_html_path": art.raw_html_path,
                "raw_json_path": art.raw_json_path,
                "screenshot_path": art.screenshot_path,
                "network_log_path": art.network_log_path,
                "content_hash": art.content_hash,
                "parser_version": art.parser_version,
                "access_state": art.access_state.value,
                "session_class": art.session_class,
                "metadata_json": store.dumps(art.metadata),
            },
        )
        if inserted:
            n += 1
    return n


def _persist_extracted(store: CorpusStore, records: list[ExtractedRecord]) -> int:
    n = 0
    for rec in records:
        inserted = store.insert_ignore(
            raw_table,
            {
                "id": rec.id,
                "source_artefact_id": rec.source_artefact_id,
                "exact_source_text": rec.exact_source_text,
                "source_selector_or_span": rec.source_selector_or_span,
                "record_type": rec.record_type.value,
                "extraction_method": rec.extraction_method,
                "extracted_metadata_json": store.dumps(rec.extracted_metadata),
                "grounding_confidence": rec.grounding_confidence,
                "validation_status": rec.validation_status.value,
            },
        )
        if inserted:
            n += 1
    return n


def _apply_pe_labels(records: list[ExtractedRecord]) -> list[ExtractedRecord]:
    for rec in records:
        meta = dict(rec.extracted_metadata or {})
        role = str(meta.get("role") or meta.get("job_title") or meta.get("title") or "")
        ctx = " ".join(
            str(meta.get(k) or "")
            for k in ("employer", "company", "category", "topic", "domain")
        )
        if role or "private equity" in rec.exact_source_text.lower() or "lbo" in rec.exact_source_text.lower():
            label = classify_role(role or rec.exact_source_text[:80], ctx)
            meta["pe_relevance"] = label.value
            if label in {PERelevance.CORE_PE_INVESTING, PERelevance.ADJACENT_PE_INVESTING}:
                meta.setdefault("domain", Domain.PE.value)
            rec.extracted_metadata = meta
        domain = str(meta.get("domain") or "").lower()
        if domain in {"ib", "pe", "both"}:
            meta["domain"] = domain
            rec.extracted_metadata = meta
    return records


def _answers_from_extracted(
    questions: list[CanonicalQuestion],
    variants: list,
    extracted: list[ExtractedRecord],
) -> list[Answer]:
    """Attach SOURCE_PROVIDED answers from extracted records to matching canonicals."""
    # Map source wording hash / pair ids to canonical ids via variants
    by_variant_hash: dict[str, str] = {}
    from ibpe_corpus.canonical.normalise import normalised_hash

    for v in variants:
        by_variant_hash[v.normalised_hash] = v.canonical_question_id

    # Also map pair_id from metadata on question records to answer records
    pair_to_cq: dict[str, str] = {}
    for rec in extracted:
        if rec.record_type not in {
            ExtractionClass.EXACT_QUESTION,
            ExtractionClass.PARAPHRASED_QUESTION,
        }:
            continue
        pair_id = (rec.extracted_metadata or {}).get("pair_id")
        if not pair_id:
            continue
        h = normalised_hash(rec.exact_source_text)
        cq_id = by_variant_hash.get(h)
        if cq_id:
            pair_to_cq[str(pair_id)] = cq_id

    out: list[Answer] = []
    for rec in extracted:
        if rec.record_type not in {
            ExtractionClass.SOURCE_PROVIDED_ANSWER,
            ExtractionClass.COMMUNITY_ANSWER,
            ExtractionClass.CANDIDATE_ATTEMPT,
        }:
            continue
        meta = rec.extracted_metadata or {}
        cq_id = None
        pair_id = meta.get("pair_id")
        if pair_id and str(pair_id) in pair_to_cq:
            cq_id = pair_to_cq[str(pair_id)]
        if cq_id is None and meta.get("question_id"):
            # seed corpus links via question id in metadata sometimes
            for cq in questions:
                if cq.id.endswith(str(meta["question_id"])) or str(meta["question_id"]) in cq.id:
                    cq_id = cq.id
                    break
        if cq_id is None:
            # fuzzy: match via parent question text hash if present
            parent_q = meta.get("question_text") or meta.get("parent_question")
            if parent_q:
                cq_id = by_variant_hash.get(normalised_hash(str(parent_q)))
        if cq_id is None:
            continue
        ans = ingest_extracted_record(rec, canonical_question_id=cq_id)
        if ans:
            out.append(ans)
    return out


def run_fixture_pipeline(
    *,
    db_path: Path | str = DEFAULT_DB,
    exports_dir: Path | str = EXPORTS_DIR,
    reports_dir: Path | str = REPORTS_DIR,
    force: bool = False,
    include_question_bank: bool = True,
) -> dict[str, Any]:
    """Run the full controlled collection pipeline in fixture/offline mode."""
    db_path = Path(db_path)
    exports_dir = Path(exports_dir)
    reports_dir = Path(reports_dir)
    exports_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    store = CorpusStore(db_path)
    runner = JobRunner(store)
    metrics = MetricsCollector()
    job_results: list[dict[str, Any]] = []

    all_extracted: list[ExtractedRecord] = []
    teaching_extracted: list[ExtractedRecord] = []
    signal_extracted: list[ExtractedRecord] = []
    all_responses: list[QuestionResponse] = []
    rejected: list[dict[str, Any]] = []
    placeholder_rejects: list[dict[str, Any]] = []

    def _record(job_name: str, key: str, payload: dict[str, Any], **kwargs: Any) -> None:
        # Work already executed for in-memory assembly; runner enforces idempotent job rows.
        jr = runner.run(job_name, key, lambda: payload, force=force, **kwargs)
        job_results.append(jr.model_dump(mode="json"))
        metrics.add_from(jr.metrics)
        metrics.add_from(payload.get("metrics"))

    # --- discover_sources ---
    discover_payload = {
        "input_count": 0,
        "output_count": 3,
        "metrics": {"pages_discovered": 3},
        "message": "static_seed,glassdoor_fixtures,github_adapter,question_bank_signals",
    }
    _record("discover_sources", "discover:fixtures:v2", discover_payload)

    # --- extract glassdoor fixtures (always assemble in memory; DB inserts are idempotent) ---
    def extract_glassdoor() -> dict[str, Any]:
        nonlocal all_extracted, all_responses, placeholder_rejects, signal_extracted
        html_files = sorted(FIXTURES_HTML.glob("*.html"))
        pages_fetched = 0
        pages_blocked = 0
        exact = 0
        for path in html_files:
            html = path.read_text(encoding="utf-8", errors="replace")
            result = parse_html(html, source_url=f"fixture://{path.name}")
            pages_fetched += 1
            _persist_artefacts(store, result.artefacts)
            if result.access_state.value in {"blocked", "captcha", "throttled"}:
                pages_blocked += 1
                metrics.alert(f"fixture {path.name} access_state={result.access_state.value}")
            else:
                kept, rej = filter_extracted_for_publish(result.extracted)
                placeholder_rejects.extend(rej)
                # Fixtures are Glassdoor-shaped — firm signals only, not teaching truth.
                for rec in kept:
                    meta = dict(rec.extracted_metadata or {})
                    meta.setdefault("product_role", "firm_signal")
                    meta.setdefault("contract_provenance", "glassdoor_occurrence")
                    meta.setdefault("source_family", "glassdoor_fixture")
                    meta["teaching_source"] = False
                    if rec.record_type == ExtractionClass.EXACT_QUESTION:
                        rec.record_type = ExtractionClass.TOPIC_SIGNAL
                        rec.extraction_method = (rec.extraction_method or "") + "+firm_signal"
                    rec.extracted_metadata = meta
                _persist_extracted(store, kept)
                signal_extracted.extend(kept)
                all_extracted.extend(kept)
                all_responses.extend(result.responses)
                exact += sum(
                    1
                    for r in kept
                    if r.record_type
                    in {ExtractionClass.EXACT_QUESTION, ExtractionClass.TOPIC_SIGNAL}
                )
            for d in result.diagnostics:
                if "comment" in d.lower() or "response" in d.lower():
                    metrics.alert(d)
            metrics.add_from(result.metrics)
        return {
            "input_count": len(html_files),
            "output_count": exact,
            "metrics": {
                "pages_fetched": pages_fetched,
                "pages_blocked": pages_blocked,
                "exact_questions": exact,
                "responses_reached": len(all_responses),
            },
        }

    extract_payload = extract_glassdoor()
    _record(
        "extract_records",
        "extract:glassdoor-fixtures:v1",
        extract_payload,
        parser_or_model_version=PARSER_VERSION,
    )

    # --- import static seed + github teaching corpora + bank firm signals ---
    def import_corpora() -> dict[str, Any]:
        nonlocal all_extracted, teaching_extracted, signal_extracted, placeholder_rejects
        count = 0
        sources = 0
        github_q = 0
        github_a = 0

        seed = load_seed_corpus()
        _persist_artefacts(store, seed.artefacts)
        seed_kept, seed_rej = filter_extracted_for_publish(seed.extracted)
        placeholder_rejects.extend(seed_rej)
        _persist_extracted(store, seed_kept)
        teaching_extracted.extend(seed_kept)
        all_extracted.extend(seed_kept)
        count += len(seed_kept)
        sources += 1
        metrics.add_from(seed.metrics)

        adapter = GitHubSourceAdapter(
            config_path=GITHUB_SOURCES,
            staging_root=GITHUB_STAGING,
        )
        for priority in ("high", "medium", "low"):
            gh = adapter.run(config={"import_priority": priority}, fetch=False)
            if not gh.extracted and priority == "high":
                gh = adapter.run(config={"import_priority": priority}, fetch=True)
            if not gh.extracted and not gh.artefacts:
                continue
            _persist_artefacts(store, gh.artefacts)
            kept, rej = filter_extracted_for_publish(gh.extracted)
            placeholder_rejects.extend(rej)
            _persist_extracted(store, kept)
            teaching_extracted.extend(kept)
            all_extracted.extend(kept)
            count += len(kept)
            sources += 1
            github_q += int(gh.metrics.get("exact_questions") or 0)
            github_a += int(gh.metrics.get("source_answers") or 0)
            metrics.add_from(gh.metrics)
            for d in gh.diagnostics:
                if "no importer" in d or "missing staged" in d:
                    metrics.alert(d)

        bank_signals = 0
        if include_question_bank:
            bank_result = import_question_bank()
            if bank_result.extracted:
                _persist_artefacts(store, bank_result.artefacts)
                kept, rej = filter_extracted_for_publish(bank_result.extracted)
                placeholder_rejects.extend(rej)
                _persist_extracted(store, kept)
                signal_extracted.extend(kept)
                all_extracted.extend(kept)
                count += len(kept)
                sources += 1
                bank_signals = int(bank_result.metrics.get("topic_signals") or 0)
                metrics.add_from(bank_result.metrics)
                if bank_result.metrics.get("placeholders_rejected"):
                    metrics.incr(
                        "placeholders_rejected",
                        int(bank_result.metrics["placeholders_rejected"]),
                    )

        return {
            "input_count": sources,
            "output_count": count,
            "metrics": {
                "exact_questions": sum(
                    1
                    for r in teaching_extracted
                    if r.record_type == ExtractionClass.EXACT_QUESTION
                ),
                "github_questions": github_q,
                "github_answers": github_a,
                "firm_signals": bank_signals,
                "placeholders_rejected": len(placeholder_rejects),
            },
        }

    import_payload = import_corpora()
    bank_suffix = "bank" if include_question_bank else "nobank"
    _record(
        "discover_sources",
        f"import:seed+github+{bank_suffix}:v2",
        import_payload,
    )

    # --- PE classify ---
    def classify_pe() -> dict[str, Any]:
        nonlocal all_extracted
        all_extracted = _apply_pe_labels(all_extracted)
        core = sum(
            1
            for r in all_extracted
            if (r.extracted_metadata or {}).get("pe_relevance")
            in {
                PERelevance.CORE_PE_INVESTING.value,
                PERelevance.ADJACENT_PE_INVESTING.value,
            }
        )
        false_pos = sum(
            1
            for r in all_extracted
            if (r.extracted_metadata or {}).get("pe_relevance")
            in {
                PERelevance.FUND_OPERATIONS.value,
                PERelevance.NOT_PE.value,
            }
        )
        phrases = phrase_strings()
        return {
            "input_count": len(all_extracted),
            "output_count": core,
            "metrics": {
                "core_pe_records": core,
                "pe_false_positives": false_pos,
                "pe_search_phrases": len(phrases),
            },
            "resume_checkpoint": {"phrase_sample": phrases[:10]},
        }

    classify_payload = classify_pe()
    _record("classify_pe_relevance", "classify:pe:v1", classify_payload)

    # --- canonicalise teaching truth separately so fuzzy dedupe stays on ---
    canon_result = None

    def do_canonicalise() -> dict[str, Any]:
        nonlocal canon_result
        from ibpe_corpus.canonical.canonicalise import CanonicalisationResult

        teaching_rows = [
            r
            for r in teaching_extracted
            if not is_interview_process_placeholder(r.exact_source_text)
        ]
        signal_rows = [
            r
            for r in signal_extracted
            if not is_interview_process_placeholder(r.exact_source_text)
        ]
        # Teaching corpus is small — always run fuzzy + concept-gated merge.
        teaching_canon = canonicalise(teaching_rows, fuzzy_threshold=92.0)
        # Bank-scale signals: exact-hash clusters only (fuzzy O(n²) too costly).
        signal_canon = (
            canonicalise(signal_rows, fuzzy_threshold=100.5)
            if signal_rows
            else CanonicalisationResult()
        )

        canon_result = CanonicalisationResult(
            questions=list(teaching_canon.questions) + list(signal_canon.questions),
            variants=list(teaching_canon.variants) + list(signal_canon.variants),
            occurrences=list(teaching_canon.occurrences) + list(signal_canon.occurrences),
            merge_audits=list(teaching_canon.merge_audits) + list(signal_canon.merge_audits),
        )

        teaching_qs = list(teaching_canon.questions)
        teaching_vars = list(teaching_canon.variants)
        # Join cost is O(signals × teaching); teaching stays small so fuzzy is fine.
        joined_occs, join_audits = join_firm_signals(
            teaching_qs,
            teaching_vars,
            signal_rows,
            fuzzy_threshold=88.0,
        )
        canon_result.occurrences.extend(joined_occs)
        canon_result.merge_audits.extend(join_audits)

        existing_cq = {
            row["normalised_hash"]: row["id"]
            for row in store.fetch_all(cq_table)
            if row.get("normalised_hash")
        }
        id_remap: dict[str, str] = {}
        for cq in canon_result.questions:
            if cq.normalised_hash and cq.normalised_hash in existing_cq:
                prior = existing_cq[cq.normalised_hash]
                if prior != cq.id:
                    id_remap[cq.id] = prior
                    cq.id = prior
        if id_remap:
            for v in canon_result.variants:
                v.canonical_question_id = id_remap.get(
                    v.canonical_question_id, v.canonical_question_id
                )

        existing_variant_hashes = {
            row["normalised_hash"] for row in store.fetch_all(qv_table) if row.get("normalised_hash")
        }

        for cq in canon_result.questions:
            store.upsert_dict(
                cq_table,
                {
                    "id": cq.id,
                    "canonical_wording": cq.canonical_wording,
                    "question_type": cq.question_type,
                    "topic": cq.topic,
                    "subtopic": cq.subtopic,
                    "domain": cq.domain.value,
                    "pe_strategy": cq.pe_strategy,
                    "pe_relevance": cq.pe_relevance.value if cq.pe_relevance else None,
                    "seniority": cq.seniority,
                    "difficulty": cq.difficulty,
                    "review_state": cq.review_state,
                    "normalised_hash": cq.normalised_hash,
                },
            )
        for v in canon_result.variants:
            if v.normalised_hash in existing_variant_hashes:
                continue
            store.insert_ignore(
                qv_table,
                {
                    "id": v.id,
                    "canonical_question_id": v.canonical_question_id,
                    "source_wording": v.source_wording,
                    "cleaned_wording": v.cleaned_wording,
                    "normalised_hash": v.normalised_hash,
                    "language": v.language,
                    "variant_type": v.variant_type,
                    "source_artefact_id": v.source_artefact_id,
                },
            )
        for occ in canon_result.occurrences:
            store.insert_ignore(
                occ_table,
                {
                    "id": occ.id,
                    "question_variant_id": occ.question_variant_id,
                    "interview_review_id": occ.interview_review_id,
                    "employer": occ.employer,
                    "employer_id": occ.employer_id,
                    "role": occ.role,
                    "office": occ.office,
                    "round": occ.round,
                    "interview_date": occ.interview_date,
                    "recruiting_cycle": occ.recruiting_cycle,
                    "outcome": occ.outcome,
                    "source_id": occ.source_id,
                    "confidence": occ.confidence,
                    "detail_url": occ.detail_url,
                },
            )
        for audit in canon_result.merge_audits:
            store.insert_ignore(
                merge_table,
                {
                    "id": audit.get("id") or audit.get("merge_id") or f"merge_{len(canon_result.merge_audits)}",
                    "survivor_id": id_remap.get(audit["survivor_id"], audit["survivor_id"]),
                    "merged_id": id_remap.get(audit["merged_id"], audit["merged_id"]),
                    "reason": audit.get("reason"),
                    "reversible": 1 if audit.get("reversible", True) else 0,
                    "payload_json": store.dumps(audit.get("payload") or audit),
                },
            )
        publishable, withheld = filter_publishable_questions(canon_result.questions)
        teaching_merge_n = sum(
            1
            for a in teaching_canon.merge_audits
            if a.get("reason") in {"exact_hash", "fuzzy_match"}
        )
        dup_rate = 0.0
        if teaching_vars:
            dup_rate = 1.0 - (len(teaching_qs) / max(1, len(teaching_vars)))
        return {
            "input_count": len(all_extracted),
            "output_count": len(canon_result.questions),
            "metrics": {
                "canonical_questions": len(canon_result.questions),
                "publishable_teaching_questions": len(publishable),
                "withheld_signal_or_placeholder": len(withheld),
                "firm_signal_joins": len(joined_occs),
                "teaching_merge_audits": teaching_merge_n,
                "teaching_fuzzy_enabled": True,
                "duplicate_rate": round(dup_rate, 4),
            },
        }

    canon_payload = do_canonicalise()
    _record(
        "canonicalise_questions",
        "canonicalise:v2",
        canon_payload,
        parser_or_model_version=PARSER_VERSION,
    )
    assert canon_result is not None

    teaching_for_graph = [q for q in canon_result.questions if q.review_state != "topic_signal"]
    relationships = (
        build_relationship_graph(teaching_for_graph)
        if len(teaching_for_graph) <= 500
        else []
    )

    # --- answers (teaching questions only) ---
    filled_answers: list[Answer] = []

    def do_answers() -> dict[str, Any]:
        nonlocal filled_answers
        publishable_qs, _withheld_qs = filter_publishable_questions(canon_result.questions)
        corpus_answers = _answers_from_extracted(
            publishable_qs, canon_result.variants, teaching_extracted
        )
        mapped_responses: list[QuestionResponse] = []
        qtn_to_cq: dict[str, str] = {}
        for occ in canon_result.occurrences:
            if occ.detail_url and "QTN_" in occ.detail_url:
                import re

                m = re.search(r"QTN_\d+", occ.detail_url)
                if m:
                    qtn_to_cq[m.group(0)] = next(
                        (
                            vv.canonical_question_id
                            for vv in canon_result.variants
                            if vv.id == occ.question_variant_id
                        ),
                        "",
                    )
        for resp in all_responses:
            if is_interview_process_placeholder(resp.exact_source_text):
                rejected.append(
                    {
                        "reason": "interview_process_placeholder_response",
                        "text_preview": resp.exact_source_text[:160],
                    }
                )
                continue
            cq_id = qtn_to_cq.get(resp.question_id, resp.question_id)
            mapped = resp.model_copy(update={"question_id": cq_id})
            mapped_responses.append(mapped)
            store.insert_ignore(
                resp_table,
                {
                    "id": mapped.id,
                    "question_id": mapped.question_id,
                    "source_response_id": mapped.source_response_id,
                    "response_type": mapped.response_type.value,
                    "exact_source_text": mapped.exact_source_text,
                    "source_provided": 1 if mapped.source_provided else 0,
                    "posted_date": mapped.posted_date,
                    "helpful_metadata_json": store.dumps(mapped.helpful_metadata),
                    "classification_confidence": mapped.classification_confidence,
                    "parent_response_id": mapped.parent_response_id,
                    "source_url": mapped.source_url,
                    "access_state": mapped.access_state.value,
                    "source_artefact_id": mapped.source_artefact_id,
                },
            )

        filled_answers = fill_answers(
            publishable_qs,
            existing_answers=corpus_answers,
            source_responses=mapped_responses,
            corpus_answers=corpus_answers,
            max_generate=150 if len(publishable_qs) > 500 else None,
        )
        filled_answers, withheld_ans = filter_publishable_answers(
            filled_answers, [q.id for q in publishable_qs]
        )
        for wa in withheld_ans:
            rejected.append(
                {
                    "reason": "answer_withheld_publish_gate",
                    **wa.model_dump(mode="json"),
                }
            )
        existing_ans = {
            row["canonical_question_id"]: row["id"]
            for row in store.fetch_all(answers_table)
        }
        source_n = matched_n = gen_n = val_n = rej_n = 0
        for ans in filled_answers:
            if ans.canonical_question_id in existing_ans:
                ans.id = existing_ans[ans.canonical_question_id]
            if ans.provenance_type == AnswerProvenance.SOURCE_PROVIDED:
                source_n += 1
            elif ans.provenance_type == AnswerProvenance.CORPUS_MATCHED:
                matched_n += 1
            elif ans.provenance_type in {
                AnswerProvenance.SYNTHESISED_UNVALIDATED,
                AnswerProvenance.SYNTHESISED_VALIDATED,
                AnswerProvenance.NEEDS_REVIEW,
            }:
                gen_n += 1
            if ans.provenance_type == AnswerProvenance.REJECTED:
                rej_n += 1
                rejected.append(ans.model_dump(mode="json"))
            if ans.validation_status in {
                ValidationStatus.PASS,
                ValidationStatus.PASS_WITH_ASSUMPTIONS,
            }:
                val_n += 1
            if ans.provenance_type == AnswerProvenance.SYNTHESISED_VALIDATED:
                val_n += 1
            store.upsert_dict(
                answers_table,
                {
                    "id": ans.id,
                    "canonical_question_id": ans.canonical_question_id,
                    "concise_answer": ans.concise_answer,
                    "expanded_explanation": ans.expanded_explanation,
                    "assumptions_json": store.dumps(ans.assumptions),
                    "calculation_representation_json": store.dumps(ans.calculation_representation),
                    "common_mistakes_json": store.dumps(ans.common_mistakes),
                    "follow_ups_json": store.dumps(ans.follow_ups),
                    "provenance_type": ans.provenance_type.value,
                    "source_ids_json": store.dumps(ans.source_ids),
                    "generator_version": ans.generator_version or GENERATOR_VERSION,
                    "validator_version": ans.validator_version or VALIDATOR_VERSION,
                    "validation_status": ans.validation_status.value,
                    "confidence": ans.confidence,
                    "difficulty": ans.difficulty,
                    "references_json": store.dumps(ans.references),
                },
            )
        return {
            "input_count": len(publishable_qs),
            "output_count": len(filled_answers),
            "metrics": {
                "source_answers": source_n,
                "matched_answers": matched_n,
                "generated_answers": gen_n,
                "validated_answers": val_n,
                "rejected_answers": rej_n,
            },
        }

    answers_payload = do_answers()
    _record(
        "generate_missing_answers",
        "answers:fill+validate:v2",
        answers_payload,
        parser_or_model_version=f"{GENERATOR_VERSION}/{VALIDATOR_VERSION}",
    )

    # --- PE coverage report ---
    pe_records = []
    for cq in canon_result.questions:
        if cq.review_state == "topic_signal":
            continue
        pe_records.append(
            {
                "role": cq.seniority or "",
                "title": cq.canonical_wording,
                "pe_relevance": cq.pe_relevance.value if cq.pe_relevance else "not_pe",
                "strategy": cq.pe_strategy,
                "employer": None,
                "search_phrase": "pipeline",
                "geography": None,
                "year": None,
            }
        )
    coverage = compute_coverage(pe_records)
    write_coverage_report(pe_records, path=reports_dir / "pe-coverage-report.md")

    # --- export (publish gate applied inside export_all) ---
    def do_export() -> dict[str, Any]:
        summary = export_all(
            exports_dir=exports_dir,
            reports_dir=reports_dir,
            questions=canon_result.questions,
            variants=canon_result.variants,
            occurrences=canon_result.occurrences,
            responses=all_responses,
            answers=filled_answers,
            rejected=rejected + placeholder_rejects,
            metrics=metrics.snapshot(),
            job_results=job_results,
            relationships=relationships,
            coverage=coverage,
            alerts=metrics.alerts,
        )
        return {
            "input_count": len(canon_result.questions),
            "output_count": summary.get("export_files", 0),
            "metrics": summary,
        }

    export_payload = do_export()
    _record("export_dataset", "export:v2", export_payload)

    # Idempotency demo: second extract job key skips without re-writing
    jr2 = runner.run(
        "extract_records",
        "extract:glassdoor-fixtures:v1",
        lambda: extract_payload,
        force=False,
    )
    job_results.append(jr2.model_dump(mode="json"))

    snap = metrics.snapshot()
    return {
        "db_path": str(db_path),
        "metrics": snap,
        "canonical_questions": len(canon_result.questions),
        "answers": len(filled_answers),
        "jobs": job_results,
        "alerts": metrics.alerts,
    }
