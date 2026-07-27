"""Glassdoor login helpers (Indeed SSO + optional cookie reuse)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from scrapers.driver import (
    GLASSDOOR_SEEKER_HOME,
    browser_alive,
    focus_glassdoor_window,
    open_url,
    safe_current_url,
    wait_for_manual_login,
)

GLASSDOOR_LOGIN_URL = "https://www.glassdoor.com/profile/login_input.htm"
DEFAULT_COOKIE_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "glassdoor_session.json"
)

EMAIL_SELECTORS = [
    "input[type='email']",
    "input[name='__email']",
    "input[name='email']",
    "input[autocomplete='username']",
    "input[id*='email' i]",
]
PASSWORD_SELECTORS = [
    "input[type='password']",
    "input[name='__password']",
    "input[name='password']",
    "input[autocomplete='current-password']",
]


def get_credentials() -> tuple[Optional[str], Optional[str]]:
    email = (os.getenv("GLASSDOOR_EMAIL") or os.getenv("EMAIL") or "").strip()
    password = (
        os.getenv("GLASSDOOR_PASSWORD") or os.getenv("PASSWORD") or ""
    ).strip()
    return (email or None, password or None)


def credentials_configured() -> bool:
    email, password = get_credentials()
    return bool(email and password)


def _find_first(driver, selectors: list[str], timeout: float = 8):
    last_err: Exception | None = None
    for sel in selectors:
        try:
            return WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
            )
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    raise TimeoutException("No matching element for selectors")


def _click_first(driver, selectors: list[str], timeout: float = 5) -> bool:
    for sel in selectors:
        try:
            el = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
            )
            el.click()
            return True
        except Exception:
            continue
    return False


def _click_button_by_text(driver, texts: list[str]) -> bool:
    for text in texts:
        try:
            xpath = (
                "//button[contains(normalize-space(.), "
                f"'{text}')] | //a[contains(normalize-space(.), '{text}')]"
            )
            el = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, xpath))
            )
            el.click()
            return True
        except Exception:
            continue
    return False


def is_logged_in(driver) -> bool:
    """Best-effort check that the current Glassdoor session is authenticated."""
    focus_glassdoor_window(driver)
    url = (safe_current_url(driver) or "").lower()
    if "accounts.google.com" in url or "secure.indeed.com" in url:
        return False
    if "/member/profile/login" in url or "/profile/login" in url:
        return False
    try:
        html = (driver.page_source or "").lower()
    except Exception:
        return False
    # Signed-out homepage still shows a Sign In control in the nav.
    signed_out_markers = [
        'data-test="sign-in-button"',
        'data-test="unified-auth-indeed-button"',
        "continue with apple or email",
    ]
    if any(m in html for m in signed_out_markers):
        return False
    signed_in_markers = [
        'data-test="utility-nav-account"',
        'data-test="profile-nav"',
        "sign out",
        "/member/home",
        "/member/account",
    ]
    if any(m in html for m in signed_in_markers):
        return True
    # Cookie-based signal
    try:
        names = {c.get("name", "") for c in driver.get_cookies()}
    except Exception:
        names = set()
    return bool(names & {"gdId", "GSESSIONID", "AWSALBAppSession", "JSESSIONID"})


def save_session(driver, path: Path | str = DEFAULT_COOKIE_PATH) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    focus_glassdoor_window(driver)
    payload = {
        "url": safe_current_url(driver),
        "cookies": driver.get_cookies(),
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved Glassdoor session cookies to {path}")


def load_session(driver, path: Path | str = DEFAULT_COOKIE_PATH) -> bool:
    path = Path(path)
    if not path.exists():
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Could not read session file {path}: {e}")
        return False
    cookies = payload.get("cookies") or []
    if not cookies:
        return False
    try:
        open_url(driver, GLASSDOOR_SEEKER_HOME)
        driver.delete_all_cookies()
        for cookie in cookies:
            cookie = dict(cookie)
            cookie.pop("sameSite", None)
            # Selenium rejects expiry as float in some versions
            if "expiry" in cookie:
                try:
                    cookie["expiry"] = int(cookie["expiry"])
                except Exception:
                    cookie.pop("expiry", None)
            try:
                driver.add_cookie(cookie)
            except Exception:
                continue
        open_url(driver, GLASSDOOR_SEEKER_HOME)
        ok = is_logged_in(driver)
        print("Restored session cookies." if ok else "Saved session looks expired.")
        return ok
    except Exception as e:
        print(f"Failed to restore session: {e}")
        return False


def _bypass_cloudflare(driver, timeout: float = 45) -> None:
    """Best-effort Turnstile / CF challenge handling via SeleniumBase UC helpers."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        title = ""
        try:
            title = driver.title or ""
        except Exception:
            pass
        url = (safe_current_url(driver) or "").lower()
        html = ""
        try:
            html = (driver.page_source or "").lower()
        except Exception:
            pass
        blocked = (
            "just a moment" in title.lower()
            or "security check" in title.lower()
            or "additional verification" in title.lower()
            or "verify you are human" in html
        )
        if not blocked:
            return
        for meth in (
            "uc_gui_click_captcha",
            "uc_gui_handle_cf",
            "uc_gui_click_cf",
        ):
            fn = getattr(driver, meth, None)
            if callable(fn):
                try:
                    fn()
                    break
                except Exception:
                    continue
        time.sleep(2)
    # Leave final state to caller; may still be blocked on datacenter IPs.


