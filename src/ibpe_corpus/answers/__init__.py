"""Answer acquisition, generation, matching, and validation."""

from ibpe_corpus.answers.classify_response import classify_response
from ibpe_corpus.answers.generate import generate_answer
from ibpe_corpus.answers.ingest_source import (
    ingest_extracted_record,
    ingest_question_response,
)
from ibpe_corpus.answers.match_corpus import (
    ANSWER_REUSE_FUZZ_THRESHOLD,
    find_corpus_match,
)
from ibpe_corpus.answers.pipeline import fill_answers
from ibpe_corpus.answers.validate import validate_answer

__all__ = [
    "ANSWER_REUSE_FUZZ_THRESHOLD",
    "classify_response",
    "fill_answers",
    "find_corpus_match",
    "generate_answer",
    "ingest_extracted_record",
    "ingest_question_response",
    "validate_answer",
]
