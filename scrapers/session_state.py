"""Patchright session capture — documented Glassdoor anti-bot approach (2026).

Consensus from Thunderbit / Clura / Patchright docs:
1. Use Patchright (not vanilla Playwright/Selenium) with real Chrome channel
2. Log in once in a headed browser (solve captcha / 2FA manually)
3. Save full storage_state (cookies + localStorage), not Selenium cookies alone
4. Reuse storage_state on later runs
5. Prefer a residential proxy; datacenter IPs often stay on Cloudflare Managed Challenge

Refs:
- https://thunderbit.com/blog/scrape-glassdoor-with-python
- https://clura.ai/blog/glassdoor-scraper-python
- https://github.com/Kaliiiiiiiiii-Vinyzu/patchright
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

DEFAULT_STATE_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "glassdoor_state.json"
)
GLASSDOOR_LOGIN_URL = "https://www.glassdoor.com/profile/login_input.htm"
GLASSDOOR_HOME = "https://www.glassdoor.com/index.htm"

# CSS hide for Soft wall / login modal when HTML is already present (Thunderbit).
HARSELL_CSS = """
#HardsellOverlay, .LoginModal { display: none !important; }
body { overflow: auto !important; position: initial !important; }
"""


def state_path() -> Path:
    raw = (os.getenv("GLASSDOOR_STATE_PATH") or "").strip()
    return Path(raw) if raw else DEFAULT_STATE_PATH


def state_exists(path: Path | str | None = None) -> bool:
    p = Path(path) if path else state_path()
    return p.is_file() and p.stat().st_size > 50


def _proxy_server() -> Optional[str]:
    return (
        os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or ""
    ).strip() or None


def _launch_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "headless": False,
        "channel": "chrome",
        "args": ["--disable-blink-features=AutomationControlled"],
    }
    proxy = _proxy_server()
    if proxy:
        # Patchright/Playwright expects server URL; auth can be in URL.
        kwargs["proxy"] = {"server": proxy}
        host = urlparse(proxy).hostname or proxy.split("@")[-1]
        print(f"Patchright using proxy host={host}")
    return kwargs


def _context_kwargs(storage: Path | str | None = None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "viewport": {"width": 1440, "height": 900},
        "locale": "en-US",
        "timezone_id": "America/Los_Angeles",
    }
    if storage and Path(storage).exists():
        kwargs["storage_state"] = str(storage)
    return kwargs


def _page_looks_logged_in(page) -> bool:
    """Best-effort auth check on a Patchright page."""
    try:
        url = (page.url or "").lower()
    except Exception:
        return False
    if any(
        x in url
        for x in (
            "accounts.google.com",
            "secure.indeed.com",
            "/profile/login",
            "/member/profile/login",
        )
    ):
        return False
    try:
        html = (page.content() or "").lower()
    except Exception:
        return False
    signed_out = [
        'data-test="sign-in-button"',
        'data-test="unified-auth-indeed-button"',
        "continue with apple or email",
        "continue with google",
    ]
    if any(m in html for m in signed_out):
        return False
    signed_in = [
        'data-test="utility-nav-account"',
        'data-test="profile-nav"',
        "sign out",
        "/member/home",
        "/member/account",
    ]
    if any(m in html for m in signed_in):
        return True
    # Cookie names from storage after a good login
    try:
        names = {c.get("name", "") for c in page.context.cookies()}
    except Exception:
        names = set()
    return bool(names & {"gdId", "GSESSIONID", "AWSALBAppSession"})


def capture_login_session(
    *,
    path: Path | str | None = None,
    timeout_seconds: float = 600,
    poll_seconds: float = 2.0,
    wait_for_enter: bool = True,
) -> Path:
    """Open headed Chrome via Patchright; user completes login; save storage_state.

    Documented pattern (Thunderbit 2026):
      launch(headless=False, channel="chrome") → goto login → manual login →
      context.storage_state(path=...)
    """
    from patchright.sync_api import sync_playwright

    out = Path(path) if path else state_path()
    out.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Glassdoor session capture (Patchright / documented approach)")
    print("1. Complete Cloudflare captcha if shown")
    print("2. Sign in (Google or Apple/email)")
    print("3. Approve phone 2FA if prompted")
    print("4. Wait until you see the Glassdoor homepage signed-in")
    if wait_for_enter:
        print("5. Press Enter in this terminal (or wait for auto-detect)")
    else:
        print("5. Auto-detect will save when signed-in markers appear")
    print(f"State file: {out}")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(**_launch_kwargs())
        context = browser.new_context(**_context_kwargs())
        page = context.new_page()
        page.goto(GLASSDOOR_LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)

        deadline = time.time() + timeout_seconds
        saved = False

        if wait_for_enter:
            # Non-blocking poll + Enter: in cloud UIs Enter may be hard; poll helps.
            print(
                "Waiting for login… (auto-saves when signed in, "
                f"or press Enter within {int(timeout_seconds)}s)"
            )
            import select
            import sys

            while time.time() < deadline:
                if _page_looks_logged_in(page):
                    print("Signed-in markers detected — saving storage_state…")
                    break
                # Allow Enter to force-save even if heuristics are weak
                try:
                    if select.select([sys.stdin], [], [], poll_seconds)[0]:
                        sys.stdin.readline()
                        print("Enter received — saving storage_state…")
                        break
                except Exception:
                    time.sleep(poll_seconds)
            else:
                browser.close()
                raise TimeoutError(
                    f"Login not completed within {timeout_seconds:.0f}s. "
                    "Re-run: python main.py login"
                )
        else:
            while time.time() < deadline:
                if _page_looks_logged_in(page):
                    break
                time.sleep(poll_seconds)
            else:
                browser.close()
                raise TimeoutError(
                    f"Login not completed within {timeout_seconds:.0f}s"
                )

        # Navigate home so cookies settle on glassdoor.com
        try:
            page.goto(GLASSDOOR_HOME, wait_until="domcontentloaded", timeout=60_000)
            time.sleep(1.5)
        except Exception as e:
            print(f"Home navigation warning: {e}")

        context.storage_state(path=str(out))
        saved = True
        cookie_names = sorted({c.get("name", "") for c in context.cookies()})
        print(f"Saved storage_state → {out}")
        print(f"Cookie names ({len(cookie_names)}): {', '.join(cookie_names[:25])}")
        if not _page_looks_logged_in(page):
            print(
                "WARNING: page still looks signed-out. "
                "State was saved anyway — re-run login if scrape fails."
            )
        browser.close()

    if not saved or not state_exists(out):
        raise RuntimeError(f"Failed to write storage_state to {out}")
    return out


def load_storage_state(path: Path | str | None = None) -> Optional[dict]:
    p = Path(path) if path else state_path()
    if not state_exists(p):
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Could not read storage_state {p}: {e}")
        return None


def playwright_cookies_to_selenium(cookies: list[dict]) -> list[dict]:
    """Convert Playwright storage_state cookies to Selenium add_cookie() dicts."""
    out: list[dict] = []
    for c in cookies:
        name = c.get("name")
        if not name:
            continue
        cookie: dict[str, Any] = {
            "name": name,
            "value": c.get("value", ""),
            "path": c.get("path") or "/",
        }
        domain = c.get("domain")
        if domain:
            cookie["domain"] = domain
        if c.get("secure") is not None:
            cookie["secure"] = bool(c["secure"])
        if c.get("httpOnly") is not None:
            cookie["httpOnly"] = bool(c["httpOnly"])
        # Playwright: sameSite Strict|Lax|None; Selenium is picky — drop often safest
        expires = c.get("expires")
        if expires is not None and expires > 0:
            try:
                cookie["expiry"] = int(expires)
            except Exception:
                pass
        out.append(cookie)
    return out


def apply_storage_state_to_driver(driver, path: Path | str | None = None) -> bool:
    """Inject Patchright storage_state cookies (+ localStorage) into a Selenium driver."""
    from scrapers.driver import (
        GLASSDOOR_SEEKER_HOME,
        focus_glassdoor_window,
        open_url,
    )

    state = load_storage_state(path)
    if not state:
        return False
    cookies = state.get("cookies") or []
    if not cookies:
        return False

    selenium_cookies = playwright_cookies_to_selenium(cookies)
    try:
        open_url(driver, GLASSDOOR_SEEKER_HOME)
        driver.delete_all_cookies()
        for cookie in selenium_cookies:
            try:
                driver.add_cookie(cookie)
            except Exception:
                # Retry without domain if host mismatch
                c2 = dict(cookie)
                c2.pop("domain", None)
                try:
                    driver.add_cookie(c2)
                except Exception:
                    continue

        # Restore localStorage origins when possible (helps some auth tokens)
        origins = state.get("origins") or []
        for origin in origins:
            origin_url = origin.get("origin") or ""
            if "glassdoor.com" not in origin_url:
                continue
            items = origin.get("localStorage") or []
            if not items:
                continue
            try:
                open_url(driver, origin_url if origin_url.startswith("http") else GLASSDOOR_SEEKER_HOME)
                for item in items:
                    name = item.get("name")
                    value = item.get("value", "")
                    if not name:
                        continue
                    driver.execute_script(
                        "window.localStorage.setItem(arguments[0], arguments[1]);",
                        name,
                        value,
                    )
            except Exception as e:
                print(f"localStorage restore skipped for {origin_url}: {e}")

        open_url(driver, GLASSDOOR_SEEKER_HOME)
        focus_glassdoor_window(driver)
        print(f"Restored Patchright storage_state ({len(selenium_cookies)} cookies).")
        return True
    except Exception as e:
        print(f"Failed to apply storage_state: {e}")
        return False


def dismiss_hardsell_overlay(driver) -> None:
    """Hide Glassdoor login wall CSS when content is already in the DOM."""
    try:
        driver.execute_script(
            """
            const s = document.createElement('style');
            s.textContent = arguments[0];
            document.documentElement.appendChild(s);
            """,
            HARSELL_CSS,
        )
    except Exception:
        pass
