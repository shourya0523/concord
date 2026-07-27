"""Generate bounded Glassdoor occupation search phrases from the PE taxonomy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from ibpe_corpus.pe.taxonomy import (
    concept_query_phrases,
    core_role_aliases,
    load_taxonomy,
    strategy_search_modifiers,
)

# Hard caps keep occupation search expansions manageable for collection runs.
DEFAULT_MAX_PHRASES = 120
DEFAULT_MAX_STRATEGY_COMBOS = 40
DEFAULT_MAX_CONCEPT_QUERIES = 20


@dataclass(frozen=True)
class SearchPhrase:
    phrase: str
    source: str  # role_alias | strategy_combo | concept
    normalised_role: str | None = None
    strategy: str | None = None


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def _dedupe(phrases: Iterable[SearchPhrase]) -> list[SearchPhrase]:
    seen: set[str] = set()
    out: list[SearchPhrase] = []
    for item in phrases:
        key = _norm(item.phrase)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _role_alias_phrases(taxonomy: dict[str, Any]) -> list[SearchPhrase]:
    items: list[SearchPhrase] = []
    for role in taxonomy.get("core_investing_roles", []):
        aliases = list(role.get("aliases") or [])
        if label := role.get("label"):
            aliases.insert(0, label)
        for alias in aliases:
            items.append(
                SearchPhrase(
                    phrase=alias.strip(),
                    source="role_alias",
                    normalised_role=role.get("id"),
                )
            )
    return items


def _strategy_combo_phrases(
    taxonomy: dict[str, Any],
    *,
    max_combos: int,
) -> list[SearchPhrase]:
    """Combine a small set of core role stems with strategy modifiers."""
    role_stems = [
        "Private Equity Associate",
        "Private Equity Analyst",
        "Investment Associate",
        "Investment Analyst",
    ]
    strategies = taxonomy.get("strategy_roles", [])
    items: list[SearchPhrase] = []
    for strategy in strategies:
        modifiers = strategy.get("search_modifiers") or strategy.get("aliases") or []
        for modifier in modifiers:
            for stem in role_stems:
                # Prefer "Growth Equity Associate" style over long concatenations.
                if "Associate" in stem:
                    phrase = f"{modifier} Associate"
                elif "Analyst" in stem:
                    phrase = f"{modifier} Analyst"
                else:
                    phrase = f"{modifier} {stem}"
                items.append(
                    SearchPhrase(
                        phrase=phrase,
                        source="strategy_combo",
                        normalised_role=stem.lower().replace(" ", "_"),
                        strategy=strategy.get("id"),
                    )
                )
                if len(items) >= max_combos:
                    return items
    return items


def _concept_phrases(
    taxonomy: dict[str, Any],
    *,
    max_concepts: int,
) -> list[SearchPhrase]:
    items: list[SearchPhrase] = []
    for query in taxonomy.get("concept_queries", [])[:max_concepts]:
        phrase = (query or {}).get("phrase")
        if not phrase:
            continue
        items.append(
            SearchPhrase(
                phrase=phrase.strip(),
                source="concept",
                normalised_role=query.get("id"),
            )
        )
    return items


def generate_occupation_search_phrases(
    taxonomy: dict[str, Any] | None = None,
    *,
    max_phrases: int = DEFAULT_MAX_PHRASES,
    max_strategy_combos: int = DEFAULT_MAX_STRATEGY_COMBOS,
    max_concept_queries: int = DEFAULT_MAX_CONCEPT_QUERIES,
    include_concepts: bool = True,
) -> list[SearchPhrase]:
    """
    Build Glassdoor occupation search phrases from taxonomy role aliases,
    strategy combinations, and optional concept queries.

    Expansions are bounded by ``max_phrases`` / combo / concept caps.
    """
    tax = taxonomy or load_taxonomy()
    phrases = _role_alias_phrases(tax)
    phrases.extend(_strategy_combo_phrases(tax, max_combos=max_strategy_combos))
    if include_concepts:
        phrases.extend(_concept_phrases(tax, max_concepts=max_concept_queries))

    deduped = _dedupe(phrases)
    return deduped[:max_phrases]


def phrase_strings(
    taxonomy: dict[str, Any] | None = None,
    **kwargs: Any,
) -> list[str]:
    """Convenience: return only phrase text."""
    return [p.phrase for p in generate_occupation_search_phrases(taxonomy, **kwargs)]


def estimate_expansion_size(taxonomy: dict[str, Any] | None = None) -> dict[str, int]:
    """Diagnostics for how large an unbounded expansion would be."""
    tax = taxonomy or load_taxonomy()
    return {
        "role_aliases": len(core_role_aliases(tax)),
        "strategy_modifiers": len(strategy_search_modifiers(tax)),
        "concept_queries": len(concept_query_phrases(tax)),
        "bounded_phrases": len(generate_occupation_search_phrases(tax)),
    }
