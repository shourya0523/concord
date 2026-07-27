"""Load private equity taxonomy and target matrix configs."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TAXONOMY_PATH = REPO_ROOT / "config" / "private_equity_taxonomy.yml"
DEFAULT_MATRIX_PATH = REPO_ROOT / "config" / "pe_target_matrix.yml"


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping at root of {path}, got {type(data)!r}")
    return data


@lru_cache(maxsize=4)
def load_taxonomy(path: str | None = None) -> dict[str, Any]:
    """Load and cache the PE taxonomy YAML."""
    return _load_yaml(Path(path) if path else DEFAULT_TAXONOMY_PATH)


@lru_cache(maxsize=4)
def load_target_matrix(path: str | None = None) -> dict[str, Any]:
    """Load and cache the PE target matrix YAML."""
    return _load_yaml(Path(path) if path else DEFAULT_MATRIX_PATH)


def clear_caches() -> None:
    """Clear cached YAML loads (useful in tests)."""
    load_taxonomy.cache_clear()
    load_target_matrix.cache_clear()


def core_role_aliases(taxonomy: dict[str, Any] | None = None) -> list[str]:
    tax = taxonomy or load_taxonomy()
    aliases: list[str] = []
    for role in tax.get("core_investing_roles", []):
        aliases.extend(role.get("aliases") or [])
        if label := role.get("label"):
            aliases.append(label)
    return list(dict.fromkeys(aliases))


def strategy_search_modifiers(taxonomy: dict[str, Any] | None = None) -> list[str]:
    tax = taxonomy or load_taxonomy()
    modifiers: list[str] = []
    for strategy in tax.get("strategy_roles", []):
        modifiers.extend(strategy.get("search_modifiers") or [])
        modifiers.extend(strategy.get("aliases") or [])
    return list(dict.fromkeys(modifiers))


def concept_query_phrases(taxonomy: dict[str, Any] | None = None) -> list[str]:
    tax = taxonomy or load_taxonomy()
    return [
        q["phrase"]
        for q in tax.get("concept_queries", [])
        if isinstance(q, dict) and q.get("phrase")
    ]


def employer_names(matrix: dict[str, Any] | None = None) -> list[str]:
    mat = matrix or load_target_matrix()
    return [
        e["name"]
        for e in mat.get("employers", [])
        if isinstance(e, dict) and e.get("name")
    ]
