#!/usr/bin/env python3
"""Guided Glassdoor login: automate until captcha/2FA, then pause for human."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scrapers.session_state import (  # noqa: E402
    DEFAULT_STATE_PATH,
    GLASSDOOR_HOME,
    GLASSDOOR_LOGIN_URL,
    _context_kwargs,
    _launch_kwargs,
    _page_looks_logged_in,
)

SHOT_DIR = Path("/opt/cursor/artifacts")
SHOT_DIR.mkdir(parents=True, exist_ok=True)


def shot(page, name: str) -> Path:
    path = SHOT_DIR / f"login_{name}.png"
    try:
        page.screenshot(path=str(path), full_page=True)
    except Exception:
        page.screenshot(path=str(path))
    print(f"[screenshot] {path}", flush=True)
    return path


def html_lower(page) -> str:
    try:
        return (page.content() or "").lower()
    except Exception:
        return ""


def detect_blockers(page) -> dict:
    html = html_lower(page)
    url = ""
    try:
        url = page.url or ""
    except Exception:
        pass
    title = ""
    try:
        title = page.title() or ""
    except Exception:
        pass
    has_login_cta = "continue with google" in html or "continue with apple" in html
    # Invisible Turnstile widgets often sit in DOM even when UI is usable.
    # Only treat as blocking captcha when the interstitial is actually showing
    # OR Google shows an explicit challenge / no usable form.
    just_a_moment = "just a moment" in html or "checking your browser" in html
    turnstile_widget = (
        "cf-turnstile" in html
        or "challenge-platform" in html
        or "challenges.cloudflare.com" in html
    )
    blocking_cf = just_a_moment or (
        turnstile_widget and not has_login_cta and "accounts.google.com" not in url
    )
    google_challenge = "accounts.google.com" in url and (
        "sorry" in html
        or "/challenge" in url.lower()
        or "unusual traffic" in html
        or "recaptcha" in html
        or ("verify it's you" in html and 'type="password"' not in html)
    )
    return {
        "url": url,
        "title": title,
        "turnstile": blocking_cf,
        "just_a_moment": just_a_moment,
        "recaptcha": "recaptcha" in html and (
            "accounts.google.com" in url or not has_login_cta
        ),
        "captcha_word": False,
        "google_challenge": google_challenge,
        "google_2fa": "accounts.google.com" in url
        and (
            "2-step" in html
            or "tap yes" in html
            or "check your" in html
            or "enter the code" in html
            or "authenticator" in html
            or "a prompt was sent" in html
            or "confirm it's you" in html
        ),
        "google_password": "accounts.google.com" in url
        and ('type="password"' in html or 'name="Passwd"' in html or "passwd" in html),
        "google_email": "accounts.google.com" in url
        and ("identifierid" in html or 'type="email"' in html),
        "glassdoor_login": has_login_cta,
        "logged_in": False,
    }


def wait_for_human(page, reason: str, *, timeout: float = 300) -> None:
    print("\n" + "=" * 60, flush=True)
    print(f"YOUR TURN: {reason}", flush=True)
    print("Solve it in the Chrome window on the cloud desktop.", flush=True)
    print("I will keep watching and continue automatically.", flush=True)
    print("=" * 60 + "\n", flush=True)
    shot(page, "human_needed")
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        info = detect_blockers(page)
        if _page_looks_logged_in(page):
            print("Signed-in detected.", flush=True)
            return
        # Clear when captcha markers gone and we advanced
        still = (
            info["turnstile"]
            or info["just_a_moment"]
            or info["recaptcha"]
            or info["google_challenge"]
        )
        status = f"{info['title'][:40]} | {info['url'][:70]} | captcha={still}"
        if status != last:
            print(f"[watch] {status}", flush=True)
            last = status
        if not still and reason.startswith("CAPTCHA"):
            # Give page a beat then return so caller can continue
            time.sleep(1.5)
            info2 = detect_blockers(page)
            if not (
                info2["turnstile"]
                or info2["just_a_moment"]
                or info2["recaptcha"]
                or info2["google_challenge"]
            ):
                print("Captcha markers cleared — continuing.", flush=True)
                return
        if reason.startswith("2FA") and "accounts.google.com" not in info["url"]:
            print("Left Google accounts — 2FA likely done.", flush=True)
            return
        time.sleep(2)
    raise TimeoutError(f"Timed out waiting for human: {reason}")


def click_text(page, texts: list[str]) -> bool:
    for text in texts:
        for role in ("button", "link"):
            try:
                loc = page.get_by_role(role, name=text)
                if loc.count() > 0:
                    loc.first.click(timeout=5000)
                    print(f"Clicked {role}: {text}", flush=True)
                    return True
            except Exception:
                continue
        try:
            loc = page.locator(f"text={text}")
            if loc.count() > 0:
                loc.first.click(timeout=5000)
                print(f"Clicked text: {text}", flush=True)
                return True
        except Exception:
            continue
    return False


def fill_first(page, selectors: list[str], value: str) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() == 0:
                continue
            loc.first.fill(value, timeout=5000)
            print(f"Filled {sel}", flush=True)
            return True
        except Exception:
            continue
    return False


def main() -> int:
    email = (os.getenv("GLASSDOOR_EMAIL") or "").strip()
    password = (os.getenv("GLASSDOOR_PASSWORD") or "").strip()
    if not email or not password:
        print("Missing GLASSDOOR_EMAIL / GLASSDOOR_PASSWORD in .env", flush=True)
        return 1

    from patchright.sync_api import sync_playwright

    out = Path(os.getenv("GLASSDOOR_STATE_PATH") or DEFAULT_STATE_PATH)
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"Guided login as {email}", flush=True)
    print(f"Will save storage_state → {out}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(**_launch_kwargs())
        context = browser.new_context(**_context_kwargs())
        page = context.new_page()

        print("Opening Glassdoor login…", flush=True)
        page.goto(GLASSDOOR_LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
        time.sleep(2)
        shot(page, "01_login")

        info = detect_blockers(page)
        if info["turnstile"] or info["just_a_moment"]:
            wait_for_human(page, "CAPTCHA / Cloudflare challenge on Glassdoor login", timeout=300)

        # Wait for Continue with Google
        for _ in range(40):
            if "continue with google" in html_lower(page):
                break
            info = detect_blockers(page)
            if info["turnstile"] or info["just_a_moment"]:
                wait_for_human(page, "CAPTCHA / Cloudflare challenge", timeout=300)
            time.sleep(1)

        shot(page, "02_ready")
        if not click_text(page, ["Continue with Google", "Sign in with Google"]):
            print("Could not find Google button — your turn to click it.", flush=True)
            wait_for_human(page, "Click Continue with Google", timeout=180)
        else:
            time.sleep(2)

        shot(page, "03_after_google_click")

        # Google email
        for _ in range(30):
            info = detect_blockers(page)
            if info["turnstile"] or info["just_a_moment"] or info["recaptcha"] or info["google_challenge"]:
                wait_for_human(page, "CAPTCHA before/during Google sign-in", timeout=300)
            if info["google_email"] or 'type="email"' in html_lower(page):
                break
            if info["google_password"]:
                break
            if "accounts.google.com" in info["url"]:
                break
            time.sleep(1)

        shot(page, "04_google")
        info = detect_blockers(page)
        if info["google_email"] or 'identifierid' in html_lower(page) or 'type="email"' in html_lower(page):
            filled = fill_first(
                page,
                [
                    'input[type="email"]',
                    "#identifierId",
                    'input[name="identifier"]',
                ],
                email,
            )
            if filled:
                time.sleep(0.5)
                if not click_text(page, ["Next", "Weiter"]):
                    page.keyboard.press("Enter")
                time.sleep(2)
            else:
                wait_for_human(page, "Enter Google email", timeout=180)

        shot(page, "05_after_email")
        info = detect_blockers(page)
        if info["turnstile"] or info["just_a_moment"] or info["recaptcha"] or info["google_challenge"]:
            wait_for_human(page, "CAPTCHA after email (solve now)", timeout=300)

        # Password
        for _ in range(30):
            info = detect_blockers(page)
            if info["turnstile"] or info["just_a_moment"] or info["recaptcha"] or info["google_challenge"]:
                wait_for_human(page, "CAPTCHA before password", timeout=300)
            if info["google_password"] or 'type="password"' in html_lower(page):
                break
            if info["google_2fa"]:
                break
            if _page_looks_logged_in(page):
                break
            time.sleep(1)

        shot(page, "06_password_or_next")
        if 'type="password"' in html_lower(page):
            filled = fill_first(
                page,
                [
                    'input[type="password"]',
                    'input[name="Passwd"]',
                    'input[name="password"]',
                ],
                password,
            )
            if filled:
                time.sleep(0.5)
                if not click_text(page, ["Next", "Continue"]):
                    page.keyboard.press("Enter")
                time.sleep(2)
            else:
                wait_for_human(page, "Enter Google password", timeout=180)

        shot(page, "07_after_password")
        info = detect_blockers(page)
        if info["turnstile"] or info["just_a_moment"] or info["recaptcha"] or info["google_challenge"]:
            wait_for_human(page, "CAPTCHA after password (solve now)", timeout=400)

        # 2FA
        for _ in range(15):
            info = detect_blockers(page)
            if info["google_2fa"] or info["google_challenge"]:
                wait_for_human(
                    page,
                    "2FA / phone approval — approve on your phone now",
                    timeout=400,
                )
                break
            if "accounts.google.com" not in info["url"]:
                break
            if _page_looks_logged_in(page):
                break
            time.sleep(1)

        # Final wait for Glassdoor session
        print("Waiting for authenticated Glassdoor session…", flush=True)
        deadline = time.time() + 240
        while time.time() < deadline:
            if _page_looks_logged_in(page):
                break
            info = detect_blockers(page)
            if info["turnstile"] or info["just_a_moment"] or info["recaptcha"]:
                wait_for_human(page, "CAPTCHA on return to Glassdoor", timeout=300)
            if info["google_2fa"] or info["google_challenge"]:
                wait_for_human(page, "2FA / verify challenge", timeout=300)
            time.sleep(2)

        try:
            page.goto(GLASSDOOR_HOME, wait_until="domcontentloaded", timeout=60_000)
            time.sleep(2)
        except Exception as e:
            print(f"Home nav warning: {e}", flush=True)

        shot(page, "08_final")
        context.storage_state(path=str(out))
        names = sorted({c.get("name", "") for c in context.cookies()})
        print(f"Saved storage_state → {out}", flush=True)
        print(f"Cookies: {', '.join(names[:30])}", flush=True)
        if _page_looks_logged_in(page):
            print("SUCCESS: looks signed in.", flush=True)
        else:
            print("WARNING: saved state but page still looks signed-out.", flush=True)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
