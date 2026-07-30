from __future__ import annotations

import re
import time
from typing import Optional
from urllib.parse import quote_plus, urlparse, urlunparse, parse_qs, urlencode

from selenium.common.exceptions import (
    ElementClickInterceptedException,
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from scrapers.auth import ensure_login
from scrapers.driver import (
    GLASSDOOR_SEEKER_HOME,
    create_driver,
    install_web_driver,
    open_url,
)
from scrapers.exporter import (
    export_to_csv,
    export_to_txt,
    export_to_docx,
    export_to_pdf,
    export_to_json,
)
from scrapers.target_helpers import (
    FINANCE_BOOST_TERMS,
    FINANCE_PENALTY_TERMS,
    position_filter_candidates,
)


class GlassdoorScraper:
    def __init__(
        self,
        url: str,
        company: Optional[str] = None,
        driver=None,
        manual_login: bool = True,
        owns_driver: Optional[bool] = None,
    ) -> None:
        self.url: str = url
        self.company: Optional[str] = company
        self.curr_page: int = 1
        self.owns_driver = owns_driver if owns_driver is not None else driver is None

        if driver is None:
            # Start on homepage so user can log in before company navigation.
            self.driver = install_web_driver(GLASSDOOR_SEEKER_HOME)
            ensure_login(self.driver, manual_login=manual_login)
            open_url(self.driver, url)
        else:
            self.driver = driver
            open_url(self.driver, url)

        try:
            self._dismiss_overlays()
            self._get_company_overview()
            self._get_interview_page()
        except Exception as e:
            print(f"Initialization failed: {e}")
            if self.owns_driver:
                self._close_driver()
            raise

    def _close_driver(self) -> None:
        """Closes the web driver when this scraper owns it."""
        try:
            if self.driver and self.owns_driver:
                self.driver.quit()
                print("Quitted!")
        except Exception as e:
            print(f"Failed to close driver: {e}")

    def _dismiss_overlays(self) -> None:
        """Best-effort dismiss cookie / consent banners."""
        selectors = [
            "#onetrust-accept-btn-handler",
            'button[aria-label="Close"]',
            '[data-test="close-button"]',
        ]
        for sel in selectors:
            for el in self.driver.find_elements(By.CSS_SELECTOR, sel):
                try:
                    if el.is_displayed():
                        el.click()
                        time.sleep(0.3)
                except Exception:
                    pass
        for text in ("Accept All", "Accept Cookies", "I Accept", "Got it"):
            try:
                el = self.driver.find_element(
                    By.XPATH, f"//button[contains(., '{text}')]"
                )
                if el.is_displayed():
                    el.click()
                    time.sleep(0.3)
            except Exception:
                pass

    def _click_css(self, css_selector: str, timeout: int = 15):
        """Click first matching element; fall back to JS click if intercepted."""
        el = WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, css_selector))
        )
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, css_selector))
            )
            el.click()
        except (ElementClickInterceptedException, TimeoutException):
            self.driver.execute_script("arguments[0].click();", el)
        return el

    @staticmethod
    def _normalize_company_token(text: str) -> str:
        return "".join(ch.lower() if ch.isalnum() else " " for ch in (text or "")).split()

    @classmethod
    def _score_company_result(
        cls, company: str, href: str, link_text: str
    ) -> tuple[int, int]:
        """Return (match_score, review_hint) — higher is better."""
        company_tokens = cls._normalize_company_token(company)
        if not company_tokens:
            return (0, 0)

        href_lower = (href or "").lower()
        text_lower = (link_text or "").lower()
        slug = ""
        if "/overview/working-at-" in href_lower:
            slug = href_lower.split("/overview/working-at-", 1)[1]
            slug = slug.split("-ei_", 1)[0]
        slug_tokens = cls._normalize_company_token(slug.replace("-", " "))
        text_tokens = cls._normalize_company_token(text_lower)

        score = 0
        # Exact slug: Working-at-Carlyle or Working-at-The-Carlyle-Group
        company_slug = "-".join(company_tokens)
        if slug == company_slug or slug.endswith("-" + company_slug):
            score += 100
        if company_slug in slug:
            score += 40

        # All company tokens present in slug / visible text
        corporate_noise = {
            "the",
            "group",
            "inc",
            "incorporated",
            "llc",
            "ltd",
            "limited",
            "co",
            "company",
            "corp",
            "corporation",
            "partners",
            "lp",
            "plc",
        }
        if company_tokens and all(t in slug_tokens for t in company_tokens):
            score += 50
            # Prefer the firm page over subsidiaries ("Carlyle Aviation", etc.)
            extra = [
                t
                for t in slug_tokens
                if t not in company_tokens and t not in corporate_noise
            ]
            if not extra:
                score += 40
            else:
                score -= 25 * len(extra)
        if company_tokens and all(t in text_tokens for t in company_tokens):
            score += 30

        # Prefer starting with the company name over weak partials
        if text_tokens[: len(company_tokens)] == company_tokens:
            score += 25

        # Penalize long unrelated slugs that only share a weak token
        if len(slug_tokens) > len(company_tokens) + 4:
            score -= 10

        # Finance disambiguation: prefer capital/management firms over education/etc.
        blob = f"{slug} {text_lower}"
        for term in FINANCE_BOOST_TERMS:
            if term in blob:
                score += 35
                break
        for term in FINANCE_PENALTY_TERMS:
            if term in blob:
                score -= 80
                break

        # Tie-break: more reviews — only among similarly named matches
        review_hint = 0
        m = re.search(r"([\d.]+)\s*k?\s*reviews", text_lower)
        if m:
            raw = m.group(1)
            try:
                review_hint = int(float(raw) * 1000) if "k" in text_lower[m.start() : m.end()] else int(float(raw))
            except ValueError:
                review_hint = 0

        return (score, review_hint)

    def _get_company_overview(self) -> None:
        """Open the best-matching company overview from search results."""
        try:
            links = WebDriverWait(self.driver, 15).until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, "a[href*='/Overview/Working-at-']")
                )
            )
            company = self.company or ""
            candidates = []
            seen_hrefs = set()
            for link in links:
                href = link.get_attribute("href") or ""
                if not href or href in seen_hrefs:
                    continue
                seen_hrefs.add(href)
                text = (link.text or "").strip().replace("\n", " | ")
                score, reviews = self._score_company_result(company, href, text)
                candidates.append((score, reviews, href, text, link))

            if not candidates:
                raise Exception("No company Overview links found on search page")

            candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
            print(f"Search matches for {company!r}:")
            for i, (score, reviews, href, text, _) in enumerate(candidates[:8], start=1):
                label = text[:70] if text else href
                print(f"  {i}. score={score} reviews~{reviews} → {label}")

            best_score, _reviews, href, text, target = candidates[0]
            if best_score <= 0:
                raise Exception(
                    f"No good company match for {company!r}. "
                    "Top result looked unrelated — check targets.json naming."
                )

            print(f"Opening company overview: {href}")
            try:
                target.click()
            except ElementClickInterceptedException:
                self.driver.execute_script("arguments[0].click();", target)
            WebDriverWait(self.driver, 15).until(EC.url_contains("/Overview/"))
            print("In company overview")
        except Exception as e:
            print(f"Failed to get company overview: {e}")
            raise

    def _get_interview_page(self) -> None:
        """Enter the interview questions page from company overview."""
        try:
            selectors = [
                '[data-test="ei-nav-interviews-link"]',
                "a[href*='-Interview-Questions-']",
                "a[href*='/Interview/']",
            ]
            last_error = None
            for sel in selectors:
                try:
                    self._click_css(sel)
                    WebDriverWait(self.driver, 15).until(
                        EC.url_contains("/Interview/")
                    )
                    print("In interview page")
                    return
                except Exception as e:
                    last_error = e
            raise Exception(f"Could not open interviews page: {last_error}")
        except Exception as e:
            print(f"Failed to get interview page: {e}")
            raise

    def _search_questions_for_position(self, position: str) -> None:
        """Filter interview questions by job title via URL query param.

        Empty ``position`` clears the title filter (all interviews for employer).
        """
        try:
            parsed = urlparse(self.driver.current_url)
            # Always reset to the clean Interview URL path (drop prior filters).
            path = parsed.path or ""
            query: dict = {}
            if position.strip():
                query["filter.jobTitleFTS"] = [position.strip()]
                print(f"Filtering by position: {position.strip()}")
            else:
                print("Filtering by position: <none — all titles>")
            new_query = urlencode(query, doseq=True)
            filtered = urlunparse(parsed._replace(query=new_query, path=path))
            open_url(self.driver, filtered)
            time.sleep(2)
            self._dismiss_overlays()
        except Exception as e:
            print(f"Failed to search questions for position: {e}")
            raise

    def _switch_to_new_page(self) -> None:
        """Shift to the next page of interview results."""
        try:
            buttons = self.driver.find_elements(
                By.CSS_SELECTOR, 'button[aria-label="Next"]'
            )
            next_btn = None
            for btn in buttons:
                # Prefer pagination next over carousel next.
                cls = btn.get_attribute("class") or ""
                if "pagination" in cls.lower() or "ListItemButton" in cls:
                    next_btn = btn
                    break
            if next_btn is None and buttons:
                next_btn = buttons[0]
            if next_btn is None:
                raise NoSuchElementException("Next button not found")

            disabled = next_btn.get_attribute("disabled")
            aria_disabled = next_btn.get_attribute("aria-disabled")
            if disabled or aria_disabled == "true":
                raise Exception("Next button is disabled")

            try:
                next_btn.click()
            except ElementClickInterceptedException:
                self.driver.execute_script("arguments[0].click();", next_btn)
            self.curr_page += 1
            time.sleep(1.5)
        except Exception as e:
            print(f"Failed to switch to new page: {e}")
            raise

    def _parse_interview_questions(self) -> list:
        """Parse interview questions + blurred process text from the DOM.

        Glassdoor blurs some copy with CSS, but text remains in textContent.
        """
        try:
            containers = WebDriverWait(self.driver, 10).until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, '[data-test="question-container"]')
                )
            )
        except TimeoutException:
            print("No question containers found on this page.")
            return []

        interview_objects = []
        for container in containers:
            try:
                question_nodes = container.find_elements(
                    By.CSS_SELECTOR,
                    '[class*="TruncatedText"], [class*="textStyle"], [class*="InterviewDetail_textStyle"]',
                )
                question = ""
                for node in question_nodes:
                    # textContent ignores CSS blur / visibility.
                    text = (node.get_attribute("textContent") or "").strip()
                    if text and text.lower() not in ("answer question", "question 1"):
                        question = text
                        break
                if not question:
                    raw = (
                        self.driver.execute_script(
                            "return arguments[0].textContent;", container
                        )
                        or ""
                    )
                    lines = [
                        ln.strip()
                        for ln in raw.splitlines()
                        if ln.strip()
                        and not re.match(r"^Question\s+\d+$", ln.strip(), re.I)
                        and ln.strip().lower() != "answer question"
                    ]
                    question = lines[0] if lines else ""

                date_posted = ""
                user = ""
                experience = ""
                process = ""
                try:
                    card = container
                    for _ in range(8):
                        card = card.find_element(By.XPATH, "..")
                        card_html = card.get_attribute("outerHTML") or ""
                        card_text = (
                            self.driver.execute_script(
                                "return arguments[0].textContent;", card
                            )
                            or ""
                        )
                        looks_like_card = "Interview" in card_text and (
                            "experience" in card_text.lower()
                            or "Anonymous" in card_text
                            or "BlurredContent" in card_html
                            or re.search(
                                r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
                                card_text,
                            )
                        )
                        if not looks_like_card:
                            continue

                        lines = [
                            ln.strip() for ln in card_text.splitlines() if ln.strip()
                        ]
                        for ln in lines[:10]:
                            if (
                                not date_posted
                                and re.search(r"\d{4}", ln)
                                and "Interview" not in ln
                            ):
                                date_posted = ln
                            if "Anonymous" in ln or "Candidate" in ln:
                                user = ln
                            if re.search(
                                r"(positive|negative|neutral)\s+experience",
                                ln,
                                re.I,
                            ):
                                experience = ln

                        # Blurred interview narrative (process / "how it went").
                        blurred = card.find_elements(
                            By.CSS_SELECTOR,
                            '[class*="BlurredContent"] [class*="TruncatedText"], '
                            '[class*="BlurredContent"] [class*="textStyle"], '
                            '[class*="BlurredContent"]',
                        )
                        process_chunks = []
                        for node in blurred:
                            text = (node.get_attribute("textContent") or "").strip()
                            if (
                                text
                                and len(text) > 40
                                and text.lower() not in ("share your experience to get access",)
                                and "answer question" not in text.lower()
                            ):
                                # Prefer the longest unique narrative.
                                if not any(text in chunk or chunk in text for chunk in process_chunks):
                                    process_chunks.append(text)
                        if process_chunks:
                            process = max(process_chunks, key=len)

                        # Fallback: Interview section body near the questions.
                        if not process:
                            detail_nodes = card.find_elements(
                                By.CSS_SELECTOR,
                                '[class*="InterviewDetail_textStyle"], '
                                '[class*="InterviewDetail"] [class*="TruncatedText"]',
                            )
                            for node in detail_nodes:
                                text = (node.get_attribute("textContent") or "").strip()
                                if (
                                    text
                                    and len(text) > 60
                                    and text != question
                                    and "answer question" not in text.lower()
                                ):
                                    process = text
                                    break
                        break
                except Exception:
                    pass

                if question:
                    interview_objects.append(
                        {
                            "date_posted": date_posted,
                            "user": user,
                            "experience": experience,
                            "process": process,
                            "question": question,
                        }
                    )
            except Exception as e:
                print(f"Skipping a question card: {e}")

        return interview_objects

    def scrape_pages(
        self,
        position: str,
        max_pages: int = 50,
        on_page=None,
        track: str = "",
    ) -> tuple[list, bool]:
        """Filter by position (with fallbacks) and paginate interview questions.

        Returns (questions, completed). completed=True when pagination finishes
        normally (Next disabled / not interactable / no more pages).
        """
        filters = position_filter_candidates(position, track=track)
        questions: list = []
        completed = False
        active_filter = filters[0] if filters else position

        for filt in filters:
            active_filter = filt
            self._search_questions_for_position(filt)
            first_page = self._parse_interview_questions()
            if first_page or filt == filters[-1]:
                if first_page:
                    print(
                        f"Using filter {filt!r} → {len(first_page)} questions on page 1"
                    )
                break
            print(f"Filter {filt!r} returned 0 questions; trying fallback…")

        # Re-parse / paginate from the chosen filter (already loaded).
        page = 1
        # Seed page 1 results from the last parse above when available.
        try:
            page_questions = first_page  # type: ignore[name-defined]
        except NameError:
            page_questions = self._parse_interview_questions()

        while page <= max_pages:
            try:
                if page > 1:
                    page_questions = self._parse_interview_questions()
                questions.extend(page_questions)
                print(
                    f"Page: {page} ({len(page_questions)} questions) "
                    f"[filter={active_filter!r}]"
                )
                if on_page is not None:
                    on_page(page_questions, page)
                if page == 1 and not page_questions:
                    completed = True
                    print("No questions on page 1 — treating as complete.")
                    break
                page += 1
                self._switch_to_new_page()
            except Exception as e:
                message = str(e).lower()
                on_interview_page = "/Interview/" in (self.driver.current_url or "")
                # Hitting the last page is success, not failure.
                if on_interview_page and (
                    "next button is disabled" in message
                    or "next button not found" in message
                    or "element not interactable" in message
                    or "not interactable" in message
                ):
                    completed = True
                    print(f"Reached last page after {page - 1} page(s).")
                else:
                    print(f"Stopped pagination on page {page}: {e}")
                break
        else:
            # Hit max_pages without a clean end — treat as incomplete.
            print(f"Stopped at max_pages={max_pages} without reaching the end.")
        return questions, completed

    @staticmethod
    def scrape_company_questions(
        company: str,
        position: str,
        export_file: Optional[str] = None,
        driver=None,
        manual_login: bool = True,
        close_driver: bool = True,
        on_page=None,
        track: str = "",
        search_as: Optional[str] = None,
    ) -> tuple[list, bool]:
        """Scrape questions for a company/position; optionally export to a file.

        Returns (questions, completed).
        ``search_as`` overrides the Glassdoor search keyword (aliases).
        """
        keyword = (search_as or company or "").strip()
        search_url = (
            "https://www.glassdoor.com/Search/results.htm"
            f"?keyword={quote_plus(keyword)}"
        )
        headers = ["date_posted", "user", "experience", "question"]
        owns = driver is None
        scraper = GlassdoorScraper(
            search_url,
            company=keyword,
            driver=driver,
            manual_login=manual_login and owns,
            owns_driver=owns and close_driver,
        )

        try:
            questions, completed = scraper.scrape_pages(
                position, on_page=on_page, track=track
            )
        finally:
            if owns and close_driver:
                scraper._close_driver()

        if export_file:
            try:
                if export_file == "csv":
                    export_to_csv(
                        company=company, headers=headers, questions=questions
                    )
                elif export_file == "txt":
                    export_to_txt(
                        company=company, headers=headers, questions=questions
                    )
                elif export_file == "docx":
                    export_to_docx(
                        company=company, headers=headers, questions=questions
                    )
                elif export_file == "pdf":
                    export_to_pdf(
                        company=company, headers=headers, questions=questions
                    )
                elif export_file == "json":
                    export_to_json(
                        company=company, headers=headers, questions=questions
                    )
            except Exception as e:
                print(e)

        return questions, completed
