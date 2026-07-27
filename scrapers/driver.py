from __future__ import annotations

from seleniumbase import Driver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

# Prefer index.htm — Member/Community URLs 404 or push Google OAuth oddly.
GLASSDOOR_SEEKER_HOME = "https://www.glassdoor.com/index.htm"
GLASSDOOR_FALLBACK_HOME = "https://www.glassdoor.com/Search/results.htm?keyword=Goldman+Sachs"


def create_driver():
    """Launch undetected Chrome (no navigation yet)."""
    return Driver(uc=True)


def _is_recruiter_page(url: str) -> bool:
    return "/recruiter" in (url or "").lower()


def _is_google_login(url: str) -> bool:
    u = (url or "").lower()
    return "accounts.google.com" in u or "google.com/signin" in u


def safe_current_url(driver) -> str | None:
    """Return current URL, or None if the browser window is gone."""
    try:
        return driver.current_url
    except Exception:
        return None


def browser_alive(driver) -> bool:
    """Return True if at least one Selenium Chrome window is still open."""
    if safe_current_url(driver) is not None:
        return True
    try:
        handles = driver.window_handles
        if not handles:
            return False
        driver.switch_to.window(handles[-1])
        return safe_current_url(driver) is not None
    except Exception:
        return False


def focus_glassdoor_window(driver) -> bool:
    """Switch to a window whose URL is on glassdoor.com if one exists."""
    try:
        handles = list(driver.window_handles)
    except Exception:
        return False
    for handle in handles:
        try:
            driver.switch_to.window(handle)
            url = safe_current_url(driver) or ""
            if "glassdoor.com" in url.lower() and not _is_google_login(url):
                return True
        except Exception:
            continue
    # Fall back to any remaining window
    for handle in reversed(handles):
        try:
            driver.switch_to.window(handle)
            if safe_current_url(driver) is not None:
                return True
        except Exception:
            continue
    return False


def open_url(driver, url: str) -> None:
    """Navigate and wait until a Glassdoor (or Google login) page body is present."""
    if hasattr(driver, "uc_open_with_reconnect"):
        driver.uc_open_with_reconnect(url, reconnect_time=4)
    else:
        driver.get(url)

    WebDriverWait(driver, 20).until(
        EC.presence_of_element_located((By.TAG_NAME, "body"))
    )
    WebDriverWait(driver, 20).until(
        lambda d: safe_current_url(d) is not None
        and (
            "glassdoor" in (safe_current_url(d) or "").lower()
            or "accounts.google.com" in (safe_current_url(d) or "").lower()
        )
    )

    current = safe_current_url(driver) or ""
    title = ""
    try:
        title = driver.title or ""
    except Exception:
        pass

    if _is_recruiter_page(current) or "404" in title.lower():
        print("Bad landing page — opening a search page instead.")
        fallback = GLASSDOOR_FALLBACK_HOME
        if hasattr(driver, "uc_open_with_reconnect"):
            driver.uc_open_with_reconnect(fallback, reconnect_time=4)
        else:
            driver.get(fallback)
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )

    print(f"Page loaded: {safe_current_url(driver)}")


def install_web_driver(url: str):
    """Launch undetected Chrome and open url. Returns the driver."""
    driver = None
    try:
        driver = create_driver()
        open_url(driver, url)
        return driver
    except Exception as e:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        raise Exception(
            f"Failed to install web driver ({type(e).__name__}): {e!r}"
        ) from e


def wait_for_manual_login(driver, timeout_hint: str = "") -> None:
    """Pause so the user can sign into Glassdoor in the open browser."""
    while True:
        print()
        print("=" * 60)
        print("IMPORTANT: Keep the Selenium Chrome window open.")
        print("If Google opens a popup, finish login there, then return")
        print("to the original window — do NOT close the Selenium window.")
        print()
        print("1. Log in (email/password on Glassdoor is simplest).")
        print("2. Address bar must show glassdoor.com (not Google).")
        print(f"3. If stuck, paste: {GLASSDOOR_SEEKER_HOME}")
        print("4. Press Enter here only after step 2.")
        if timeout_hint:
            print(timeout_hint)
        print("=" * 60)

        current = safe_current_url(driver)
        if current is None:
            focus_glassdoor_window(driver)
            current = safe_current_url(driver)
        print(f"Current URL: {current or '(browser window looks closed)'}")

        try:
            input("Press Enter after you are logged in on Glassdoor... ")
        except EOFError:
            print("No interactive stdin; continuing without manual login pause.")
            return

        # Google OAuth may leave extra tabs — prefer a Glassdoor one.
        focus_glassdoor_window(driver)

        if not browser_alive(driver):
            print()
            print("Chrome window is closed.")
            print("Re-run the batch command and keep the Selenium window open.")
            raise RuntimeError("Browser window was closed during login")

        url = safe_current_url(driver) or ""
        if _is_google_login(url):
            print()
            print("Still on Google sign-in. Finish login until you're on Glassdoor.")
            continue
        if _is_recruiter_page(url):
            print()
            print("On Recruiter page — navigating to job-seeker home.")
            try:
                open_url(driver, GLASSDOOR_SEEKER_HOME)
            except Exception as e:
                print(f"Could not navigate: {e}")
            continue
        if "glassdoor.com" not in url.lower():
            print()
            print(f"Not on Glassdoor yet ({url or 'unknown'}).")
            print("Navigate to glassdoor.com in the Selenium window, then press Enter.")
            continue

        print("Continuing...")
        return
