"""Question canonicalisation, deduplication, and relationship graphs."""

from ibpe_corpus.canonical.canonicalise import (
    CanonicalisationResult,
    canonicalise,
    reverse_merge,
    same_answer_would_satisfy,
    split_multi_questions,
)
from ibpe_corpus.canonical.embeddings import (
    cosine_similarity,
    hashing_embed,
    nearest_neighbours,
)
from ibpe_corpus.canonical.families import (
    QuestionRelationship,
    RelationshipType,
    build_relationship_graph,
)
from ibpe_corpus.canonical.normalise import (
    clean_whitespace,
    normalise_for_hash,
    normalised_hash,
    strip_punctuation_light,
)

__all__ = [
    "CanonicalisationResult",
    "QuestionRelationship",
    "RelationshipType",
    "build_relationship_graph",
    "canonicalise",
    "clean_whitespace",
    "cosine_similarity",
    "hashing_embed",
    "nearest_neighbours",
    "normalise_for_hash",
    "normalised_hash",
    "reverse_merge",
    "same_answer_would_satisfy",
    "split_multi_questions",
    "strip_punctuation_light",
]
