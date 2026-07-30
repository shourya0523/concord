"""Glassdoor HTTP fetcher — fixture-first, no circumvention."""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any

import httpx

from ibpe_corpus import PARSER_VERSION
from ibpe_corpus.adapters.glassdoor.access import detect_access_state, is_terminal_block
from ibpe_corpus.adapters.glassdoor.parse import parse_html
from ibpe_corpus.schemas.models import AccessState, RawArtefact, SourceAdapterResult, utcnow

DEFAULT_RAW_DIR = Path("data/raw/glassdoor")
DEFAULT_TIMEOUT_S = 30.0
DEFAULT_RATE_LIMIT_S = 1.5
DEFAULT_USER_AGENT = (
    "ibpe-corpus/0.1 (+research; fixture-first; no-cookie; respectful-delay)"
)


def content_hash(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


class GlassdoorFetcher:
    """Fetch Glassdoor interview pages with rate limiting and block handling.

    By default starts without cookies. Call ``load_session_cookies()`` or pass
    ``cookies`` to reuse a saved authenticated session from GlassCleaner login.
    CAPTCHA/blocked responses are archived and stop expansion.
    """

    def __init__(
        self,
        *,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        rate_limit_s: float = DEFAULT_RATE_LIMIT_S,
        raw_dir: Path | str = DEFAULT_RAW_DIR,
        client: httpx.Client | None = None,
        user_agent: str = DEFAULT_USER_AGENT,
        parse_on_success: bool = True,
        cookies: dict[str, str] | None = None,
        session_class: str = "unauthenticated",
    ) -> None:
        self.timeout_s = timeout_s
        self.rate_limit_s = rate_limit_s
        self.raw_dir = Path(raw_dir)
        self.user_agent = user_agent
        self.parse_on_success = parse_on_success
        self.session_class = session_class
        self._cookie_seed = dict(cookies or {})
        self._client = client
        self._owns_client = client is None
        self._last_request_at: float | None = None
        self._backoff_until: float | None = None
        self._stop_fetching = False

    def load_session_cookies(self) -> int:
        """Load cookies from ``data/glassdoor_session.json`` into the client."""
        from ibpe_corpus.adapters.glassdoor.session import cookies_for_httpx

        cookie_map = cookies_for_httpx()
        if not cookie_map:
            return 0
        self._cookie_seed.update(cookie_map)
        self.session_class = "authenticated_cookie"
        if self._client is not None:
            for name, value in cookie_map.items():
                self._client.cookies.set(name, value, domain=".glassdoor.com")
        return len(cookie_map)

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            jar = httpx.Cookies()
            for name, value in self._cookie_seed.items():
                jar.set(name, value, domain=".glassdoor.com")
            self._client = httpx.Client(
                timeout=self.timeout_s,
                follow_redirects=True,
                headers={
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                cookies=jar,
            )
        return self._client

    def close(self) -> None:
        if self._owns_client and self._client is not None:
            self._client.close()
            self._client = None

    def __enter__(self) -> GlassdoorFetcher:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _respect_rate_limit(self) -> None:
        now = time.monotonic()
        if self._backoff_until is not None and now < self._backoff_until:
            time.sleep(self._backoff_until - now)
            now = time.monotonic()
        if self._last_request_at is not None:
            elapsed = now - self._last_request_at
            if elapsed < self.rate_limit_s:
                time.sleep(self.rate_limit_s - elapsed)
        self._last_request_at = time.monotonic()

    def _archive_html(self, html: str, *, url: str, access_state: AccessState) -> Path:
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        digest = content_hash(html)
        path = self.raw_dir / f"{digest}.html"
        if not path.exists():
            path.write_text(html, encoding="utf-8")
        meta_path = self.raw_dir / f"{digest}.meta.json"
        if not meta_path.exists():
            import json

            meta_path.write_text(
                json.dumps(
                    {
                        "url": url,
                        "content_hash": digest,
                        "access_state": access_state.value,
                        "retrieved_at": utcnow().isoformat(),
                        "parser_version": PARSER_VERSION,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
        return path

    def _artefact_for(
        self,
        *,
        url_or_path: str,
        html: str,
        access_state: AccessState,
        raw_html_path: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> RawArtefact:
        return RawArtefact(
            source_family="glassdoor",
            url_or_path=url_or_path,
            raw_html_path=raw_html_path,
            content_hash=content_hash(html),
            parser_version=PARSER_VERSION,
            access_state=access_state,
            session_class=self.session_class,
            metadata=metadata or {},
        )

    def fetch_url(self, url: str) -> SourceAdapterResult:
        """GET a live URL. On block, set access_state/diagnostics; do not parse questions."""
        diagnostics: list[str] = []
        metrics: dict[str, int | float] = {"pages_fetched": 0, "pages_blocked": 0}

        if self._stop_fetching:
            return SourceAdapterResult(
                access_state=AccessState.BLOCKED,
                diagnostics=["fetch stopped after prior CAPTCHA/blocked response"],
                metrics=metrics,
            )

        self._respect_rate_limit()
        client = self._get_client()
        try:
            response = client.get(url)
        except httpx.TimeoutException as exc:
            return SourceAdapterResult(
                access_state=AccessState.UNKNOWN,
                diagnostics=[f"timeout fetching {url}: {exc}"],
                metrics=metrics,
            )
        except httpx.HTTPError as exc:
            return SourceAdapterResult(
                access_state=AccessState.UNKNOWN,
                diagnostics=[f"http error fetching {url}: {exc}"],
                metrics=metrics,
            )

        html = response.text
        access_state = detect_access_state(status_code=response.status_code, html=html)
        metrics["pages_fetched"] = 1
        archive_path = self._archive_html(html, url=url, access_state=access_state)
        artefact = self._artefact_for(
            url_or_path=str(response.url),
            html=html,
            access_state=access_state,
            raw_html_path=str(archive_path),
            metadata={
                "status_code": response.status_code,
                "requested_url": url,
                "final_url": str(response.url),
            },
        )

        if is_terminal_block(access_state):
            metrics["pages_blocked"] = 1
            diagnostics.append(
                f"access blocked ({access_state.value}); status={response.status_code}; "
                "stopping expansion — no CAPTCHA circumvention"
            )
            # Back off and stop further expansion from this fetcher instance.
            self._backoff_until = time.monotonic() + max(self.rate_limit_s * 5, 10.0)
            self._stop_fetching = True
            return SourceAdapterResult(
                artefacts=[artefact],
                extracted=[],
                responses=[],
                access_state=access_state,
                diagnostics=diagnostics,
                metrics=metrics,
            )

        if not self.parse_on_success:
            return SourceAdapterResult(
                artefacts=[artefact],
                access_state=access_state,
                diagnostics=diagnostics,
                metrics=metrics,
            )

        parsed = parse_html(
            html,
            source_url=str(response.url),
            artefact=artefact,
            status_code=response.status_code,
        )
        # Prefer artefact we already archived.
        if not parsed.artefacts:
            parsed.artefacts = [artefact]
        parsed.metrics = {**metrics, **parsed.metrics}
        return parsed

    def fetch_fixture(self, path: str | Path) -> SourceAdapterResult:
        """Load local HTML fixture and parse (or classify block pages)."""
        fixture_path = Path(path)
        html = fixture_path.read_text(encoding="utf-8")
        digest = content_hash(html)
        access_state = detect_access_state(status_code=None, html=html)
        # Prefer meta sidecar status when present for live_sanitized blocks.
        meta_path = fixture_path.with_suffix(fixture_path.suffix + ".meta.json")
        if not meta_path.exists():
            # common pattern: file.html + file.meta.json
            meta_path = Path(str(fixture_path) + ".meta.json")
            if not meta_path.exists():
                sibling = fixture_path.parent / (fixture_path.stem + ".meta.json")
                meta_path = sibling
        status_code: int | None = None
        source_url = str(fixture_path)
        if meta_path.exists():
            import json

            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                meta = {}
            status_code = meta.get("status")
            source_url = meta.get("source_url") or meta.get("final_url") or source_url
            if status_code is not None:
                access_state = detect_access_state(status_code=status_code, html=html)

        artefact = self._artefact_for(
            url_or_path=source_url,
            html=html,
            access_state=access_state,
            raw_html_path=str(fixture_path),
            metadata={
                "fixture_path": str(fixture_path),
                "content_hash": digest,
                "status_code": status_code,
            },
        )

        if is_terminal_block(access_state):
            return SourceAdapterResult(
                artefacts=[artefact],
                extracted=[],
                responses=[],
                access_state=access_state,
                diagnostics=[
                    f"fixture access_state={access_state.value}; zero questions extracted"
                ],
                metrics={"pages_fetched": 1, "pages_blocked": 1, "exact_questions": 0},
            )

        return parse_html(
            html,
            source_url=source_url,
            artefact=artefact,
            status_code=status_code,
        )
