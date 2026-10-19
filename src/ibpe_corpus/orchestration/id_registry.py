"""Stable ids across pipeline runs.

Canonical / answer ids are random (``cq_<uuid>``); ``publish-teaching.ts``
upserts by id, so a fresh run must reuse the ids already published or Neon
would accumulate duplicates. Prior exports are the registry: before the new
export overwrites them, map each prior wording's normalised hash (computed
with the current normaliser, so ``Question N:`` prefixes are ignored) to its
id, and reuse it for the matching new canonical. Compound wordings that used
to be split fall back to their first segment's hash.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from ibpe_corpus.canonical.canonicalise import split_multi_questions
from ibpe_corpus.canonical.normalise import normalised_hash
from ibpe_corpus.schemas.models import CanonicalQuestion, QuestionVariant


@dataclass
class PriorIds:
    question_ids: dict[str, str] = field(default_factory=dict)
    answer_ids: dict[str, str] = field(default_factory=dict)

    def __bool__(self) -> bool:
        return bool(self.question_ids or self.answer_ids)


def _read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def load_prior_ids(exports_dir: Path | str) -> PriorIds:
    exports_dir = Path(exports_dir)
    prior = PriorIds()
    for name in ("questions.jsonl", "firm_signals.jsonl"):
        for row in _read_jsonl(exports_dir / name):
            wording = row.get("canonical_wording")
            qid = row.get("id")
            if wording and qid:
                prior.question_ids.setdefault(normalised_hash(wording), qid)
    for row in _read_jsonl(exports_dir / "answers.jsonl"):
        if row.get("canonical_question_id") and row.get("id"):
            prior.answer_ids.setdefault(row["canonical_question_id"], row["id"])
    return prior


def assign_stable_ids(
    questions: Sequence[CanonicalQuestion],
    variants: Sequence[QuestionVariant],
    prior: PriorIds,
) -> dict[str, str]:
    """Rewrite question ids (and variant links) in place; return ``{old: new}``."""
    if not prior.question_ids:
        return {}
    remap: dict[str, str] = {}
    used: set[str] = set()
    current_ids = {q.id for q in questions}
    for q in questions:
        keys = [q.normalised_hash or normalised_hash(q.canonical_wording)]
        segments = split_multi_questions(q.canonical_wording)
        if len(segments) > 1:
            keys.append(normalised_hash(segments[0][0]))
        for key in keys:
            pid = prior.question_ids.get(key)
            if not pid or pid in used or (pid in current_ids and pid != q.id):
                continue
            used.add(pid)
            if pid != q.id:
                remap[q.id] = pid
                q.id = pid
            break
    if remap:
        for v in variants:
            v.canonical_question_id = remap.get(v.canonical_question_id, v.canonical_question_id)
    return remap
