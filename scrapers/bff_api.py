"""Glassdoor interview scrape via internal BFF API + curl_cffi (no browser login).

Documented 2026 approach (Decodo / Live Proxies / Scraperly):
- Skip Selenium/Patchright + Indeed OAuth (Cloudflare on datacenter IPs).
- Impersonate Chrome TLS with curl_cffi (chrome136).
- POST /bff/employer-profile-mono/employer-interviews for structured JSON.
- Prefer a residential HTTPS_PROXY — datacenter ASNs get hard 403s.

Refs:
- https://decodo.com/blog/scrape-glassdoor
- https://liveproxies.io/blog/how-to-scrape-glassdoor
"""

from __future__ import annotations

import os
import random
import re
import time
from html import unescape
from typing import Any, Callable, Optional
from urllib.parse import quote_plus, urlparse

SITES = {
    "com": 1,
    "co.uk": 2,
    "ca": 3,
    "com.au": 4,
    "co.in": 115,
    "sg": 217,
    "de": 96,
    "fr": 84,
    "com.hk": 103,
    "co.nz": 160,
}

# Cloudflare whitelists specific TLS fingerprints; chrome136 passed Glassdoor
# tests in 2026 guides. Fall back through nearby Chrome builds if missing.
BROWSER_CANDIDATES = (
    "chrome136",
    "chrome131",
    "chrome124",
    "chrome120",
    "chrome",
)

EXTRA_FP = {
    "tls_permute_extensions": True,
    "tls_grease": True,
    "tls_cert_compression": "brotli",
    "tls_signature_algorithms": [
        "ecdsa_secp256r1_sha256",
        "rsa_pss_rsae_sha256",
        "rsa_pkcs1_sha256",
        "ecdsa_secp384r1_sha384",
        "rsa_pss_rsae_sha384",
        "rsa_pkcs1_sha384",
        "rsa_pss_rsae_sha512",
        "rsa_pkcs1_sha512",
    ],
}

CF_MARKERS = (
    "just a moment",
    "checking your browser",
    "cf-browser-verification",
    "challenges.cloudflare.com",
    "_cf_chl_opt",
    "attention required! | cloudflare",
    "sorry, you have been blocked",
    "enable javascript and cookies to continue",
    "security | glassdoor",
)


class CloudflareBlockError(RuntimeError):
    """Raised when Cloudflare blocks all attempts."""


def _proxy_url() -> Optional[str]:
    return (
        os.getenv("HTTPS_PROXY")
        or os.getenv("HTTP_PROXY")
        or os.getenv("GLASSDOOR_PROXY")
        or ""
    ).strip() or None


def _pick_browser() -> str:
    from curl_cffi import requests as curl_requests

    override = (os.getenv("CURL_CFFI_IMPERSONATE") or "").strip()
    candidates = (override,) + BROWSER_CANDIDATES if override else BROWSER_CANDIDATES
    for ver in candidates:
        if not ver:
            continue
        try:
            curl_requests.Session(impersonate=ver)
            return ver
        except Exception:
            continue
    return "chrome"


def create_session(proxy_url: Optional[str] = None):
    """Create a curl_cffi session with Chrome TLS/HTTP2 impersonation."""
    from curl_cffi import CurlOpt
    from curl_cffi import requests as curl_requests

    proxy = proxy_url if proxy_url is not None else _proxy_url()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    if proxy:
        host = urlparse(proxy).hostname or proxy.split("@")[-1]
        print(f"BFF: using proxy host={host}")
    else:
        print(
            "BFF: no HTTPS_PROXY set — datacenter IPs usually get Cloudflare 403. "
            "Set a residential proxy in .env / Cloud Agents Secrets."
        )

    browser = _pick_browser()
    print(f"BFF: impersonate={browser}")
    kwargs: dict[str, Any] = {
        "impersonate": browser,
        "proxies": proxies,
        "default_headers": True,
        "timeout": 30,
        "curl_options": {
            CurlOpt.TCP_FASTOPEN: 1,
            CurlOpt.TCP_KEEPALIVE: 1,
        },
    }
    try:
        session = curl_requests.Session(extra_fp=EXTRA_FP, **kwargs)
    except TypeError:
        # Older curl_cffi without extra_fp
        session = curl_requests.Session(**kwargs)

    session.headers.update(
        {
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
        }
    )
    return session


