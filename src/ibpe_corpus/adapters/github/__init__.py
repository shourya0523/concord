"""GitHub corpus adapters."""

from ibpe_corpus.adapters.github.adapter import GitHubSourceAdapter
from ibpe_corpus.adapters.github.fetch_repo import fetch_github_path, load_github_sources
from ibpe_corpus.adapters.github.importers import (
    import_firebase_qb_export,
    import_html_playbook,
    import_markdown_questions,
)

__all__ = [
    "GitHubSourceAdapter",
    "fetch_github_path",
    "import_firebase_qb_export",
    "import_html_playbook",
    "import_markdown_questions",
    "load_github_sources",
]
