"""Typer CLI for the IB/PE interview corpus pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich import print as rprint

from ibpe_corpus.adapters.glassdoor.browser_fetch import choose_fetcher
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.question_bank import import_question_bank
from ibpe_corpus.adapters.glassdoor.session import (
    credentials_available,
    has_usable_session,
)
from ibpe_corpus.adapters.glassdoor.urls import (
    company_interview_url,
    occupation_search_url,
)
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


@app.command("fetch-status")
def fetch_status() -> None:
    """Show which live Glassdoor access paths are available."""
    from ibpe_corpus.adapters.glassdoor.browser_fetch import BrowserGlassdoorFetcher

    browser = BrowserGlassdoorFetcher()
    rprint(
        {
            "session_cookies": has_usable_session(),
            "credentials_configured": credentials_available(),
            "browser_stack": browser.available(),
            "browser_reason": browser.availability_reason(),
            "recommended_mode": (
                "session"
                if has_usable_session()
                else (
                    "browser"
                    if credentials_available() or browser.available()
                    else "fixtures"
                )
            ),
        }
    )


@app.command("fetch-glassdoor")
def fetch_glassdoor(
    url: Optional[str] = typer.Option(None, help="Absolute Glassdoor URL"),
    role: Optional[str] = typer.Option(None, help="Occupation search phrase"),
    company: Optional[str] = typer.Option(None, help="Company slug for interview page"),
    employer_id: Optional[int] = typer.Option(None, help="Glassdoor employer id"),
    mode: str = typer.Option(
        "auto",
        help="auto|http|session|browser — session uses saved cookies; browser uses UC Chrome",
    ),
    manual_login: bool = typer.Option(False, help="Pause for manual browser login"),
    raw_dir: Path = typer.Option(ROOT / "data" / "raw" / "glassdoor"),
) -> None:
    """Fetch one Glassdoor URL via http / session cookies / browser UC."""
    target = url
    if not target and role:
        target = occupation_search_url(role)
    if not target and company and employer_id is not None:
        target = company_interview_url(company, employer_id)
    if not target:
        raise typer.BadParameter("Provide --url, --role, or --company + --employer-id")

    fetcher, resolved = choose_fetcher(
        mode=mode, raw_dir=raw_dir, manual_login=manual_login
    )
    try:
        result = fetcher.fetch_url(target)
    finally:
        close = getattr(fetcher, "close", None)
        if callable(close):
            close()

    rprint(
        {
            "url": target,
            "fetch_mode": resolved,
            "access_state": result.access_state.value,
            "exact_questions": sum(
                1 for e in result.extracted if e.record_type.value == "exact_question"
            ),
            "responses": len(result.responses),
            "diagnostics": result.diagnostics,
            "metrics": result.metrics,
            "artefacts": [a.id for a in result.artefacts],
            "raw_paths": [a.raw_html_path for a in result.artefacts],
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


@app.command("import-question-bank")
def import_bank_cmd(
    path: Path = typer.Option(ROOT / "data" / "question_bank.json"),
    track: Optional[str] = typer.Option(None, help="Filter IB|PE|Banking"),
) -> None:
    """Import legacy GlassCleaner question_bank.json into ExtractedRecords."""
    tracks = {track.upper()} if track else None
    result = import_question_bank(path, tracks=tracks)
    rprint(
        {
            "access_state": result.access_state.value,
            "metrics": result.metrics,
            "diagnostics": result.diagnostics,
            "sample": [
                e.exact_source_text[:120] for e in result.extracted[:5]
                if e.record_type.value == "exact_question"
            ],
        }
    )


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
    mode: str = typer.Option(
        "fixtures",
        help="fixtures (offline) | live (fixtures + question bank still; live fetch optional)",
    ),
    db: Path = typer.Option(ROOT / "data" / "db" / "corpus.db"),
    force: bool = typer.Option(False, help="Re-run completed jobs"),
) -> None:
    """Run the controlled collection pipeline (includes question_bank import)."""
    if mode not in {"fixtures", "live"}:
        raise typer.BadParameter("mode must be fixtures or live")
    if mode == "live":
        rprint(
            "[cyan]Live mode still runs the offline corpus assembly; "
            "use `ibpe fetch-glassdoor --mode auto` for authenticated/browser fetches.[/cyan]"
        )
    summary = run_fixture_pipeline(db_path=db, force=force)
    rprint(
        json.dumps(
            {
                k: summary[k]
                for k in ("canonical_questions", "answers", "metrics", "alerts")
                if k in summary
            },
            indent=2,
            default=str,
        )
    )


@app.command("crawl-roles")
def crawl_roles(
    roles: Optional[str] = typer.Option(
        None,
        help="Comma-separated roles (default: PE Associate + IB Analyst)",
    ),
    mode: str = typer.Option("auto", help="auto|session|browser|http"),
    pages: int = typer.Option(1, help="Pages per role (pagination)"),
    manual_login: bool = typer.Option(False),
    raw_dir: Path = typer.Option(ROOT / "data" / "raw" / "glassdoor"),
) -> None:
    """Crawl occupation search pages and parse questions into stdout summary."""
    role_list = [
        r.strip()
        for r in (roles or "Private Equity Associate,Investment Banking Analyst").split(",")
        if r.strip()
    ]
    fetcher, resolved = choose_fetcher(
        mode=mode, raw_dir=raw_dir, manual_login=manual_login
    )
    totals = {"pages": 0, "questions": 0, "blocked": 0, "responses": 0}
    try:
        for role in role_list:
            for page in range(1, max(1, pages) + 1):
                url = occupation_search_url(role, page=page)
                result = fetcher.fetch_url(url)
                totals["pages"] += 1
                n_q = sum(
                    1
                    for e in result.extracted
                    if e.record_type.value == "exact_question"
                )
                totals["questions"] += n_q
                totals["responses"] += len(result.responses)
                if result.access_state.value in {"blocked", "captcha", "throttled"}:
                    totals["blocked"] += 1
                    rprint(
                        {
                            "role": role,
                            "page": page,
                            "access_state": result.access_state.value,
                            "mode": resolved,
                            "diagnostics": result.diagnostics[:3],
                        }
                    )
                    break
                rprint(
                    {
                        "role": role,
                        "page": page,
                        "mode": resolved,
                        "access_state": result.access_state.value,
                        "questions": n_q,
                        "responses": len(result.responses),
                    }
                )
    finally:
        close = getattr(fetcher, "close", None)
        if callable(close):
            close()
    rprint({"totals": totals, "fetch_mode": resolved})


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
