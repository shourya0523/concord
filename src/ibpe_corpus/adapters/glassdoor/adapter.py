"""Glassdoor SourceAdapter: discover / fetch / parse_artefact."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.urls import (
    company_interview_url,
    occupation_search_url,
    slugify_company,
)
from ibpe_corpus.schemas.models import RawArtefact, SourceAdapterResult


class GlassdoorAdapter:
    """Source adapter Protocol implementation for Glassdoor interview surfaces."""

    name = "glassdoor"

    def __init__(
        self,
        *,
        fetcher: GlassdoorFetcher | None = None,
        fixture_mode: bool = True,
    ) -> None:
        self.fetcher = fetcher or GlassdoorFetcher()
        self.fixture_mode = fixture_mode

    def discover(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        """Build fetch targets from role list and/or employer list in config."""
        targets: list[dict[str, Any]] = []

        roles = config.get("roles") or config.get("role_list") or []
        for role in roles:
            if isinstance(role, str):
                keyword = role
                page = 1
            elif isinstance(role, dict):
                keyword = role.get("keyword") or role.get("role") or role.get("name")
                page = int(role.get("page") or 1)
            else:
                continue
            if not keyword:
                continue
            targets.append(
                {
                    "surface": "occupation_search",
                    "keyword": keyword,
                    "page": page,
                    "url": occupation_search_url(keyword, page=page),
                }
            )

        employers = config.get("employers") or config.get("employer_list") or []
        for emp in employers:
            if isinstance(emp, dict):
                name = emp.get("name") or emp.get("employer")
                slug = emp.get("slug") or (slugify_company(name) if name else None)
                employer_id = emp.get("employer_id") or emp.get("id") or emp.get("ei")
                page = int(emp.get("page") or 1)
            else:
                continue
            if not slug or employer_id is None:
                continue
            targets.append(
                {
                    "surface": "company_interview",
                    "employer": name,
                    "slug": slug,
                    "employer_id": employer_id,
                    "page": page,
                    "url": company_interview_url(slug, employer_id, page=page),
                }
            )

        # Explicit URL / fixture targets
        for item in config.get("targets") or []:
            if isinstance(item, dict):
                targets.append(dict(item))

        return targets

    def fetch(self, target: dict[str, Any]) -> SourceAdapterResult:
        """Fetch a discover target (fixture path preferred when present)."""
        fixture = target.get("fixture") or target.get("fixture_path")
        if fixture:
            return self.fetcher.fetch_fixture(fixture)
        if self.fixture_mode and target.get("require_fixture"):
            return SourceAdapterResult(
                diagnostics=["fixture_mode requires fixture_path; refusing live fetch"],
                metrics={"pages_fetched": 0},
            )
        url = target.get("url")
        if not url:
            return SourceAdapterResult(diagnostics=["missing url/fixture in target"])
        return self.fetcher.fetch_url(url)

    def parse_artefact(self, artefact: RawArtefact) -> SourceAdapterResult:
        """Re-parse a RawArtefact from its archived HTML path."""
        path = artefact.raw_html_path or artefact.url_or_path
        if not path:
            return SourceAdapterResult(
                artefacts=[artefact],
                diagnostics=["artefact has no raw_html_path or url_or_path"],
                access_state=artefact.access_state,
            )
        p = Path(path)
        if not p.exists():
            return SourceAdapterResult(
                artefacts=[artefact],
                diagnostics=[f"artefact path not found: {path}"],
                access_state=artefact.access_state,
            )
        html = p.read_text(encoding="utf-8")
        return parse_html(
            html,
            source_url=artefact.url_or_path,
            artefact=artefact,
            status_code=(artefact.metadata or {}).get("status_code"),
        )
