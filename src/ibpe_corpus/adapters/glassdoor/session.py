"""Session-cookie helpers for authenticated Glassdoor HTTP fetches.

Loads cookies from ``data/glassdoor_session.json`` (written by the legacy
GlassCleaner login flow). Credentials and the session file are never committed.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

DEFAULT_SESSION_PATH = Path("data/glassdoor_session.json")


def session_path() -> Path:
    override = os.getenv("GLASSDOOR_SESSION_PATH")
    return Path(override) if override else DEFAULT_SESSION_PATH


def load_session_cookies(
    path: Path | str | None = None,
) -> list[dict[str, Any]]:
    """Return Selenium-style cookie dicts from a saved session file."""
    p = Path(path) if path else session_path()
    if not p.is_file():
        return []
    try:
        payload = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    cookies = payload.get("cookies") or []
    return [c for c in cookies if isinstance(c, dict) and c.get("name")]


def cookies_for_httpx(cookies: list[dict[str, Any]] | None = None) -> dict[str, str]:
    """Flatten Selenium cookies to an httpx-compatible name→value map."""
    cookies = cookies if cookies is not None else load_session_cookies()
    out: dict[str, str] = {}
    for c in cookies:
        name = c.get("name")
        value = c.get("value")
        if name and value is not None:
            out[str(name)] = str(value)
    return out


def has_usable_session(path: Path | str | None = None) -> bool:
    cookies = load_session_cookies(path)
    names = {c.get("name") for c in cookies}
    # Any authenticated-looking cookie is enough to try.
    markers = {"gdId", "GSESSIONID", "AWSALBAppSession", "JSESSIONID", "T", "cass"}
    return bool(names & markers) or len(cookies) >= 3


def credentials_available() -> bool:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    email = (os.getenv("GLASSDOOR_EMAIL") or os.getenv("EMAIL") or "").strip()
    password = (os.getenv("GLASSDOOR_PASSWORD") or os.getenv("PASSWORD") or "").strip()
    return bool(email and password)
