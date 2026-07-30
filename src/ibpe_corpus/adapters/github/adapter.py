"""GitHub source family adapter implementing the SourceAdapter protocol."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ibpe_corpus.adapters.github.fetch_repo import (
    DEFAULT_SOURCES_PATH,
    DEFAULT_STAGING_ROOT,
    fetch_github_path,
    fetch_source_entry,
    load_github_sources,
    staging_path_for,
)
from ibpe_corpus.adapters.github.importers import import_by_format
from ibpe_corpus.schemas.models import AccessState, RawArtefact, SourceAdapterResult


class GitHubSourceAdapter:
    """Discover / fetch / parse GitHub corpus sources from config."""

    name = "github"

    def __init__(
        self,
        *,
        config_path: Path | str | None = None,
        staging_root: Path | str = DEFAULT_STAGING_ROOT,
    ) -> None:
        self.config_path = Path(config_path) if config_path else DEFAULT_SOURCES_PATH
        self.staging_root = Path(staging_root)

    def discover(self, config: dict | None = None) -> list[dict]:
        """Return fetch targets for importable (non-pattern_only) sources."""
        cfg = config or {}
        sources = load_github_sources(cfg.get("config_path", self.config_path))
        priority_filter = cfg.get("import_priority")
        targets: list[dict[str, Any]] = []
        for entry in sources:
            priority = str(entry.get("import_priority", "")).lower()
            if priority in {"no", "pattern_only"}:
                continue
            if priority_filter and priority != str(priority_filter).lower():
                continue
            for rel in entry.get("paths") or []:
                if "*" in rel or "?" in rel:
                    continue
                targets.append(
                    {
                        "repo": entry["repo"],
                        "commit_sha": entry["commit_sha"],
                        "path": rel,
                        "format": entry.get("format"),
                        "import_priority": entry.get("import_priority"),
                        "notes": entry.get("notes"),
                    }
                )
        return targets

    def fetch(self, target: dict) -> SourceAdapterResult:
        """Download a single pinned path into staging."""
        if "paths" in target and "path" not in target:
            return fetch_source_entry(target, staging_root=self.staging_root)
        return fetch_github_path(
            target["repo"],
            target["commit_sha"],
            target["path"],
            staging_root=self.staging_root,
            force=bool(target.get("force", False)),
        )

    def parse_artefact(self, artefact: RawArtefact) -> SourceAdapterResult:
        """Parse a previously fetched artefact using format hints in metadata."""
        staging = artefact.metadata.get("staging_path")
        path = Path(
            staging
            or artefact.raw_json_path
            or artefact.raw_html_path
            or artefact.url_or_path
        )
        if not path.is_file():
            return SourceAdapterResult(
                artefacts=[artefact],
                access_state=AccessState.NOT_FOUND,
                diagnostics=[f"artefact path missing: {path}"],
            )

        fmt = artefact.metadata.get("format")
        if not fmt:
            fmt = self._infer_format(path)
        return import_by_format(
            path,
            fmt,
            artefact=artefact,
            commit_sha=artefact.commit_sha,
            repo=artefact.metadata.get("repo"),
        )

    def run(
        self,
        *,
        config: dict | None = None,
        fetch: bool = True,
    ) -> SourceAdapterResult:
        """Discover → optional fetch → parse for all eligible targets."""
        combined = SourceAdapterResult(access_state=AccessState.PUBLIC)
        for target in self.discover(config):
            if fetch:
                fetched = self.fetch(target)
                combined.diagnostics.extend(fetched.diagnostics)
                for key, value in fetched.metrics.items():
                    combined.metrics[key] = combined.metrics.get(key, 0) + value  # type: ignore[operator]
                if fetched.access_state != AccessState.PUBLIC:
                    combined.access_state = fetched.access_state
                    combined.diagnostics.append(
                        f"skip parse; fetch state={fetched.access_state} for {target}"
                    )
                    continue
                artefacts = fetched.artefacts
            else:
                staged = staging_path_for(
                    target["repo"],
                    target["path"],
                    staging_root=self.staging_root,
                )
                if not staged.is_file():
                    combined.diagnostics.append(f"missing staged file: {staged}")
                    continue
                from ibpe_corpus.adapters.github.fetch_repo import (
                    _artefact_for_file,
                    content_hash_file,
                    raw_github_url,
                )

                digest = content_hash_file(staged)
                art = _artefact_for_file(
                    repo=target["repo"],
                    commit_sha=target["commit_sha"],
                    rel_path=target["path"],
                    dest=staged,
                    digest=digest,
                    skipped=True,
                    source_url=raw_github_url(
                        target["repo"], target["commit_sha"], target["path"]
                    ),
                )
                art.metadata["format"] = target.get("format")
                artefacts = [art]

            for art in artefacts:
                art.metadata["format"] = target.get("format")
                parsed = self.parse_artefact(art)
                combined.artefacts.extend(parsed.artefacts)
                combined.extracted.extend(parsed.extracted)
                combined.responses.extend(parsed.responses)
                combined.diagnostics.extend(parsed.diagnostics)
                for key, value in parsed.metrics.items():
                    combined.metrics[key] = combined.metrics.get(key, 0) + value  # type: ignore[operator]

        return combined

    @staticmethod
    def _infer_format(path: Path) -> str:
        name = path.name.lower()
        suffix = path.suffix.lower()
        if suffix == ".json" or "qb-export" in name:
            return "firebase_export_json"
        if suffix in {".html", ".htm"}:
            return "html_playbook"
        if suffix == ".md":
            return "markdown_numbered_question_lists"
        return "unknown"
