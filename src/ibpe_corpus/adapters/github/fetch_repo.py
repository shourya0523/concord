"""Fetch pinned GitHub repo paths into local staging."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yaml

from ibpe_corpus.schemas.models import AccessState, RawArtefact, SourceAdapterResult

PARSER_VERSION = "github-importer-v1"
DEFAULT_SOURCES_PATH = Path("config/github_sources.yml")
DEFAULT_STAGING_ROOT = Path("data/staging/github")
SOURCE_FAMILY = "github"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def content_hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def content_hash_file(path: Path) -> str:
    return content_hash_bytes(path.read_bytes())


def repo_slug_dir(repo: str) -> str:
    return repo.replace("/", "_")


def load_github_sources(
    config_path: Path | str | None = None,
    *,
    include_local: bool = True,
) -> list[dict[str, Any]]:
    """Load source entries from github_sources.yml (+ optional local fragment)."""
    path = Path(config_path) if config_path else DEFAULT_SOURCES_PATH
    sources: list[dict[str, Any]] = []
    if path.is_file():
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        sources.extend(payload.get("sources") or [])

    if include_local:
        local_path = path.with_name(path.stem + ".local.yml")
        if local_path.is_file():
            local_payload = yaml.safe_load(local_path.read_text(encoding="utf-8")) or {}
            sources.extend(local_payload.get("sources") or [])

    return sources


def raw_github_url(repo: str, commit_sha: str, path: str) -> str:
    return f"https://raw.githubusercontent.com/{repo}/{commit_sha}/{path}"


def staging_path_for(
    repo: str,
    rel_path: str,
    *,
    staging_root: Path = DEFAULT_STAGING_ROOT,
) -> Path:
    return staging_root / repo_slug_dir(repo) / rel_path


def _meta_path(dest: Path) -> Path:
    return dest.with_suffix(dest.suffix + ".meta.json")


def _write_meta(dest: Path, meta: dict[str, Any]) -> None:
    _meta_path(dest).write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _read_meta(dest: Path) -> dict[str, Any] | None:
    meta_file = _meta_path(dest)
    if not meta_file.is_file():
        return None
    try:
        return json.loads(meta_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _download_raw(url: str, timeout: float = 60.0) -> bytes:
    req = Request(url, headers={"User-Agent": "ibpe-corpus-github-fetch/0.1"})
    with urlopen(req, timeout=timeout) as resp:  # noqa: S310 — pinned public raw URLs
        return resp.read()


def _artefact_for_file(
    *,
    repo: str,
    commit_sha: str,
    rel_path: str,
    dest: Path,
    digest: str,
    skipped: bool,
    source_url: str,
) -> RawArtefact:
    suffix = dest.suffix.lower()
    raw_json = str(dest) if suffix == ".json" else None
    raw_html = str(dest) if suffix in {".html", ".htm", ".md"} else None
    if suffix == ".md" and raw_html is None:
        raw_html = str(dest)
    return RawArtefact(
        source_family=SOURCE_FAMILY,
        url_or_path=source_url,
        commit_sha=commit_sha,
        retrieved_at=utcnow(),
        raw_html_path=raw_html if suffix != ".json" else None,
        raw_json_path=raw_json,
        content_hash=digest,
        parser_version=PARSER_VERSION,
        access_state=AccessState.PUBLIC,
        session_class="unauthenticated",
        metadata={
            "repo": repo,
            "path": rel_path,
            "staging_path": str(dest),
            "skipped_idempotent": skipped,
            "provenance": "github",
            "not_glassdoor": True,
        },
    )


def fetch_github_path(
    repo: str,
    commit_sha: str,
    path: str,
    *,
    staging_root: Path | str = DEFAULT_STAGING_ROOT,
    force: bool = False,
    prefer_raw: bool = True,
) -> SourceAdapterResult:
    """Clone/download a single file pinned to ``commit_sha`` into staging.

    Prefer ``raw.githubusercontent.com``. Fall back to a shallow ``git`` clone
    of the file's parent tree when raw download fails. Idempotent: if the
    staged file already exists with the same content hash, skip rewriting.
    """
    staging_root = Path(staging_root)
    dest = staging_path_for(repo, path, staging_root=staging_root)
    source_url = raw_github_url(repo, commit_sha, path)
    diagnostics: list[str] = []
    metrics: dict[str, int | float] = {
        "pages_fetched": 0,
        "pages_unchanged": 0,
        "pages_blocked": 0,
    }

    existing_meta = _read_meta(dest) if dest.is_file() else None
    if dest.is_file() and not force:
        digest = content_hash_file(dest)
        if existing_meta and existing_meta.get("content_hash") == digest and existing_meta.get("commit_sha") == commit_sha:
            metrics["pages_unchanged"] = 1
            art = _artefact_for_file(
                repo=repo,
                commit_sha=commit_sha,
                rel_path=path,
                dest=dest,
                digest=digest,
                skipped=True,
                source_url=source_url,
            )
            diagnostics.append(f"skip idempotent: {dest} hash={digest[:12]}")
            return SourceAdapterResult(
                artefacts=[art],
                access_state=AccessState.PUBLIC,
                diagnostics=diagnostics,
                metrics=metrics,
            )

    data: bytes | None = None
    if prefer_raw:
        try:
            data = _download_raw(source_url)
            diagnostics.append(f"fetched raw: {source_url}")
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            diagnostics.append(f"raw fetch failed: {exc}")

    if data is None:
        try:
            data = _fetch_via_git_show(repo, commit_sha, path)
            diagnostics.append(f"fetched via git show: {repo}@{commit_sha}:{path}")
        except Exception as exc:  # noqa: BLE001 — surface as blocked artefact
            diagnostics.append(f"git fetch failed: {exc}")
            metrics["pages_blocked"] = 1
            return SourceAdapterResult(
                access_state=AccessState.BLOCKED,
                diagnostics=diagnostics,
                metrics=metrics,
            )

    digest = content_hash_bytes(data)
    if dest.is_file() and not force:
        existing = content_hash_file(dest)
        if existing == digest:
            metrics["pages_unchanged"] = 1
            _write_meta(
                dest,
                {
                    "repo": repo,
                    "commit_sha": commit_sha,
                    "path": path,
                    "content_hash": digest,
                    "source_url": source_url,
                    "bytes": len(data),
                },
            )
            art = _artefact_for_file(
                repo=repo,
                commit_sha=commit_sha,
                rel_path=path,
                dest=dest,
                digest=digest,
                skipped=True,
                source_url=source_url,
            )
            diagnostics.append(f"skip idempotent (content match): {dest}")
            return SourceAdapterResult(
                artefacts=[art],
                access_state=AccessState.PUBLIC,
                diagnostics=diagnostics,
                metrics=metrics,
            )

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    _write_meta(
        dest,
        {
            "repo": repo,
            "commit_sha": commit_sha,
            "path": path,
            "content_hash": digest,
            "source_url": source_url,
            "bytes": len(data),
            "retrieved_at": utcnow().isoformat(),
        },
    )
    metrics["pages_fetched"] = 1
    art = _artefact_for_file(
        repo=repo,
        commit_sha=commit_sha,
        rel_path=path,
        dest=dest,
        digest=digest,
        skipped=False,
        source_url=source_url,
    )
    return SourceAdapterResult(
        artefacts=[art],
        access_state=AccessState.PUBLIC,
        diagnostics=diagnostics,
        metrics=metrics,
    )


def _fetch_via_git_show(repo: str, commit_sha: str, path: str) -> bytes:
    """Shallow-clone into a temp dir under staging and ``git show`` the file."""
    cache_root = DEFAULT_STAGING_ROOT / "_git_cache" / repo_slug_dir(repo)
    cache_root.parent.mkdir(parents=True, exist_ok=True)
    remote = f"https://github.com/{repo}.git"

    if not (cache_root / ".git").is_dir():
        if cache_root.exists():
            shutil.rmtree(cache_root)
        subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "--filter=blob:none",
                "--sparse",
                remote,
                str(cache_root),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "-C", str(cache_root), "sparse-checkout", "set", path],
            check=True,
            capture_output=True,
            text=True,
        )

    # Ensure the pinned commit is available (may need fetch if not on tip).
    fetch = subprocess.run(
        ["git", "-C", str(cache_root), "fetch", "--depth", "1", "origin", commit_sha],
        capture_output=True,
        text=True,
    )
    if fetch.returncode != 0:
        # Fall back to showing whatever is currently checked out / available.
        pass

    show = subprocess.run(
        ["git", "-C", str(cache_root), "show", f"{commit_sha}:{path}"],
        capture_output=True,
        check=True,
    )
    return show.stdout


def fetch_source_entry(
    entry: dict[str, Any],
    *,
    staging_root: Path | str = DEFAULT_STAGING_ROOT,
    force: bool = False,
    path_filter: str | None = None,
) -> SourceAdapterResult:
    """Fetch concrete (non-glob) paths listed on a config source entry."""
    repo = entry["repo"]
    commit_sha = entry["commit_sha"]
    paths = entry.get("paths") or []
    combined = SourceAdapterResult(access_state=AccessState.PUBLIC)
    for rel in paths:
        if "*" in rel or "?" in rel:
            combined.diagnostics.append(f"skip glob path (fetch individually): {rel}")
            continue
        if path_filter and rel != path_filter:
            continue
        result = fetch_github_path(
            repo,
            commit_sha,
            rel,
            staging_root=staging_root,
            force=force,
        )
        combined.artefacts.extend(result.artefacts)
        combined.extracted.extend(result.extracted)
        combined.responses.extend(result.responses)
        combined.diagnostics.extend(result.diagnostics)
        for key, value in result.metrics.items():
            combined.metrics[key] = combined.metrics.get(key, 0) + value  # type: ignore[operator]
        if result.access_state != AccessState.PUBLIC:
            combined.access_state = result.access_state
    return combined
