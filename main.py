import argparse
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from scrapers.auth import credentials_configured
from scrapers.bank import DEFAULT_BANK_PATH, load_bank, query_bank
from scrapers.batch import DEFAULT_TARGETS_PATH, run_batch


def _default_manual_login() -> bool:
    """Prefer automated login when .env credentials are present."""
    return not credentials_configured()


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
        default=_default_manual_login(),
        help=(
            "Pause for manual Glassdoor login. Default: off when "
            "GLASSDOOR_EMAIL/GLASSDOOR_PASSWORD are set in .env, otherwise on."
        ),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scrape Glassdoor interview questions into a JSON bank for IB/PE/banking."
    )
    subparsers = parser.add_subparsers(dest="command")

    login_parser = subparsers.add_parser(
        "login",
        help=(
            "Capture Glassdoor session via Patchright (headed Chrome). "
            "Solves captcha/2FA once; saves data/glassdoor_state.json for scrape/batch."
        ),
    )
    login_parser.add_argument(
        "--timeout",
        type=float,
        default=600,
        help="Seconds to wait for you to finish login (default: 600)",
    )
    login_parser.add_argument(
        "--state",
        type=str,
        default=None,
        help="Path for storage_state JSON (default: data/glassdoor_state.json)",
    )
    login_parser.add_argument(
        "--no-enter",
        action="store_true",
        help="Do not wait for Enter; only auto-detect signed-in markers",
    )

    batch_parser = subparsers.add_parser(
        "batch", help="Batch-scrape targets into the question bank"
    )
    batch_parser.add_argument(
        "--track",
        type=str,
        choices=["IB", "PE", "Banking", "VC"],
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
        default=_default_manual_login(),
        help=(
            "Pause for manual Glassdoor login. Default: off when "
            "GLASSDOOR_EMAIL/GLASSDOOR_PASSWORD are set in .env, otherwise on."
        ),
    )
    batch_parser.add_argument(
        "--force",
        action="store_true",
        help="Re-scrape jobs even if they are marked completed in the bank",
    )
    batch_parser.add_argument(
        "--backend",
        type=str,
        choices=["browser", "bff"],
        default="browser",
        help=(
            "browser = Selenium/Patchright login (hits Indeed Cloudflare on "
            "datacenter IPs). bff = curl_cffi + Glassdoor BFF API (no browser "
            "login; needs residential HTTPS_PROXY on cloud)."
        ),
    )
    batch_parser.add_argument(
        "--pages",
        type=int,
        default=5,
        help="Max BFF interview pages per company (default: 5; --backend bff only)",
    )

    query_parser = subparsers.add_parser(
        "query", help="Filter and print questions from the bank"
    )
    query_parser.add_argument(
        "--track",
        type=str,
        choices=["IB", "PE", "Banking", "VC"],
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


def _run_login(args: argparse.Namespace) -> None:
    from scrapers.session_state import capture_login_session

    path = capture_login_session(
        path=args.state,
        timeout_seconds=args.timeout,
        wait_for_enter=not args.no_enter,
    )
    print(f"Done. Scrape/batch will reuse: {path}")


def main() -> None:
    # Preserve: python main.py -c ... -p ... -e ...
    # Also support: python main.py login|batch|query|ui ...
    if len(sys.argv) > 1 and sys.argv[1] in ("login", "batch", "query", "ui"):
        parser = _build_parser()
        args = parser.parse_args()
        if args.command == "login":
            _run_login(args)
        elif args.command == "batch":
            run_batch(
                targets_path=args.targets,
                bank_path=args.bank,
                track=args.track,
                limit=args.limit,
                sleep_seconds=args.sleep,
                manual_login=args.manual_login,
                force=args.force,
                backend=args.backend,
                max_pages=args.pages,
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
            "  python main.py login [--timeout 600]\n"
            "  python main.py batch [--backend bff] [--track IB|PE|Banking] [--limit N]\n"
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
