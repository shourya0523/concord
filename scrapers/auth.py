"""Glassdoor login helpers (Google OAuth / Indeed SSO + cookie reuse)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

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


def login_method() -> str:
    """Return google | indeed | auto."""
    raw = (os.getenv("GLASSDOOR_LOGIN_METHOD") or "auto").strip().lower()
    if raw in {"google", "indeed", "auto"}:
        return raw
    return "auto"


def _totp_secret() -> Optional[str]:
    return (
        os.getenv("GLASSDOOR_TOTP_SECRET")
        or os.getenv("GOOGLE_TOTP_SECRET")
        or os.getenv("TOTP_SECRET")
        or ""
    ).strip() or None


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
                f" | //div[@role='button' and contains(normalize-space(.), '{text}')]"
                f" | //span[contains(normalize-space(.), '{text}')]"
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
    signed_out_markers = [
        'data-test="sign-in-button"',
        'data-test="unified-auth-indeed-button"',
        "continue with apple or email",
        "continue with google",
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


def _cf_blocked(driver) -> bool:
    title = ""
    try:
        title = (driver.title or "").lower()
    except Exception:
        pass
    html = ""
    try:
        html = (driver.page_source or "").lower()
    except Exception:
        pass
    return any(
        s in title
        for s in ("just a moment", "security check", "additional verification")
    ) or "verify you are human" in html or 'ctype: \'managed\'' in html.replace(
        " ", ""
    ).lower()


def _activate_chrome_window() -> Optional[str]:
    try:
        wins = (
            subprocess.check_output(
                [
                    "bash",
                    "-lc",
                    "xdotool search --onlyvisible --class google-chrome | head -1",
                ],
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
        if not wins:
            return None
        subprocess.run(
            ["xdotool", "windowactivate", "--sync", wins],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return wins
    except Exception:
        return None


def _click_turnstile_checkbox(driver) -> bool:
    """Locate the Turnstile checkbox via screenshot heuristics and click it."""
    try:
        from PIL import Image
        import numpy as np
    except Exception:
        return False

    win = _activate_chrome_window()
    if not win:
        return False
    try:
        geo = dict(
            line.split("=")
            for line in subprocess.check_output(
                ["xdotool", "getwindowgeometry", "--shell", win]
            )
            .decode()
            .strip()
            .splitlines()
        )
        wx, wy = int(geo["X"]), int(geo["Y"])
    except Exception:
        return False

    path = "/tmp/cf_turnstile_click.png"
    try:
        driver.save_screenshot(path)
    except Exception:
        return False

    im = Image.open(path).convert("RGB")
    arr = np.asarray(im)
    h, w = arr.shape[:2]
    gray = arr.mean(axis=2)

    # Prefer a bright ~300x65 widget in the middle of the page, checkbox on left.
    best = None
    for y in range(int(h * 0.2), int(h * 0.7)):
        for x in range(int(w * 0.25), int(w * 0.55)):
            block = gray[y : y + 65, x : x + 300]
            if block.shape != (65, 300):
                continue
            if block.mean() < 235:
                continue
            # checkbox-ish darker square near left
            box = gray[y + 18 : y + 42, x + 12 : x + 36]
            if box.size == 0:
                continue
            score = block.mean() - abs(box.mean() - 210)
            if best is None or score > best[0]:
                best = (score, x + 24, y + 32)

    if best is None:
        return False

    _, cx, cy = best
    try:
        offs = driver.execute_script(
            "return {oh:window.outerHeight,ih:window.innerHeight,"
            "ow:window.outerWidth,iw:window.innerWidth};"
        )
        chrome_y = int(offs["oh"] - offs["ih"])
        scale_x = float(offs["iw"]) / float(w)
        scale_y = float(offs["ih"]) / float(h)
    except Exception:
        chrome_y, scale_x, scale_y = 90, 1.0, 1.0

    sx = int(wx + cx * scale_x)
    sy = int(wy + chrome_y + cy * scale_y)
    subprocess.run(
        ["xdotool", "mousemove", "--sync", str(sx), str(sy), "click", "1"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return True


def _inject_capsolver_token(driver, token: str) -> None:
    driver.execute_script(
        """
        const token = arguments[0];
        const input = document.querySelector('[name="cf-turnstile-response"], input[name*="turnstile"]');
        if (input) {
          input.value = token;
          input.dispatchEvent(new Event('input', {bubbles:true}));
          input.dispatchEvent(new Event('change', {bubbles:true}));
        }
        if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
          try { /* noop */ } catch (e) {}
        }
        // Common CF callback hooks
        if (typeof window.tsCallback === 'function') { try { window.tsCallback(token); } catch(e){} }
        document.querySelectorAll('[name="cf-turnstile-response"]').forEach(el => {
          el.value = token;
        });
        """,
        token,
    )


def _solve_turnstile_capsolver(page_url: str, sitekey: str) -> Optional[str]:
    api_key = (
        os.getenv("CAPSOLVER_API_KEY")
        or os.getenv("CAPSOLVER_KEY")
        or ""
    ).strip()
    if not api_key or not sitekey:
        return None
    try:
        import requests
    except Exception:
        print("Capsolver requested but requests is unavailable.")
        return None

    print("Solving Cloudflare Turnstile via Capsolver...")
    create = requests.post(
        "https://api.capsolver.com/createTask",
        json={
            "clientKey": api_key,
            "task": {
                "type": "AntiTurnstileTaskProxyLess",
                "websiteURL": page_url,
                "websiteKey": sitekey,
            },
        },
        timeout=60,
    ).json()
    task_id = create.get("taskId")
    if not task_id:
        print(f"Capsolver createTask failed: {create}")
        return None
    for _ in range(60):
        time.sleep(2)
        res = requests.post(
            "https://api.capsolver.com/getTaskResult",
            json={"clientKey": api_key, "taskId": task_id},
            timeout=60,
        ).json()
        if res.get("status") == "ready":
            token = (res.get("solution") or {}).get("token")
            print("Capsolver returned a Turnstile token.")
            return token
        if res.get("status") == "failed" or res.get("errorId"):
            print(f"Capsolver failed: {res}")
            return None
    print("Capsolver timed out.")
    return None


def _extract_turnstile_sitekey(driver) -> Optional[str]:
    html = ""
    try:
        html = driver.page_source or ""
    except Exception:
        return None
    for pat in (
        r'data-sitekey="([^"]+)"',
        r'sitekey["\']?\s*[:=]\s*["\']([^"\']+)',
        r"(0x4[A-Za-z0-9_-]{20,})",
    ):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    try:
        key = driver.execute_script(
            """
            const el = document.querySelector('[data-sitekey],.cf-turnstile,[class*="turnstile"]');
            return el && (el.getAttribute('data-sitekey') || el.dataset.sitekey || null);
            """
        )
        if key:
            return key
    except Exception:
        pass
    return None


def _bypass_cloudflare(driver, timeout: float = 60) -> None:
    """Best-effort Managed Challenge / Turnstile handling."""
    deadline = time.time() + timeout
    page_url = safe_current_url(driver) or ""
    tried_capsolver = False

    while time.time() < deadline:
        if not _cf_blocked(driver):
            # still confirm email form isn't behind a soft wall
            return

        # 1) SeleniumBase UC GUI helpers
        for meth in (
            "uc_gui_click_captcha",
            "uc_gui_handle_cf",
            "uc_gui_click_cf",
        ):
            fn = getattr(driver, meth, None)
            if callable(fn):
                try:
                    fn()
                except Exception:
                    pass

        # 2) Screenshot + xdotool click on checkbox
        try:
            _click_turnstile_checkbox(driver)
        except Exception:
            pass

        # 3) Optional Capsolver token injection
        if not tried_capsolver and (
            os.getenv("CAPSOLVER_API_KEY") or os.getenv("CAPSOLVER_KEY")
        ):
            tried_capsolver = True
            sitekey = _extract_turnstile_sitekey(driver)
            token = _solve_turnstile_capsolver(page_url, sitekey or "")
            if token:
                try:
                    _inject_capsolver_token(driver, token)
                    # Reload with token often required for managed CF
                    if hasattr(driver, "uc_open_with_reconnect"):
                        driver.uc_open_with_reconnect(page_url, reconnect_time=5)
                    else:
                        driver.get(page_url)
                except Exception as e:
                    print(f"Capsolver token inject failed: {e}")

        # 4) Soft reload / reconnect after verification hints
        try:
            html = (driver.page_source or "").lower()
            if "verification successful" in html and hasattr(
                driver, "uc_open_with_reconnect"
            ):
                driver.uc_open_with_reconnect(page_url, reconnect_time=4)
        except Exception:
            pass

        time.sleep(2)


def _switch_to_window_matching(driver, predicate) -> bool:
    try:
        handles = list(driver.window_handles)
    except Exception:
        return False
    for handle in handles:
        try:
            driver.switch_to.window(handle)
            if predicate(safe_current_url(driver) or "", driver.title or ""):
                return True
        except Exception:
            continue
    return False


def _current_totp_code(secret: str) -> str:
    # Prefer oathtool when available (common on Cloud Agent images).
    try:
        out = subprocess.check_output(
            ["oathtool", "--totp", "-b", secret],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        if out:
            return out
    except Exception:
        pass
    try:
        import pyotp

        return pyotp.TOTP(secret).now()
    except Exception as e:
        raise RuntimeError(
            "TOTP secret set but neither oathtool nor pyotp is available"
        ) from e


def _handle_google_2fa(driver, timeout: float = 180) -> None:
    secret = _totp_secret()
    deadline = time.time() + timeout

    # Try switching to authenticator code entry when possible.
    if secret:
        _click_button_by_text(
            driver,
            ["Try another way", "More ways to verify", "Another way"],
        )
        time.sleep(1.5)
        _click_button_by_text(
            driver,
            [
                "Google Authenticator",
                "Authenticator",
                "Authentication app",
                "Enter a code from your authenticator app",
                "Get a verification code from the Google Authenticator app",
            ],
        )
        time.sleep(1.5)
        try:
            code_input = _find_first(
                driver,
                [
                    "input[type='tel']",
                    "input[name='totpPin']",
                    "input#totpPin",
                    "input[autocomplete='one-time-code']",
                ],
                timeout=8,
            )
            code_input.clear()
            code_input.send_keys(_current_totp_code(secret))
            if not _click_first(driver, ["#totpNext", "button"]):
                _click_button_by_text(driver, ["Next", "Verify", "Continue"])
            time.sleep(3)
            return
        except Exception as e:
            print(f"TOTP entry failed ({e}); waiting for device approval instead...")

    print(
        "Google 2FA required — approve the sign-in prompt on your phone "
        f"(waiting up to {int(timeout)}s)..."
    )
    while time.time() < deadline:
        url = (safe_current_url(driver) or "").lower()
        if "accounts.google.com" not in url:
            return
        if "challenge" not in url and "signin" not in url:
            return
        # Consent screens
        _click_button_by_text(driver, ["Continue", "Allow", "Confirm", "Yes"])
        time.sleep(2)
    raise RuntimeError(
        "Google 2FA was not completed in time. Set GLASSDOOR_TOTP_SECRET "
        "or approve the device prompt, then retry."
    )


def automated_login_google(
    driver,
    email: str,
    password: str,
    *,
    cookie_path: Path | str = DEFAULT_COOKIE_PATH,
) -> None:
    """Log into Glassdoor via Google OAuth (avoids Indeed Cloudflare)."""
    print("Attempting automated Glassdoor login via Google OAuth...")
    open_url(driver, GLASSDOOR_LOGIN_URL)
    time.sleep(1.5)
    if is_logged_in(driver):
        print("Already logged in.")
        save_session(driver, cookie_path)
        return

    main_handle = driver.current_window_handle
    before = set(driver.window_handles)

    clicked = False
    for b in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "Google" in (b.text or ""):
            b.click()
            clicked = True
            break
    if not clicked:
        raise RuntimeError("Could not find 'Continue with Google' button")

    WebDriverWait(driver, 20).until(lambda d: len(d.window_handles) > len(before))
    if not _switch_to_window_matching(
        driver, lambda url, title: "accounts.google.com" in url.lower()
    ):
        raise RuntimeError("Google sign-in window did not open")

    # Email
    email_el = _find_first(
        driver, ["#identifierId", "input[type='email']"], timeout=20
    )
    email_el.clear()
    email_el.send_keys(email)
    time.sleep(0.4)
    if not _click_first(driver, ["#identifierNext"]):
        _click_button_by_text(driver, ["Next"])
    time.sleep(2)

    # Password
    pw_el = _find_first(
        driver,
        ["input[name='Passwd']", "input[type='password']"],
        timeout=20,
    )
    pw_el.clear()
    pw_el.send_keys(password)
    time.sleep(0.4)
    if not _click_first(driver, ["#passwordNext"]):
        _click_button_by_text(driver, ["Next"])
    time.sleep(3)

    url = (safe_current_url(driver) or "").lower()
    if "challenge" in url or "signin/rejected" in url:
        _handle_google_2fa(driver)

    # Consent / return
    deadline = time.time() + 90
    while time.time() < deadline:
        if not browser_alive(driver):
            raise RuntimeError("Browser closed during Google login")
        if _switch_to_window_matching(
            driver,
            lambda u, t: "glassdoor.com" in u.lower()
            and "accounts.google.com" not in u.lower(),
        ):
            break
        _click_button_by_text(driver, ["Continue", "Allow", "Confirm"])
        # If Google window closed, jump back
        try:
            if main_handle in driver.window_handles:
                driver.switch_to.window(main_handle)
                if is_logged_in(driver):
                    break
        except Exception:
            pass
        time.sleep(1.5)

    focus_glassdoor_window(driver)
    try:
        open_url(driver, GLASSDOOR_SEEKER_HOME)
    except Exception:
        pass
    if not is_logged_in(driver):
        raise RuntimeError("Google OAuth completed but Glassdoor session is missing")
    print("Google OAuth login succeeded.")
    save_session(driver, cookie_path)


def automated_login_indeed(
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
    # Prefer a newly opened Indeed window when present.
    for handle in list(driver.window_handles):
        if handle in before:
            continue
        try:
            driver.switch_to.window(handle)
            url = safe_current_url(driver) or ""
            if "indeed.com" in url.lower():
                auth_url = url
                break
        except Exception:
            continue
    if auth_url is None and _switch_to_window_matching(
        driver, lambda url, title: "indeed.com" in url.lower()
    ):
        auth_url = safe_current_url(driver)

    if auth_url and "indeed.com" in auth_url.lower():
        try:
            if driver.current_window_handle != main_handle:
                driver.close()
        except Exception:
            pass
        try:
            driver.switch_to.window(main_handle)
        except Exception:
            focus_glassdoor_window(driver)
        if hasattr(driver, "uc_open_with_reconnect"):
            driver.uc_open_with_reconnect(auth_url, reconnect_time=8)
        else:
            driver.get(auth_url)

    _bypass_cloudflare(driver, timeout=75)

    try:
        email_el = _find_first(driver, EMAIL_SELECTORS, timeout=20)
    except Exception as e:
        url = safe_current_url(driver)
        title = ""
        try:
            title = driver.title or ""
        except Exception:
            pass
        raise RuntimeError(
            "Indeed login form did not appear after Cloudflare handling "
            f"(title={title!r}, url={url!r}). "
            "Indeed uses Cloudflare Managed Challenge which often blocks "
            "datacenter IPs. Prefer Google login (GLASSDOOR_LOGIN_METHOD=google), "
            "set CAPSOLVER_API_KEY, or use a residential HTTPS_PROXY."
        ) from e

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
    _bypass_cloudflare(driver, timeout=30)

    try:
        password_el = _find_first(driver, PASSWORD_SELECTORS, timeout=20)
    except Exception as e:
        raise RuntimeError(
            "Password field not found after submitting email on Indeed login."
        ) from e
    password_el.clear()
    password_el.send_keys(password)
    time.sleep(0.4)
    if not _click_first(driver, ["button[type='submit']"]):
        if not _click_button_by_text(driver, ["Sign in", "Log in", "Continue"]):
            raise RuntimeError("Could not submit password on Indeed login")

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
            "Automated Indeed login did not produce an authenticated Glassdoor session"
        )

    print("Indeed SSO login succeeded.")
    save_session(driver, cookie_path)


def automated_login(
    driver,
    email: str,
    password: str,
    *,
    cookie_path: Path | str = DEFAULT_COOKIE_PATH,
) -> None:
    """Choose the best automated login strategy."""
    method = login_method()
    prefer_google = method == "google" or (
        method == "auto" and email.lower().endswith("@gmail.com")
    )

    errors: list[str] = []
    if prefer_google and method != "indeed":
        try:
            automated_login_google(
                driver, email, password, cookie_path=cookie_path
            )
            return
        except Exception as e:
            errors.append(f"google: {e}")
            print(f"Google OAuth login failed: {e}")
            if method == "google":
                raise
            print("Falling back to Indeed SSO...")

    try:
        automated_login_indeed(driver, email, password, cookie_path=cookie_path)
        return
    except Exception as e:
        errors.append(f"indeed: {e}")
        if prefer_google and method == "auto":
            # Last try: google again after indeed failure (fresh page)
            try:
                automated_login_google(
                    driver, email, password, cookie_path=cookie_path
                )
                return
            except Exception as e2:
                errors.append(f"google-retry: {e2}")
        raise RuntimeError("; ".join(errors)) from e


def ensure_login(
    driver,
    *,
    manual_login: bool = False,
    cookie_path: Path | str = DEFAULT_COOKIE_PATH,
) -> None:
    """Ensure an authenticated Glassdoor session.

    Order:
    1. Reuse saved cookies when present
    2. Automated login when .env credentials exist (unless manual)
    3. Manual browser login pause
    """
    # Optional proxy hint for UC chrome (set before driver creation ideally)
    proxy = (os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or "").strip()
    if proxy:
        print(f"Proxy env detected ({urlparse(proxy).scheme}://{urlparse(proxy).hostname})")

    if load_session(driver, cookie_path):
        return

    email, password = get_credentials()
    if email and password and not manual_login:
        try:
            automated_login(driver, email, password, cookie_path=cookie_path)
            return
        except Exception as e:
            print(f"Automated login failed: {e}")
            print("Falling back to manual login...")

    wait_for_manual_login(driver)
    if is_logged_in(driver) or "glassdoor.com" in (
        safe_current_url(driver) or ""
    ).lower():
        try:
            save_session(driver, cookie_path)
        except Exception:
            pass
