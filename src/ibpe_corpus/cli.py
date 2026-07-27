"""Typer CLI for the IB/PE interview corpus pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich import print as rprint

from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.urls import occupation_search_url
from ibpe_corpus.adapters.github.adapter import GitHubSourceAdapter
from ibpe_corpus.adapters.static.seed_corpus import load_seed_corpus
from ibpe_corpus.orchestration.pipeline import run_fixture_pipeline
from ibpe_corpus.pe.classifier import classify_role
from ibpe_corpus.pe.queries import phrase_strings
from ibpe_corpus.storage.db import CorpusStore

app = typer.Typer(help="IB/PE interview corpus pipeline", no_args_is_help=True)
ROOT = Path(__file__).resolve().parents[2]


@app.command("migrate")
def migrate(
    db: Path = typer.Option(ROOT / "data" / "db" / "corpus.db", help="SQLite path"),
) -> None:
    """Create / migrate SQLite schema."""
    store = CorpusStore(db)
    rprint(f"[green]Schema ready at[/green] {store.db_path}")


@app.command("replay-fixture")
def replay_fixture(
    path: Path = typer.Argument(..., help="HTML fixture path"),
) -> None:
    """Parse an archived Glassdoor HTML fixture without network access."""
    html = path.read_text(encoding="utf-8", errors="replace")
    result = parse_html(html, source_url=f"fixture://{path.name}")
    rprint(
        {
            "access_state": result.access_state.value,
            "exact_questions": sum(
                1 for e in result.extracted if e.record_type.value == "exact_question"
            ),
            "responses": len(result.responses),
            "diagnostics": result.diagnostics,
            "metrics": result.metrics,
        }
    )


@app.command("fetch-glassdoor")
def fetch_glassdoor(
    url: Optional[str] = typer.Option(None, help="Absolute Glassdoor URL"),
    role: Optional[str] = typer.Option(None, help="Occupation search phrase"),
    raw_dir: Path = typer.Option(ROOT / "data" / "raw" / "glassdoor"),
) -> None:
    """Fetch one Glassdoor URL (expects block in restricted environments)."""
    target = url or (occupation_search_url(role) if role else None)
    if not target:
        raise typer.BadParameter("Provide --url or --role")
    fetcher = GlassdoorFetcher(raw_dir=raw_dir)
    result = fetcher.fetch_url(target)
    rprint(
        {
            "url": target,
            "access_state": result.access_state.value,
            "diagnostics": result.diagnostics,
            "metrics": result.metrics,
            "artefacts": [a.id for a in result.artefacts],
        }
    )


@app.command("pe-phrases")
def pe_phrases(limit: int = typer.Option(20)) -> None:
    """Print PE occupation search phrases."""
    phrases = phrase_strings()
    for p in phrases[:limit]:
        rprint(p)
    rprint(f"[dim]total={len(phrases)}[/dim]")


@app.command("classify-role")
def classify_role_cmd(title: str, context: str = "") -> None:
    """Classify a role title for PE relevance."""
    rprint(classify_role(title, context).value)


@app.command("import-seed")
def import_seed() -> None:
    """Import bundled static seed corpus."""
    result = load_seed_corpus()
    rprint(result.metrics)


@app.command("import-github")
def import_github(
    priority: Optional[str] = typer.Option("high", help="import_priority filter"),
) -> None:
    """Discover and fetch configured GitHub corpus paths."""
    adapter = GitHubSourceAdapter()
    targets = adapter.discover({"import_priority": priority} if priority else {})
    rprint(f"targets={len(targets)}")
    for t in targets[:5]:
        result = adapter.fetch(t)
        rprint({"target": t.get("path"), "access": result.access_state.value, "metrics": result.metrics})


@app.command("run-pipeline")
def run_pipeline(
    mode: str = typer.Option("fixtures", help="fixtures (offline) | live"),
    db: Path = typer.Option(ROOT / "data" / "db" / "corpus.db"),
    force: bool = typer.Option(False, help="Re-run completed jobs"),
) -> None:
    """Run the controlled collection pipeline."""
    if mode != "fixtures":
        rprint(
            "[yellow]Live Glassdoor mode is blocked in this environment; "
            "falling back to fixtures with honest access-state handling.[/yellow]"
        )
    summary = run_fixture_pipeline(db_path=db, force=force)
    rprint(json.dumps({k: summary[k] for k in ("canonical_questions", "answers", "metrics", "alerts") if k in summary}, indent=2, default=str))


@app.command("inspect-dead-letters")
def inspect_dead_letters(
    db: Path = typer.Option(ROOT / "data" / "db" / "corpus.db"),
) -> None:
    """List dead-letter queue rows."""
    from ibpe_corpus.storage.db import dead_letters

    store = CorpusStore(db)
    rows = store.fetch_all(dead_letters)
    rprint(rows or "No dead letters")


if __name__ == "__main__":
    app()
