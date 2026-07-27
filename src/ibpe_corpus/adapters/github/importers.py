"""Importers for GitHub-hosted IB/PE corpora."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ibpe_corpus.adapters.github.fetch_repo import PARSER_VERSION, SOURCE_FAMILY, content_hash_file
from ibpe_corpus.schemas.models import (
    AccessState,
    ExtractionClass,
    ExtractedRecord,
    RawArtefact,
    SourceAdapterResult,
)

# Never claim live Glassdoor provenance from these importers.
GITHUB_PROVENANCE = {
    "provenance": "source_provided",
    "source_family": SOURCE_FAMILY,
    "not_glassdoor": True,
}


def _artefact_from_path(
    path: Path,
    *,
    commit_sha: str | None = None,
    repo: str | None = None,
    source_url: str | None = None,
) -> RawArtefact:
    digest = content_hash_file(path)
    suffix = path.suffix.lower()
    return RawArtefact(
        source_family=SOURCE_FAMILY,
        url_or_path=source_url or str(path),
        commit_sha=commit_sha,
        raw_json_path=str(path) if suffix == ".json" else None,
        raw_html_path=str(path) if suffix != ".json" else None,
        content_hash=digest,
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        session_class="unauthenticated",
        metadata={
            "repo": repo,
            "staging_path": str(path),
            **GITHUB_PROVENANCE,
        },
    )


def _pair_key(category: str, qid: str) -> str:
    raw = f"{category}:{qid}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def import_firebase_qb_export(
    path: Path | str,
    *,
    artefact: RawArtefact | None = None,
    commit_sha: str | None = None,
    repo: str | None = None,
) -> SourceAdapterResult:
    """Import Capital-Markets-style Firebase export JSON.

    Shape: ``{ category: { id: { question, answer } } }``.
    """
    path = Path(path)
    art = artefact or _artefact_from_path(path, commit_sha=commit_sha, repo=repo)
    payload = json.loads(path.read_text(encoding="utf-8"))
    extracted: list[ExtractedRecord] = []
    question_count = 0
    answer_count = 0

    if not isinstance(payload, dict):
        return SourceAdapterResult(
            artefacts=[art],
            access_state=AccessState.PUBLIC,
            diagnostics=["firebase export root is not an object"],
            metrics={"exact_questions": 0, "source_answers": 0},
        )

    for category, items in payload.items():
        if not isinstance(items, dict):
            continue
        for qid, record in items.items():
            if not isinstance(record, dict):
                continue
            question = (record.get("question") or "").strip()
            answer = (record.get("answer") or "").strip()
            if not question:
                continue

            # Strip common "Question N:" prefixes for cleaner exact text retention
            # but keep exact_source_text faithful to source.
            pair_id = _pair_key(str(category), str(qid))
            q_meta: dict[str, Any] = {
                "category": category,
                "source_question_id": str(qid),
                "pair_id": pair_id,
                "importer": "firebase_qb_export",
                "has_source_answer": bool(answer),
                **GITHUB_PROVENANCE,
            }
            q_rec = ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=question,
                source_selector_or_span=f"{category}/{qid}/question",
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="firebase_qb_export",
                extracted_metadata=q_meta,
                grounding_confidence=1.0,
            )
            extracted.append(q_rec)
            question_count += 1

            if answer:
                a_rec = ExtractedRecord(
                    source_artefact_id=art.id,
                    exact_source_text=answer,
                    source_selector_or_span=f"{category}/{qid}/answer",
                    record_type=ExtractionClass.SOURCE_PROVIDED_ANSWER,
                    extraction_method="firebase_qb_export",
                    extracted_metadata={
                        "category": category,
                        "source_question_id": str(qid),
                        "pair_id": pair_id,
                        "question_record_id": q_rec.id,
                        "answer_provenance": "source_provided",
                        "importer": "firebase_qb_export",
                        **GITHUB_PROVENANCE,
                    },
                    grounding_confidence=1.0,
                )
                q_rec.extracted_metadata["answer_record_id"] = a_rec.id
                extracted.append(a_rec)
                answer_count += 1

    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=[f"imported firebase qb export from {path}"],
        metrics={
            "exact_questions": question_count,
            "source_answers": answer_count,
            "categories": len([k for k, v in payload.items() if isinstance(v, dict)]),
        },
    )


_NUMBERED_Q_RE = re.compile(
    r"^\s*(\d+)\.\s+(?P<text>.+?)\s*$",
    re.MULTILINE,
)
_LINK_ONLY_RE = re.compile(r"^\[.+\]\(.+\)$")


def import_markdown_questions(
    path: Path | str,
    *,
    artefact: RawArtefact | None = None,
    commit_sha: str | None = None,
    repo: str | None = None,
) -> SourceAdapterResult:
    """Import HireAbo-style numbered Markdown question lists (questions only)."""
    path = Path(path)
    art = artefact or _artefact_from_path(path, commit_sha=commit_sha, repo=repo)
    text = path.read_text(encoding="utf-8")
    extracted: list[ExtractedRecord] = []

    for match in _NUMBERED_Q_RE.finditer(text):
        qtext = match.group("text").strip()
        if not qtext or _LINK_ONLY_RE.match(qtext):
            continue
        if "CLICK HERE" in qtext.upper():
            continue
        num = match.group(1)
        extracted.append(
            ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=qtext,
                source_selector_or_span=f"numbered:{num}",
                record_type=ExtractionClass.EXACT_QUESTION,
                extraction_method="markdown_numbered_list",
                extracted_metadata={
                    "list_index": int(num),
                    "source_file": path.name,
                    "importer": "markdown_questions",
                    "has_source_answer": False,
                    **GITHUB_PROVENANCE,
                },
                grounding_confidence=0.9,
            )
        )

    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=[f"imported {len(extracted)} markdown questions from {path}"],
        metrics={"exact_questions": len(extracted), "source_answers": 0},
    )


_CATEGORY_ARRAY_RE = re.compile(
    r"const\s+(?P<name>[A-Z_][A-Z0-9_]*)\s*=\s*\[(?P<body>.*?)\];",
    re.DOTALL,
)
_ADD_QUESTION_CALL_RE = re.compile(
    r"(?<!function\s)addQuestion\s*\(",
)
_STRING_RE = re.compile(
    r'"(?:\\.|[^"\\])*"' r"|" r"'(?:\\.|[^'\\])*'",
)


def _parse_js_string(token: str) -> str:
    # Strip quotes and unescape common sequences.
    body = token[1:-1]
    return (
        body.replace(r"\\", "\\")
        .replace(r"\"", '"')
        .replace(r"\'", "'")
        .replace(r"\n", "\n")
        .replace(r"\t", "\t")
    )


def _load_category_arrays(html: str) -> dict[str, list[str]]:
    arrays: dict[str, list[str]] = {}
    for match in _CATEGORY_ARRAY_RE.finditer(html):
        name = match.group("name")
        if "CATEGOR" not in name:
            continue
        strings = [_parse_js_string(s) for s in _STRING_RE.findall(match.group("body"))]
        arrays[name] = strings
    return arrays


def _split_add_question_args(arg_src: str) -> list[str]:
    """Split top-level JS call arguments; return raw argument snippets."""
    args: list[str] = []
    buf: list[str] = []
    depth = 0
    in_str: str | None = None
    escape = False
    i = 0
    while i < len(arg_src):
        ch = arg_src[i]
        if in_str:
            buf.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in {'"', "'"}:
            in_str = ch
            buf.append(ch)
            i += 1
            continue
        if ch == "(":
            depth += 1
            buf.append(ch)
            i += 1
            continue
        if ch == ")":
            depth -= 1
            buf.append(ch)
            i += 1
            continue
        if ch == "," and depth == 0:
            args.append("".join(buf).strip())
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        args.append("".join(buf).strip())
    return args


def _resolve_arg(raw: str, arrays: dict[str, list[str]]) -> str | None:
    raw = raw.strip().rstrip(",")
    if not raw:
        return None
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        return _parse_js_string(raw)
    m = re.fullmatch(r"([A-Z_][A-Z0-9_]*)\[(\d+)\]", raw)
    if m:
        name, idx_s = m.group(1), m.group(2)
        arr = arrays.get(name) or []
        idx = int(idx_s)
        if 0 <= idx < len(arr):
            return arr[idx]
        return f"{name}[{idx}]"
    return raw


def import_html_playbook(
    path: Path | str,
    *,
    artefact: RawArtefact | None = None,
    commit_sha: str | None = None,
    repo: str | None = None,
) -> SourceAdapterResult:
    """Extract ``addQuestion(...)`` records from coryjburk-style HTML playbooks.

    If the embedded JS shape is unrecognised, returns zero records and a
    diagnostic rather than inventing content.
    """
    path = Path(path)
    art = artefact or _artefact_from_path(path, commit_sha=commit_sha, repo=repo)
    html = path.read_text(encoding="utf-8")
    arrays = _load_category_arrays(html)
    extracted: list[ExtractedRecord] = []
    diagnostics: list[str] = []

    # Walk addQuestion( calls; skip the function definition.
    for match in _ADD_QUESTION_CALL_RE.finditer(html):
        start = match.end()
        # Skip if this is the definition signature (followed by param names without quotes).
        peek = html[start : start + 40]
        if peek.lstrip().startswith("track,"):
            continue

        # Find matching closing paren for the call.
        depth = 1
        in_str: str | None = None
        escape = False
        i = start
        while i < len(html) and depth > 0:
            ch = html[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == in_str:
                    in_str = None
            else:
                if ch in {'"', "'"}:
                    in_str = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
            i += 1
        if depth != 0:
            continue
        arg_src = html[start : i - 1]
        args = _split_add_question_args(arg_src)
        if len(args) < 7:
            continue

        resolved = [_resolve_arg(a, arrays) for a in args]
        track = resolved[0] or ""
        category = resolved[1] or ""
        difficulty = resolved[2] or ""
        question = resolved[3] or ""
        competency = resolved[4] or ""
        intent = resolved[5] or ""
        answer = resolved[6] or ""
        deep = resolved[7] if len(resolved) > 7 else ""
        coaching = resolved[8] if len(resolved) > 8 else ""
        redflag = resolved[9] if len(resolved) > 9 else ""

        if not question:
            continue

        pair_id = hashlib.sha256(f"{track}:{category}:{question}".encode()).hexdigest()[:16]
        q_rec = ExtractedRecord(
            source_artefact_id=art.id,
            exact_source_text=question,
            source_selector_or_span=f"addQuestion:{pair_id}",
            record_type=ExtractionClass.EXACT_QUESTION,
            extraction_method="html_playbook_addQuestion",
            extracted_metadata={
                "track": track,
                "category": category,
                "difficulty": difficulty,
                "competency": competency,
                "recruiter_intent": intent,
                "pair_id": pair_id,
                "importer": "html_playbook",
                "has_source_answer": bool(answer),
                **GITHUB_PROVENANCE,
            },
            grounding_confidence=0.95,
        )
        extracted.append(q_rec)

        if answer:
            a_rec = ExtractedRecord(
                source_artefact_id=art.id,
                exact_source_text=answer,
                source_selector_or_span=f"addQuestion:{pair_id}:answer",
                record_type=ExtractionClass.SOURCE_PROVIDED_ANSWER,
                extraction_method="html_playbook_addQuestion",
                extracted_metadata={
                    "track": track,
                    "category": category,
                    "difficulty": difficulty,
                    "pair_id": pair_id,
                    "question_record_id": q_rec.id,
                    "answer_provenance": "source_provided",
                    "deepdive": deep,
                    "coaching": coaching,
                    "red_flag": redflag,
                    "importer": "html_playbook",
                    **GITHUB_PROVENANCE,
                },
                grounding_confidence=0.95,
            )
            q_rec.extracted_metadata["answer_record_id"] = a_rec.id
            extracted.append(a_rec)

    q_count = sum(1 for r in extracted if r.record_type == ExtractionClass.EXACT_QUESTION)
    a_count = sum(1 for r in extracted if r.record_type == ExtractionClass.SOURCE_PROVIDED_ANSWER)
    if q_count == 0:
        diagnostics.append(
            "html_playbook: no addQuestion records extracted; "
            "format may be unsupported — skipped without inventing content"
        )
    else:
        diagnostics.append(f"imported html playbook from {path}: {q_count} questions")

    return SourceAdapterResult(
        artefacts=[art],
        extracted=extracted,
        access_state=AccessState.PUBLIC,
        diagnostics=diagnostics,
        metrics={"exact_questions": q_count, "source_answers": a_count},
    )


def import_by_format(
    path: Path | str,
    format_name: str,
    *,
    artefact: RawArtefact | None = None,
    commit_sha: str | None = None,
    repo: str | None = None,
) -> SourceAdapterResult:
    """Dispatch to an importer based on ``github_sources.yml`` format field."""
    path = Path(path)
    fmt = (format_name or "").lower()
    if fmt in {"firebase_export_json", "firebase_qb_export"}:
        return import_firebase_qb_export(path, artefact=artefact, commit_sha=commit_sha, repo=repo)
    if fmt in {"markdown_numbered_question_lists", "markdown_questions"}:
        return import_markdown_questions(path, artefact=artefact, commit_sha=commit_sha, repo=repo)
    if fmt in {"single_file_html_js_structured_questions", "html_playbook"}:
        return import_html_playbook(path, artefact=artefact, commit_sha=commit_sha, repo=repo)
    return SourceAdapterResult(
        artefacts=[artefact] if artefact else [],
        access_state=AccessState.PUBLIC,
        diagnostics=[f"no importer for format={format_name!r} path={path}"],
        metrics={"exact_questions": 0, "source_answers": 0},
    )
