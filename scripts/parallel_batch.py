#!/usr/bin/env python3
"""Run batch scrape across N workers (separate Chrome + bank shards), then merge.

Usage:
  python scripts/parallel_batch.py --workers 3 --no-manual-login
  python scripts/parallel_batch.py --workers 3 --force --no-manual-login
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scrapers.bank import (  # noqa: E402
    DEFAULT_BANK_PATH,
    is_job_completed,
    load_bank,
    mark_job_completed,
    merge_questions,
    save_bank,
)
from scrapers.batch import DEFAULT_TARGETS_PATH, expand_jobs, load_targets  # noqa: E402


def _split(jobs: list[dict], n: int) -> list[list[dict]]:
    n = max(1, min(n, len(jobs) or 1))
    shards: list[list[dict]] = [[] for _ in range(n)]
    for i, job in enumerate(jobs):
        shards[i % n].append(job)
    return [s for s in shards if s]


def _write_targets(path: Path, jobs: list[dict]) -> None:
    """Collapse jobs back into targets-shaped JSON for batch CLI."""
    by_key: dict[tuple[str, str], dict] = {}
    for job in jobs:
        key = (job["company"], job["track"])
        if key not in by_key:
            entry: dict = {
                "company": job["company"],
                "track": job["track"],
                "positions": [],
            }
            if job.get("search_as") and job["search_as"] != job["company"]:
                entry["search_as"] = job["search_as"]
            by_key[key] = entry
        if job["position"] not in by_key[key]["positions"]:
            by_key[key]["positions"].append(job["position"])
    path.write_text(
        json.dumps({"targets": list(by_key.values())}, indent=2) + "\n",
        encoding="utf-8",
    )


def _merge_banks(master_path: Path, shard_paths: list[Path]) -> tuple[int, int]:
    master = load_bank(master_path)
    total_added = 0
    total_updated = 0
    for sp in shard_paths:
        if not sp.exists():
            continue
        shard = load_bank(sp)
        master, added, updated = merge_questions(master, shard.get("questions", []))
        total_added += added
        total_updated += updated
        for job in shard.get("completed_jobs", []):
            if isinstance(job, dict):
                master = mark_job_completed(
                    master,
                    company=job.get("company", ""),
                    position=job.get("position", ""),
                    track=job.get("track", ""),
                )
            elif isinstance(job, str) and "|" in job:
                company, position = job.split("|", 1)
                master = mark_job_completed(master, company=company, position=position)
    save_bank(master, master_path)
    return total_added, total_updated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--track", choices=["IB", "PE", "Banking", "VC"], default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--sleep", type=float, default=3.0)
    parser.add_argument(
        "--manual-login",
        action=argparse.BooleanOptionalAction,
        default=False,
    )
    parser.add_argument("--targets", type=str, default=str(DEFAULT_TARGETS_PATH))
    parser.add_argument("--bank", type=str, default=str(DEFAULT_BANK_PATH))
    parser.add_argument(
        "--workdir",
        type=str,
        default=str(ROOT / "data" / "parallel_batch"),
    )
    args = parser.parse_args()

    jobs = expand_jobs(
        load_targets(args.targets), track=args.track, limit=args.limit
    )
    bank = load_bank(args.bank)
    if not args.force:
        before = len(jobs)
        jobs = [
            j
            for j in jobs
            if not is_job_completed(bank, j["company"], j["position"])
        ]
        print(f"Jobs: {len(jobs)} pending ({before - len(jobs)} already complete)")
    else:
        print(f"Jobs: {len(jobs)} (force re-scrape)")

    if not jobs:
        print("Nothing to scrape.")
        return 0

    workdir = Path(args.workdir)
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True, exist_ok=True)

    shards = _split(jobs, args.workers)
    print(f"Launching {len(shards)} workers…")

    procs: list[subprocess.Popen] = []
    shard_banks: list[Path] = []
    env = os.environ.copy()
    env.setdefault("DISPLAY", ":1")

    for i, shard in enumerate(shards):
        targets_path = workdir / f"targets_w{i}.json"
        bank_path = workdir / f"bank_w{i}.json"
        log_path = workdir / f"worker_{i}.log"
        _write_targets(targets_path, shard)
        # Each worker starts from current master so merges/updates work.
        shutil.copy2(args.bank, bank_path)
        shard_banks.append(bank_path)

        cmd = [
            sys.executable,
            str(ROOT / "main.py"),
            "batch",
            "--targets",
            str(targets_path),
            "--bank",
            str(bank_path),
            "--sleep",
            str(args.sleep),
            "--no-manual-login" if not args.manual_login else "--manual-login",
        ]
        if args.force:
            cmd.append("--force")
        if args.track:
            cmd.extend(["--track", args.track])

        log_f = open(log_path, "w", encoding="utf-8")
        print(f"  worker {i}: {len(shard)} jobs → {log_path}")
        procs.append(
            subprocess.Popen(
                cmd,
                cwd=str(ROOT),
                env=env,
                stdout=log_f,
                stderr=subprocess.STDOUT,
            )
        )

    # Poll until all exit
    while True:
        alive = [(i, p.poll()) for i, p in enumerate(procs)]
        running = [i for i, code in alive if code is None]
        if not running:
            break
        done = len(procs) - len(running)
        print(
            f"[parallel] {done}/{len(procs)} workers finished; "
            f"still running: {running}",
            flush=True,
        )
        time.sleep(30)

    codes = [p.wait() for p in procs]
    print(f"Workers exited: {codes}")

    added, updated = _merge_banks(Path(args.bank), shard_banks)
    final = load_bank(args.bank)
    print(
        f"Merged into {args.bank}: +{added} new, ~{updated} updated; "
        f"bank size={len(final.get('questions', []))}, "
        f"completed_jobs={len(final.get('completed_jobs', []))}"
    )
    return 0 if all(c == 0 for c in codes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
