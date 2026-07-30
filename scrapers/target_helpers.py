"""Target helpers: search aliases and position filter fallbacks."""

from __future__ import annotations

from typing import Optional

# When Glassdoor jobTitleFTS is too exact, try these in order ("" = unfiltered).
_TRACK_FALLBACKS: dict[str, list[str]] = {
    "PE": [
        "Private Equity",
        "Growth Equity",
        "Summer Analyst",
        "Analyst",
        "Associate",
        "Investment Analyst",
        "",
    ],
    "VC": [
        "Venture Capital",
        "Venture",
        "Growth Equity",
        "Summer Analyst",
        "Analyst",
        "Associate",
        "Investment Analyst",
        "",
    ],
    "IB": [
        "Investment Banking",
        "Summer Analyst",
        "Analyst",
        "Associate",
        "",
    ],
    "Banking": [
        "Investment Banking",
        "Summer Analyst",
        "Analyst",
        "Associate",
        "",
    ],
}

# Prefer these phrases in company search results (finance firms).
FINANCE_BOOST_TERMS = (
    "global management",
    "capital",
    "partners",
    "ventures",
    "venture",
    "equity",
    "securities",
    "investment",
    "asset management",
    "j.p. morgan",
    "jp morgan",
    "chase",
)

# Penalize common false-positive employers for short finance queries.
FINANCE_PENALTY_TERMS = (
    "education",
    "university",
    "school",
    "therapy",
    "physical therapy",
    "hospital",
    "clinic",
    "restaurant",
    "hotels",
    "retail",
)


def search_keyword(target_or_job: dict) -> str:
    """Glassdoor search keyword: prefer search_as / first alias over display name."""
    search_as = (target_or_job.get("search_as") or "").strip()
    if search_as:
        return search_as
    aliases = target_or_job.get("aliases") or []
    if isinstance(aliases, list) and aliases:
        first = str(aliases[0]).strip()
        if first:
            return first
    return (target_or_job.get("company") or "").strip()


def position_filter_candidates(
    position: str, track: str = "", extra: Optional[list[str]] = None
) -> list[str]:
    """Ordered jobTitleFTS attempts; empty string means no title filter."""
    seen: set[str] = set()
    out: list[str] = []

    def add(value: str) -> None:
        key = value.strip().lower()
        if key in seen:
            return
        # Allow one empty filter at end
        if value.strip() == "":
            if "" in seen:
                return
            seen.add("")
            out.append("")
            return
        seen.add(key)
        out.append(value.strip())

    add(position)
    if extra:
        for item in extra:
            add(str(item))

    # Role-tailored shortcuts from the canonical position string
    pos_l = position.lower()
    if "summer" in pos_l:
        add("Summer Analyst")
    if "associate" in pos_l:
        add("Associate")
    if "analyst" in pos_l and "summer" not in pos_l:
        add("Analyst")
    if "venture" in pos_l:
        add("Venture Capital")
        add("Venture")
    if "private equity" in pos_l:
        add("Private Equity")
    if "growth equity" in pos_l:
        add("Growth Equity")
        add("Growth")

    for fb in _TRACK_FALLBACKS.get((track or "").upper(), ["Analyst", "Associate", ""]):
        add(fb)

    return out