def is_challenge_page(resp) -> bool:
    status = getattr(resp, "status_code", 0) or 0
    text = (getattr(resp, "text", None) or "")[:8000].lower()
    headers = getattr(resp, "headers", {}) or {}
    if headers.get("cf-mitigated") == "challenge":
        return True
    if status in (403, 429, 503) and any(m in text for m in CF_MARKERS):
        return True
    if any(m in text for m in CF_MARKERS):
        return True
    if status == 403 and "application/json" not in (
        headers.get("content-type") or ""
    ):
        return True
    return False


def set_api_headers(session, base_url: str) -> None:
    session.headers.update(
        {
            "accept": "application/json",
            "content-type": "application/json",
            "origin": base_url,
            "referer": f"{base_url}/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }
    )
    session.headers.pop("sec-fetch-user", None)
    session.headers.pop("upgrade-insecure-requests", None)


def bootstrap_session(session, base_url: str, max_retries: int = 3) -> str:
    """Best-effort homepage load for cookies/CSRF. Proceeds even if challenged."""
    csrf = ""
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(base_url, timeout=20)
            if is_challenge_page(resp):
                print(
                    f"BFF bootstrap challenge (HTTP {resp.status_code}) "
                    f"attempt {attempt}/{max_retries}"
                )
                if attempt < max_retries:
                    time.sleep(3.0 * attempt + random.uniform(0.5, 1.5))
                    continue
                break
            html = resp.text or ""
            m = re.search(r'"token"\s*:\s*"([^"]+)"', html)
            if not m:
                m = re.search(r'gdCSRFToken\s*=\s*"([^"]+)"', html)
            if m:
                csrf = m.group(1)
            cookies = set(session.cookies.keys())
            print(f"BFF bootstrap OK cookies={sorted(cookies)[:12]} csrf={bool(csrf)}")
            return csrf
        except Exception as e:
            print(f"BFF bootstrap error attempt {attempt}: {e}")
            if attempt < max_retries:
                time.sleep(3.0 * attempt)
    print("BFF bootstrap incomplete — trying API anyway")
    return csrf


def _request(
    session,
    method: str,
    url: str,
    *,
    max_retries: int = 3,
    **kwargs,
):
    kwargs.setdefault("timeout", 25)
    last = None
    for attempt in range(1, max_retries + 1):
        if method.lower() == "post":
            resp = session.post(url, **kwargs)
        else:
            resp = session.get(url, **kwargs)
        last = resp
        if is_challenge_page(resp):
            delay = 4.0 * attempt + random.uniform(0, 2)
            print(
                f"BFF blocked HTTP {resp.status_code} on {url} "
                f"({attempt}/{max_retries}); sleep {delay:.1f}s"
            )
            time.sleep(delay)
            continue
        if resp.status_code >= 400:
            raise RuntimeError(
                f"BFF HTTP {resp.status_code} for {url}: {(resp.text or '')[:200]}"
            )
        return resp
    raise CloudflareBlockError(
        f"Cloudflare blocked {url} after {max_retries} tries. "
        "Set a residential HTTPS_PROXY (Cloud Agents Secrets / .env) and retry. "
        "Datacenter IPs cannot pass Glassdoor/Indeed Cloudflare."
    )


def lookup_employer(session, base_url: str, company: str) -> tuple[int, str]:
    """Resolve company name → (employer_id, employer_name) via typeahead."""
    url = (
        f"{base_url}/searchsuggest/typeahead"
        f"?numSuggestions=8&source=GD_V2&version=NEW"
        f"&rf=full&fallback=token&input={quote_plus(company)}"
    )
    resp = _request(session, "get", url)
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError(f"Unexpected typeahead payload for {company!r}")
    for item in data:
        cat = (item.get("category") or "").lower()
        if cat in ("company", "employer", "employers"):
            emp_id = item.get("employerId") or item.get("id")
            emp_name = item.get("suggestion") or company
            if emp_id:
                print(f"BFF resolved {company!r} → {emp_name} (id={emp_id})")
                return int(emp_id), str(emp_name)
    raise ValueError(f"No employer found for {company!r}")


def _strip_html(text: str) -> str:
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _question_texts(rd: dict) -> list[str]:
    raw = (
        rd.get("userQuestions")
        or rd.get("interviewQuestions")
        or rd.get("questions")
        or []
    )
    out: list[str] = []
    if isinstance(raw, list):
        for q in raw:
            if isinstance(q, dict):
                t = _strip_html(q.get("question") or q.get("text") or "")
            else:
                t = _strip_html(str(q))
            if t:
                out.append(t)
    elif isinstance(raw, str):
        t = _strip_html(raw)
        if t:
            out.append(t)
    return out


def _position_match(job_title: str, position: str) -> bool:
    if not position:
        return True
    title = (job_title or "").lower()
    pos = position.lower().strip()
    if not pos:
        return True
    if pos in title:
        return True
    # Token overlap: require majority of meaningful tokens
    noise = {"the", "a", "an", "and", "or", "of", "for", "in", "at", "to"}
    tokens = [t for t in re.split(r"[^a-z0-9]+", pos) if t and t not in noise]
    if not tokens:
        return True
    hits = sum(1 for t in tokens if t in title)
    return hits >= max(1, (len(tokens) + 1) // 2)


def parse_interview_record(rd: dict, *, position_filter: str = "") -> list[dict]:
    """Map one BFF interview object → zero or more bank-shaped question dicts."""
    raw_title = rd.get("jobTitle") or rd.get("jobTitleName") or ""
    if isinstance(raw_title, dict):
        job_title = str(
            raw_title.get("text") or raw_title.get("name") or ""
        )
    else:
        job_title = str(raw_title or "")

    if position_filter and not _position_match(job_title, position_filter):
        return []

    date_posted = (
        rd.get("reviewDateTime")
        or rd.get("interviewDateTime")
        or rd.get("dateTime")
        or rd.get("reviewDate")
        or ""
    )
    if isinstance(date_posted, (int, float)):
        date_posted = str(date_posted)

    experience = (
        rd.get("interviewExperience")
        or rd.get("experience")
        or rd.get("experienceLabel")
        or ""
    )
    if isinstance(experience, dict):
        experience = experience.get("label") or experience.get("text") or ""

    process = (
        rd.get("processDescription")
        or rd.get("interviewProcessDescription")
        or rd.get("advice")
        or rd.get("process")
        or ""
    )
    process = _strip_html(str(process or ""))

    difficulty = rd.get("difficulty") or rd.get("interviewDifficulty") or ""
    if isinstance(difficulty, dict):
        difficulty = difficulty.get("label") or difficulty.get("text") or ""
    outcome = rd.get("offerOutcome") or rd.get("outcome") or ""
    if isinstance(outcome, dict):
        outcome = outcome.get("label") or outcome.get("text") or ""

    meta_bits = []
    if difficulty:
        meta_bits.append(f"Difficulty: {difficulty}")
    if outcome:
        meta_bits.append(f"Outcome: {outcome}")
    if job_title:
        meta_bits.append(f"Title: {job_title}")
    if meta_bits:
        process = ((process + "\n") if process else "") + " | ".join(meta_bits)

    user = rd.get("user") or rd.get("reviewer") or ""
    if isinstance(user, dict):
        user = user.get("name") or user.get("displayName") or ""

    questions = _question_texts(rd)
    if not questions and process:
        # Still capture process-only cards as a single synthetic entry
        questions = [f"[Interview process] {job_title or 'Unknown role'}"]

    out = []
    for q in questions:
        out.append(
            {
                "date_posted": str(date_posted or ""),
                "user": str(user or ""),
                "experience": str(experience or ""),
                "process": process,
                "question": q,
                "job_title": job_title,
            }
        )
    return out


def _extract_interview_list(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in (
        "employerInterviews",
        "interviewReviews",
        "interviews",
        "reviews",
        "data",
        "employerInterviewReviews",
    ):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
        if isinstance(val, dict):
            for nested in ("reviews", "interviewReviews", "employerInterviews", "list"):
                inner = val.get(nested)
                if isinstance(inner, list):
                    return [x for x in inner if isinstance(x, dict)]
    # Deep search one level
    for val in payload.values():
        if isinstance(val, list) and val and isinstance(val[0], dict):
            sample = val[0]
            if any(
                k in sample
                for k in ("userQuestions", "interviewQuestions", "processDescription")
            ):
                return [x for x in val if isinstance(x, dict)]
    return []


def fetch_interview_page(
    session,
    base_url: str,
    employer_id: int,
    *,
    page: int = 1,
    items_per_page: int = 10,
    tld_id: int = 1,
    csrf: str = "",
) -> list[dict]:
    url = f"{base_url}/bff/employer-profile-mono/employer-interviews"
    payload: dict[str, Any] = {
        "employerId": employer_id,
        "dynamicProfileId": employer_id,
        "page": page,
        "itemsPerPage": items_per_page,
        "tldId": tld_id,
        "sort": "DATE",
        "language": "eng",
    }
    if csrf:
        payload["gdToken"] = csrf
    resp = _request(session, "post", url, json=payload)
    try:
        data = resp.json()
    except Exception as e:
        raise RuntimeError(
            f"BFF interviews non-JSON (HTTP {resp.status_code}): {(resp.text or '')[:300]}"
        ) from e
    return _extract_interview_list(data)


def scrape_company_interviews(
    company: str,
    position: str = "",
    *,
    site: str = "com",
    max_pages: int = 5,
    items_per_page: int = 10,
    sleep_seconds: float = 3.0,
    proxy_url: Optional[str] = None,
    on_page: Optional[Callable[[list[dict], int], None]] = None,
) -> tuple[list[dict], bool]:
    """Scrape interview questions for a company via BFF API.

    Returns (questions, completed). completed=False if Cloudflare/errors stop early.
    """
    site = (site or "com").lstrip(".")
    tld_id = SITES.get(site, 1)
    base_url = f"https://www.glassdoor.{site}"

    session = create_session(proxy_url)
    csrf = bootstrap_session(session, base_url)
    set_api_headers(session, base_url)

    try:
        employer_id, _name = lookup_employer(session, base_url, company)
    except CloudflareBlockError:
        raise
    except Exception as e:
        raise RuntimeError(f"Employer lookup failed for {company!r}: {e}") from e

    all_q: list[dict] = []
    completed = True
    for page in range(1, max_pages + 1):
        try:
            rows = fetch_interview_page(
                session,
                base_url,
                employer_id,
                page=page,
                items_per_page=items_per_page,
                tld_id=tld_id,
                csrf=csrf,
            )
        except CloudflareBlockError:
            completed = False
            raise
        except Exception as e:
            print(f"BFF page {page} error: {e}")
            completed = False
            break

        if not rows:
            print(f"BFF page {page}: empty — stopping")
            break

        page_questions: list[dict] = []
        for rd in rows:
            page_questions.extend(
                parse_interview_record(rd, position_filter=position)
            )

        print(
            f"BFF page {page}: {len(rows)} interviews → "
            f"{len(page_questions)} questions (position filter={position!r})"
        )
        all_q.extend(page_questions)
        if on_page:
            on_page(page_questions, page)

        if len(rows) < items_per_page:
            break
        time.sleep(sleep_seconds + random.uniform(0, 1.5))

    return all_q, completed
