import argparse
import json
import sys

from dotenv import load_dotenv

from scrapers.bank import DEFAULT_BANK_PATH, load_bank, query_bank
from scrapers.batch import DEFAULT_TARGETS_PATH, run_batch


def _add_scrape_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "-c",
        "--company",
        type=str,
        required=True,
        help="Company name to search on Glassdoor",
    )
    parser.add_argument(
        "-p",
        "--position",
        type=str,
        required=True,
        help="Position to search interview questions for",
    )
    parser.add_argument(
        "-e",
        "--export",
        type=str,
        choices=["txt", "docx", "csv", "pdf", "json"],
        required=True,
        help="Format to export the interview questions",
    )
    parser.add_argument(
        "--manual-login",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Pause so you can log into Glassdoor in the browser (default: on)",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scrape Glassdoor interview questions into a JSON bank for IB/PE/banking."
    )
    subparsers = parser.add_subparsers(dest="command")

    batch_parser = subparsers.add_parser(
        "batch", help="Batch-scrape targets into the question bank"
    )
    batch_parser.add_argument(
        "--track",
        type=str,
        choices=["IB", "PE", "Banking"],
        help="Only scrape targets for this track",
    )
    batch_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of company+position jobs to run",
    )
    batch_parser.add_argument(
        "--targets",
        type=str,
        default=str(DEFAULT_TARGETS_PATH),
        help="Path to targets JSON",
    )
    batch_parser.add_argument(
        "--bank",
        type=str,
        default=str(DEFAULT_BANK_PATH),
        help="Path to question bank JSON",
    )
    batch_parser.add_argument(
        "--sleep",
        type=float,
        default=5.0,
        help="Seconds to sleep between jobs",
    )
    batch_parser.add_argument(
        "--manual-login",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Pause so you can log into Glassdoor in the browser (default: on)",
    )
    batch_parser.add_argument(
        "--force",
        action="store_true",
        help="Re-scrape jobs even if they are marked completed in the bank",
    )

    query_parser = subparsers.add_parser(
        "query", help="Filter and print questions from the bank"
    )
    query_parser.add_argument(
        "--track",
        type=str,
        choices=["IB", "PE", "Banking"],
        help="Filter by track",
    )
    query_parser.add_argument(
        "--company",
        type=str,
        help="Filter by company substring",
    )
    query_parser.add_argument(
        "--position",
        type=str,
        help="Filter by position substring",
    )
    query_parser.add_argument(
        "--bank",
        type=str,
        default=str(DEFAULT_BANK_PATH),
        help="Path to question bank JSON",
    )
    query_parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Write filtered JSON to this file instead of stdout",
    )

    ui_parser = subparsers.add_parser(
        "ui", help="Open the local interview bank browser UI"
    )
    ui_parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host interface to bind",
    )
    ui_parser.add_argument(
        "--port",
        type=int,
        default=5050,
        help="Port for the UI server",
    )

    return parser


def _run_scrape(args: argparse.Namespace) -> None:
    from scrapers.scraper import GlassdoorScraper

    GlassdoorScraper.scrape_company_questions(
        company=args.company,
        position=args.position,
        export_file=args.export,
        manual_login=args.manual_login,
    )


def _run_query(args: argparse.Namespace) -> None:
    bank = load_bank(args.bank)
    results = query_bank(
        bank,
        track=args.track,
        company=args.company,
        position=args.position,
    )
    payload = {
        "version": bank.get("version", 1),
        "count": len(results),
        "questions": results,
    }
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Wrote {len(results)} questions to {args.output}")
    else:
        sys.stdout.write(text)


def main() -> None:
    load_dotenv()

    # Preserve: python main.py -c ... -p ... -e ...
    # Also support: python main.py batch|query|ui ...
    if len(sys.argv) > 1 and sys.argv[1] in ("batch", "query", "ui"):
        parser = _build_parser()
        args = parser.parse_args()
        if args.command == "batch":
            run_batch(
                targets_path=args.targets,
                bank_path=args.bank,
                track=args.track,
                limit=args.limit,
                sleep_seconds=args.sleep,
                manual_login=args.manual_login,
                force=args.force,
            )
        elif args.command == "query":
            _run_query(args)
        elif args.command == "ui":
            from web.app import run as run_ui

            run_ui(host=args.host, port=args.port)
        return

    scrape_parser = argparse.ArgumentParser(
        description="Scrape interview questions from Glassdoor.",
        epilog=(
            "Also available:\n"
            "  python main.py batch [--track IB|PE|Banking] [--limit N]\n"
            "  python main.py query [--track IB|PE|Banking] [--company NAME] [--position ROLE]\n"
            "  python main.py ui [--port 5050]"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _add_scrape_args(scrape_parser)
    args = scrape_parser.parse_args()
    _run_scrape(args)


if __name__ == "__main__":
    main()
