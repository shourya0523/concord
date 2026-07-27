"""Browser-backed Glassdoor fetch using SeleniumBase UC + optional login.

Uses the existing GlassCleaner driver/auth stack when available. Page HTML is
archived and fed through the same ``parse_html`` path as fixtures.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ibpe_corpus import PARSER_VERSION
from ibpe_corpus.adapters.glassdoor.access import detect_access_state, is_terminal_block
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher, content_hash
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.adapters.glassdoor.session import (
    credentials_available,
    has_usable_session,
    session_path,
)
from ibpe_corpus.schemas.models import AccessState, RawArtefact, SourceAdapterResult, utcnow

DEFAULT_RAW_DIR = Path("data/raw/glassdoor")


def _ensure_repo_on_path() -> None:
    """Allow importing top-level ``scrapers`` when running the installed CLI."""
    import sys

    root = Path(__file__).resolve().parents[4]  # /workspace
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _browser_stack_available() -> tuple[bool, str]:
    _ensure_repo_on_path()
    try:
        import seleniumbase  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return False, f"seleniumbase missing: {exc}"
    try:
        from scrapers.driver import create_driver  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return False, f"scrapers.driver import failed: {exc}"
    return True, "ok"


class BrowserGlassdoorFetcher:
    """Fetch Glassdoor pages via undetected Chrome (SeleniumBase UC).

    Strategy:
    1. Reuse ``data/glassdoor_session.json`` when present
    2. Else automated/manual login via ``scrapers.auth.ensure_login`` when available
    3. Navigate, dump page_source, archive, parse
    4. On CAPTCHA/block HTML, return terminal access_state (no further expansion)
    """

    def __init__(
        self,
        *,
        raw_dir: Path | str = DEFAULT_RAW_DIR,
        rate_limit_s: float = 2.5,
        manual_login: bool = False,
        headless: bool = False,
        cookie_path: Path | str | None = None,
    ) -> None:
        self.raw_dir = Path(raw_dir)
        self.rate_limit_s = rate_limit_s
        self.manual_login = manual_login
        self.headless = headless
        self.cookie_path = Path(cookie_path) if cookie_path else session_path()
        self._driver = None
        self._owns_driver = False
        self._last_request_at: float | None = None
        self._stop_fetching = False
        self._logged_in = False

    def available(self) -> bool:
        ok, _ = _browser_stack_available()
        return ok

    def availability_reason(self) -> str:
        _, reason = _browser_stack_available()
        return reason

    def close(self) -> None:
        if self._owns_driver and self._driver is not None:
            try:
                self._driver.quit()
            except Exception:
                pass
        self._driver = None
        self._owns_driver = False

    def __enter__(self) -> BrowserGlassdoorFetcher:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _respect_rate_limit(self) -> None:
        now = time.monotonic()
        if self._last_request_at is not None:
            elapsed = now - self._last_request_at
            if elapsed < self.rate_limit_s:
                time.sleep(self.rate_limit_s - elapsed)
        self._last_request_at = time.monotonic()

    def _ensure_driver(self) -> Any:
        if self._driver is not None:
            return self._driver
        _ensure_repo_on_path()
        from scrapers.auth import ensure_login, credentials_configured, load_session
        from scrapers.driver import GLASSDOOR_SEEKER_HOME, create_driver, open_url

        driver = create_driver()
        self._driver = driver
        self._owns_driver = True
        open_url(driver, GLASSDOOR_SEEKER_HOME)

        # Prefer real auth when session/credentials exist; otherwise browse anonymously
        # (UC still beats bare httpx on some networks).
        if (
            self.manual_login
            or credentials_configured()
            or self.cookie_path.is_file()
        ):
            ensure_login(
                driver,
                manual_login=self.manual_login,
                cookie_path=self.cookie_path,
            )
            self._logged_in = True
        else:
            # Attempt cookie restore only; skip interactive pause.
            if load_session(driver, self.cookie_path):
                self._logged_in = True
            else:
                self._logged_in = False
        return driver

    def fetch_url(self, url: str) -> SourceAdapterResult:
        diagnostics: list[str] = []
        metrics: dict[str, int | float] = {
            "pages_fetched": 0,
            "pages_blocked": 0,
            "browser_fetch": 1,
        }

        if self._stop_fetching:
            return SourceAdapterResult(
                access_state=AccessState.BLOCKED,
                diagnostics=["browser fetch stopped after prior block"],
                metrics=metrics,
            )

        ok, reason = _browser_stack_available()
        if not ok:
            return SourceAdapterResult(
                access_state=AccessState.UNKNOWN,
                diagnostics=[
                    f"browser stack unavailable ({reason}); "
                    "pip install -r requirements.txt && run from repo root"
                ],
                metrics=metrics,
            )

        self._respect_rate_limit()
        try:
            from scrapers.driver import open_url, safe_current_url

            driver = self._ensure_driver()
            open_url(driver, url)
            time.sleep(1.0)
            html = driver.page_source or ""
            final_url = safe_current_url(driver) or url
        except Exception as exc:  # noqa: BLE001
            return SourceAdapterResult(
                access_state=AccessState.UNKNOWN,
                diagnostics=[f"browser fetch failed: {type(exc).__name__}: {exc}"],
                metrics=metrics,
            )

        access_state = detect_access_state(status_code=None, html=html)
        # Soft upgrade: if we got real interview markers, treat as public/auth.
        lowered = html.lower()
        if not is_terminal_block(access_state) and (
            "__next_data__" in lowered
            or "qtn_" in lowered
            or 'data-test="interviewquestion' in lowered
            or "interviewquestioncard" in lowered
        ):
            access_state = (
                AccessState.AUTHENTICATED if self._logged_in else AccessState.PUBLIC
            )

        metrics["pages_fetched"] = 1
        archive = GlassdoorFetcher(raw_dir=self.raw_dir)._archive_html(
            html, url=final_url, access_state=access_state
        )
        artefact = RawArtefact(
            source_family="glassdoor",
            url_or_path=final_url,
            raw_html_path=str(archive),
            content_hash=content_hash(html),
            parser_version=PARSER_VERSION,
            access_state=access_state,
            session_class="browser_uc" if self._logged_in else "browser_uc_anon",
            metadata={
                "requested_url": url,
                "final_url": final_url,
                "fetch_mode": "browser_uc",
                "retrieved_at": utcnow().isoformat(),
                "session_file": str(self.cookie_path),
            },
        )

        if is_terminal_block(access_state):
            metrics["pages_blocked"] = 1
            diagnostics.append(
                f"browser page still blocked ({access_state.value}); "
                "try residential network, fresh session, or --manual-login"
            )
            self._stop_fetching = True
            return SourceAdapterResult(
                artefacts=[artefact],
                access_state=access_state,
                diagnostics=diagnostics,
                metrics=metrics,
            )

        parsed = parse_html(html, source_url=final_url, artefact=artefact)
        if not parsed.artefacts:
            parsed.artefacts = [artefact]
        parsed.metrics = {**metrics, **parsed.metrics}
        parsed.diagnostics = diagnostics + list(parsed.diagnostics)
        return parsed


def choose_fetcher(
    *,
    mode: str = "auto",
    raw_dir: Path | str = DEFAULT_RAW_DIR,
    manual_login: bool = False,
) -> tuple[Any, str]:
    """Select the best available fetcher.

    Modes: ``http``, ``session``, ``browser``, ``auto``.
    ``auto`` prefers session-cookie httpx, then browser UC, then bare httpx.
    """
    from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
    from ibpe_corpus.adapters.glassdoor.session import cookies_for_httpx

    mode = (mode or "auto").lower()
    raw_dir = Path(raw_dir)

    if mode == "browser":
        return (
            BrowserGlassdoorFetcher(
                raw_dir=raw_dir, manual_login=manual_login
            ),
            "browser",
        )

    if mode in {"session", "auto"} and has_usable_session():
        cookie_map = cookies_for_httpx()
        fetcher = GlassdoorFetcher(
            raw_dir=raw_dir,
            cookies=cookie_map,
            session_class="authenticated_cookie",
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
        )
        return fetcher, "session"

    if mode == "auto" and (credentials_available() or has_usable_session()):
        browser = BrowserGlassdoorFetcher(
            raw_dir=raw_dir, manual_login=manual_login
        )
        if browser.available():
            return browser, "browser"

    if mode == "http":
        return GlassdoorFetcher(raw_dir=raw_dir), "http"

    return GlassdoorFetcher(raw_dir=raw_dir), "http"