def _switch_to_indeed_window(driver, previous_handles: set[str]) -> bool:
    try:
        handles = list(driver.window_handles)
    except Exception:
        return False
    for handle in handles:
        if handle in previous_handles:
            continue
        try:
            driver.switch_to.window(handle)
            url = (safe_current_url(driver) or "").lower()
            if "indeed.com" in url:
                return True
        except Exception:
            continue
    for handle in handles:
        try:
            driver.switch_to.window(handle)
            url = (safe_current_url(driver) or "").lower()
            if "indeed.com" in url:
                return True
        except Exception:
            continue
    return False


def automated_login(
    driver,
    email: str,
    password: str,
    *,
    cookie_path: Path | str = DEFAULT_COOKIE_PATH,
) -> None:
    """Log into Glassdoor via Indeed email/password SSO."""
    print("Attempting automated Glassdoor login via Indeed SSO...")
    open_url(driver, GLASSDOOR_LOGIN_URL)
    time.sleep(1.5)

    if is_logged_in(driver):
        print("Already logged in.")
        save_session(driver, cookie_path)
        return

    main_handle = driver.current_window_handle
    before = set(driver.window_handles)

    # Unified auth: "Continue with Apple or email" → Indeed
    if not _click_first(
        driver,
        ['[data-test="unified-auth-indeed-button"]'],
        timeout=10,
    ):
        if not _click_button_by_text(
            driver, ["Continue with Apple or email", "Continue with email"]
        ):
            raise RuntimeError("Could not find Indeed / email login button")

    time.sleep(2)
    auth_url = None
    if _switch_to_indeed_window(driver, before):
        auth_url = safe_current_url(driver)
        # Prefer solving CF in the main UC tab when possible.
        try:
            driver.close()
        except Exception:
            pass
        try:
            driver.switch_to.window(main_handle)
        except Exception:
            focus_glassdoor_window(driver)

    if auth_url and "indeed.com" in auth_url.lower():
        if hasattr(driver, "uc_open_with_reconnect"):
            driver.uc_open_with_reconnect(auth_url, reconnect_time=5)
        else:
            driver.get(auth_url)
    else:
        # Popup may have navigated same tab or failed; stay put.
        pass

    _bypass_cloudflare(driver)

    # Email step
    email_el = _find_first(driver, EMAIL_SELECTORS, timeout=20)
    email_el.clear()
    email_el.send_keys(email)
    time.sleep(0.4)
    if not _click_first(
        driver,
        [
            "button[type='submit']",
            "button[data-tn-element='auth-page-email-submit-button']",
            "button[data-testid*='continue' i]",
        ],
    ):
        if not _click_button_by_text(driver, ["Continue", "Sign in"]):
            raise RuntimeError("Could not submit email on Indeed login")

    time.sleep(2)
    _bypass_cloudflare(driver, timeout=20)

    # Password step
    password_el = _find_first(driver, PASSWORD_SELECTORS, timeout=20)
    password_el.clear()
    password_el.send_keys(password)
    time.sleep(0.4)
    if not _click_first(driver, ["button[type='submit']"]):
        if not _click_button_by_text(driver, ["Sign in", "Log in", "Continue"]):
            raise RuntimeError("Could not submit password on Indeed login")

    # Wait for OAuth redirect back to Glassdoor
    deadline = time.time() + 60
    while time.time() < deadline:
        if not browser_alive(driver):
            raise RuntimeError("Browser closed during automated login")
        focus_glassdoor_window(driver)
        url = (safe_current_url(driver) or "").lower()
        if "glassdoor.com" in url and "login" not in url and "auth" not in url:
            break
        if "glassdoor.com" in url and is_logged_in(driver):
            break
        _bypass_cloudflare(driver, timeout=5)
        time.sleep(1.5)

    focus_glassdoor_window(driver)
    try:
        open_url(driver, GLASSDOOR_SEEKER_HOME)
    except Exception:
        pass

    if not is_logged_in(driver):
        raise RuntimeError(
            "Automated login did not produce an authenticated Glassdoor session "
            "(Indeed/Cloudflare may be blocking this IP). "
            "Retry with --manual-login or from a residential network."
        )

    print("Automated login succeeded.")
    save_session(driver, cookie_path)


def ensure_login(
    driver,
    *,
    manual_login: bool = False,
    cookie_path: Path | str = DEFAULT_COOKIE_PATH,
) -> None:
    """Ensure an authenticated Glassdoor session.

    Order:
    1. Reuse saved cookies when present
    2. Automated email/password login when .env credentials exist (unless manual)
    3. Manual browser login pause
    """
    if load_session(driver, cookie_path):
        return

    email, password = get_credentials()
    if email and password and not manual_login:
        try:
            automated_login(driver, email, password, cookie_path=cookie_path)
            return
        except Exception as e:
            print(f"Automated login failed: {e}")
            if not manual_login:
                # Fall through to manual when a TTY is available.
                print("Falling back to manual login...")

    wait_for_manual_login(driver)
    if is_logged_in(driver) or "glassdoor.com" in (
        safe_current_url(driver) or ""
    ).lower():
        try:
            save_session(driver, cookie_path)
        except Exception:
            pass
