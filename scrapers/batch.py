"""Batch scrape Glassdoor interview questions into the JSON bank."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

from scrapers.bank import (
    DEFAULT_BANK_PATH,
    enrich_question,
    is_job_completed,
    load_bank,
    mark_job_completed,
    merge_questions,
    save_bank,
)

DEFAULT_TARGETS_PATH = Path(__file__).resolve().parent.parent / "config" / "targets.json"
DEFAULT_SLEEP_SECONDS = 5


def load_targets(path: Path | str = DEFAULT_TARGETS_PATH) -> list[dict[str, Any]]:
    targets_path = Path(path)
    with targets_path.open(encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data.get("targets", [])
    return data


def expand_jobs(
    targets: list[dict[str, Any]],
    track: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[dict[str, str]]:
    """Expand targets into company+position jobs, optionally filtered."""
    jobs: list[dict[str, str]] = []
    track_filter = track.lower() if track else None
    for target in targets:
        target_track = target.get("track", "")
        if track_filter and target_track.lower() != track_filter:
            continue
        company = target.get("company", "")
        for position in target.get("positions", []):
            jobs.append(
                {
                    "company": company,
                    "track": target_track,
                    "position": position,
                }
            )
            if limit is not None and len(jobs) >= limit:
                return jobs
    return jobs


def run_batch(
    targets_path: Path | str = DEFAULT_TARGETS_PATH,
    bank_path: Path | str = DEFAULT_BANK_PATH,
    track: Optional[str] = None,
    limit: Optional[int] = None,
    sleep_seconds: float = DEFAULT_SLEEP_SECONDS,
    manual_login: bool = True,
    force: bool = False,
) -> None:
    targets = load_targets(targets_path)
    jobs = expand_jobs(targets, track=track, limit=limit)
    if not jobs:
        print("No scrape jobs matched the given filters.")
        return

    bank = load_bank(bank_path)
    total_added = 0
    total_updated = 0
    skipped = 0

    from scrapers.driver import (
        GLASSDOOR_SEEKER_HOME,
        browser_alive,
        create_driver,
        open_url,
        wait_for_manual_login,
    )
    from scrapers.scraper import GlassdoorScraper

    driver = create_driver()
    try:
        try:
            open_url(driver, GLASSDOOR_SEEKER_HOME)
        except Exception:
            from scrapers.driver import GLASSDOOR_FALLBACK_HOME

            open_url(driver, GLASSDOOR_FALLBACK_HOME)
        if manual_login:
            try:
                wait_for_manual_login(driver)
            except RuntimeError as e:
                print(f"Login aborted: {e}")
                return

        for i, job in enumerate(jobs, start=1):
            if not browser_alive(driver):
                print("Browser window closed — stopping batch.")
                break
            company = job["company"]
            position = job["position"]
            job_track = job["track"]

            if not force and is_job_completed(bank, company, position):
                skipped += 1
                print(
                    f"[{i}/{len(jobs)}] Skipping {company} / {position} "
                    "(already completed; use --force to redo)"
                )
                continue

            print(f"[{i}/{len(jobs)}] Scraping {company} / {position} ({job_track})...")
            job_added = 0
            job_updated = 0

            def on_page(page_questions: list, page_num: int) -> None:
                nonlocal bank, total_added, total_updated, job_added, job_updated
                records = [
                    enrich_question(
                        q, company=company, track=job_track, position=position
                    )
                    for q in page_questions
                ]
                bank, added, updated = merge_questions(bank, records)
                save_bank(bank, bank_path)
                total_added += added
                total_updated += updated
                job_added += added
                job_updated += updated
                if added or updated:
                    print(
                        f"  saved page {page_num}: +{added} new, ~{updated} updated "
                        f"(bank size: {len(bank.get('questions', []))})"
                    )

            try:
                raw_questions, completed = GlassdoorScraper.scrape_company_questions(
                    company=company,
                    position=position,
                    export_file=None,
                    driver=driver,
                    manual_login=False,
                    close_driver=False,
                    on_page=on_page,
                )
                # Final merge in case on_page wasn't used for empty pages.
                records = [
                    enrich_question(
                        q, company=company, track=job_track, position=position
                    )
                    for q in raw_questions
                ]
                bank, added, updated = merge_questions(bank, records)
                total_added += added
                total_updated += updated
                job_added += added
                job_updated += updated

                if completed and len(raw_questions) > 0:
                    bank = mark_job_completed(
                        bank, company=company, position=position, track=job_track
                    )
                    save_bank(bank, bank_path)
                    print(
                        f"  OK (complete): scraped {len(raw_questions)}, "
                        f"added {job_added}, updated {job_updated} "
                        f"(bank size: {len(bank.get('questions', []))})"
                    )
                elif completed and len(raw_questions) == 0:
                    save_bank(bank, bank_path)
                    print(
                        "  EMPTY: 0 questions (not marked complete — "
                        "likely login wall or bad filter). Re-run later."
                    )
                else:
                    save_bank(bank, bank_path)
                    print(
                        f"  PARTIAL: scraped {len(raw_questions)}, "
                        f"added {job_added}, updated {job_updated}. "
                        "Re-run later to resume/finish this job."
                    )
            except Exception as e:
                save_bank(bank, bank_path)
                err = str(e).lower()
                print(f"  FAILED: {company} / {position}: {e}")
                print("  Progress so far is saved; re-run to continue.")
                if "no such window" in err or "web view not found" in err:
                    print(
                        "  Browser window closed — stopping batch. "
                        "Re-run and keep the Selenium Chrome window open."
                    )
                    break

            if i < len(jobs) and sleep_seconds > 0:
                time.sleep(sleep_seconds)
    finally:
        try:
            driver.quit()
            print("Quitted!")
        except Exception:
            pass

    print(
        f"Batch complete. Added {total_added} new, updated {total_updated} "
        f"(skipped {skipped} completed jobs) → {bank_path}"
    )
