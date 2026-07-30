"""Unit tests for Glassdoor access-state detection."""

from __future__ import annotations

from pathlib import Path

from ibpe_corpus.adapters.glassdoor.access import detect_access_state, is_terminal_block
from ibpe_corpus.adapters.glassdoor.fetch import GlassdoorFetcher
from ibpe_corpus.schemas.models import AccessState

FIXTURES = Path("fixtures/glassdoor/html")


def test_captcha_signals() -> None:
    html = '<div class="captcha-container"></div><script>window._cf_chl_opt={}</script>'
    assert detect_access_state(status_code=403, html=html) == AccessState.CAPTCHA


def test_blocked_without_captcha() -> None:
    html = "<html>You have been blocked by Cloudflare robot check</html>"
    assert detect_access_state(status_code=403, html=html) == AccessState.BLOCKED


def test_not_found_and_throttled() -> None:
    assert detect_access_state(status_code=404, html="") == AccessState.NOT_FOUND
    assert detect_access_state(status_code=429, html="") == AccessState.THROTTLED


def test_public_next_data() -> None:
    html = '<script id="__NEXT_DATA__" type="application/json">{}</script>'
    assert detect_access_state(status_code=200, html=html) == AccessState.PUBLIC


def test_live_blocked_fixtures() -> None:
    paths = [
        FIXTURES / "occupation-investment-banking-analyst-httpx.html",
        FIXTURES / "occupation-private-equity-associate-httpx.html",
        FIXTURES / "company-goldman-sachs-interviews-httpx.html",
    ]
    fetcher = GlassdoorFetcher()
    for path in paths:
        result = fetcher.fetch_fixture(path)
        assert result.access_state in {AccessState.CAPTCHA, AccessState.BLOCKED}
        assert result.extracted == []
        assert is_terminal_block(result.access_state)
