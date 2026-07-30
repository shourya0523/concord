# GitHub Source Inventory for IB/PE Interview Corpus

Research date: 2026-07-27

Clones were made shallowly under `/tmp/github-research/` and were not copied into this repository.

## Executive recommendation

Best direct import candidates:

1. `ddeng5/Capital-Markets-Question-Bank-App` - strongest specified source. It contains a ready Firebase-export-style JSON corpus with 385 investment banking question/answer pairs across accounting, valuation, DCF, mergers, LBO, restructuring, EV/equity value, and behavioral categories.
2. `coryjburk/intv-playbook-ib_vc` - additional source found via web search. It contains 100 structured IB questions with model answers, technical deep dives, coaching notes, and metadata. High-value if license/permission is acceptable.
3. `coryjburk/intv-playbook-pe_vc` - additional source found via web search. It contains 100 structured PE/value-creation questions with model answers, deep dives, coaching notes, and metadata. Best PE-specific source found.
4. `offergenieai/Finance-Interview-Questions` - additional source found via `gh search`. It has 20 current finance/IB-style question titles but no answers; useful as low-volume prompt/title seed data.
5. `HireAbo/awesome-interview-questions-5000-jobs` - large but shallow. It has relevant IB/PE/finance Markdown files, usually five visible questions per job and no answers. Import only as low-priority question-only supplemental data.

Not recommended as corpus imports:

- The specified Glassdoor scraper repositories mostly contain scraper code, not bundled data.
- `mikinty/Trading-Interview-Questions` is useful for quant trading prep themes but is not an IB/PE corpus and has few discrete questions.

## Additional GitHub search results

Searches run:

- `gh search repos 'investment banking interview questions'`
- `gh search repos 'private equity interview questions'`
- `gh search repos 'investment banking technical questions'`
- `gh search repos 'private equity case study interview'`
- `gh search repos 'investment banking question bank'`
- `gh search code 'investment banking interview questions'`
- Web searches for GitHub-indexed IB/PE question banks and Glassdoor scraper patterns.

Directly useful additional repos found and inspected:

- `offergenieai/Finance-Interview-Questions`
- `coryjburk/intv-playbook-ib_vc`
- `coryjburk/intv-playbook-pe_vc`

Other leads found but not treated as corpus imports:

- `jordanmahmood/investment-banking-excel-lab` - modeling curriculum, not a question bank.
- `iamtorgo/awesome-private-equity` - resource list, not a corpus.
- Several LBO model repositories - modeling files/case studies, not interview Q/A banks.
- `moneybabe/glassdoor-interview-questions-scraper` appeared in web search, but the repository was not cloneable from this environment.

## Per-repository findings

### 1. ddeng5/Capital-Markets-Question-Bank-App

- Commit SHA: `05dca57601532f95f7be72b83b76ce80a5c7dcca`
- Default branch: `master`
- Relevant paths:
  - `www/investment-banking-qb-export.json`
  - `www/js/controllers.js`
  - `www/templates/*.html`
- Data format: Firebase Realtime Database export JSON. Top-level keys are categories; each category maps numeric IDs to `{question, answer}` objects.
- Question count / answer count: 385 questions / 385 answers.
- Category counts:
  - `understanding-banking`: 15
  - `warren-buffett`: 10
  - `why-banking`: 7
  - `failure`: 10
  - `outside-the-box`: 6
  - `restruct-distress`: 40
  - `accounting`: 33
  - `accounting-advanced`: 15
  - `enterprise-EV`: 15
  - `advanced-enterprise-EV`: 3
  - `valuation`: 35
  - `advanced-valuation`: 14
  - `dcf`: 32
  - `adv-dcf`: 7
  - `merger`: 24
  - `adv-merger`: 22
  - `lbo`: 22
  - `adv-lbo`: 11
  - `brainteaser`: 4
  - `analytical`: 9
  - `background`: 10
  - `career`: 6
  - `commitment`: 7
  - `culture`: 7
  - `future`: 4
  - `strength-weakness`: 9
  - `team`: 8
- IB coverage: High. This is a targeted investment banking technical/fit question bank.
- PE coverage: Partial. LBO, advanced LBO, Warren Buffett-style investing, restructuring, and valuation categories are relevant to PE, but the corpus is not PE-specific.
- Topic coverage: Accounting, advanced accounting, enterprise/equity value, valuation, DCF, merger models, LBO, restructuring/distress, M&A process, banking behaviorals, brainteasers, analytical questions.
- Duplicate rate estimate: 0 percent exact normalized duplicates among the 385 questions.
- Answer quality notes: Generally concise and importable model answers. Some answers are informal, dated, or framed as interview-coaching advice rather than final canonical answers. A normalization pass should remove `Question N:` prefixes and standardize punctuation.
- Import recommendation: Yes, high priority, subject to license/permission review.
- Useful implementation patterns:
  - Category-keyed JSON is easy to transform into a normalized corpus schema.
  - `controllers.js` shows the app selecting random questions by hard-coded category counts and fetching `question` / `answer` children from Firebase.
  - Template files are generic Ionic views binding `{{question}}` and `{{answer}}`; the JSON export is the authoritative data source.

### 2. Marvin-Deng/Interview-Scraper

- Commit SHA: `fcfad8f7358dfd2b6ca6278315a272859fa346f1`
- Default branch: `main`
- Relevant paths:
  - `main.py`
  - `scrapers/scraper.py`
  - `scrapers/exporter.py`
  - `scraper_utils/*.py`
  - `requirements.txt`
- Data format: Python Selenium scraper. Runtime exports to TXT, DOCX, CSV, or PDF. No bundled scraped question corpus.
- Question count / answer count: 0 bundled questions / 0 bundled answers.
- IB coverage: None in repo data. Coverage depends entirely on runtime company/position input.
- PE coverage: None in repo data. Coverage depends entirely on runtime company/position input.
- Topic coverage: Generic Glassdoor interview scraping.
- Duplicate rate estimate: Not applicable; no bundled data.
- Answer quality notes: No answers are collected. Export headers are `date_posted`, `user`, `experience`, `question`.
- Import recommendation: No for corpus import; partial for implementation-pattern review only.
- Useful implementation patterns:
  - Navigates from a company search page to interviews through `data-test="ei-nav-interviews-link"`.
  - Logs into Glassdoor using `.env` credentials.
  - Parses interview cards using CSS-module selectors such as `.InterviewContainer__InterviewDetailsStyles__interviewContainer` and `.interview-details__interview-details-module__interviewText`.
  - Paginates through `[aria-label="Next"]`.
  - Exports multiple formats through a common headers list.
- Risks:
  - CSS-module class names are brittle.
  - Requires login and browser automation.
  - No `__NEXT_DATA__`, GraphQL, or `QTN_` pattern found.

### 3. franziskavonalbedyll/GlassdoorInterviewExpert

- Commit SHA: `6e2ea076b28a012eac8e4bea4060dda4a1ae95c6`
- Default branch: `main`
- Relevant paths:
  - `src/get_interviewquestions_from_glassdoor.py`
  - `src/build_index.py`
  - `src/ask.py`
  - `src/create_result_files.py`
  - `questions.txt`
  - `main.py`
- Data format: Python scraper plus LangChain/Chroma/OpenAI summarization pipeline. Runtime writes `data/collected_questions.txt`; that generated data is not bundled.
- Question count / answer count: 0 bundled interview questions / 0 bundled answers. `questions.txt` contains 2 meta-prompts for summarization, not interview questions.
- IB coverage: None in bundled data.
- PE coverage: None in bundled data.
- Topic coverage: Generic Glassdoor interview-question collection and LLM summarization.
- Duplicate rate estimate: Not applicable; no bundled corpus.
- Answer quality notes: No direct answers. It summarizes scraped questions via GPT-4 when run.
- Import recommendation: No for corpus import; partial for implementation-pattern review.
- Useful implementation patterns:
  - Uses `undetected_chromedriver`.
  - Constructs paginated URLs by replacing `.htm` with `_P{page}.htm`.
  - Sleeps randomly 10 to 60 seconds per page.
  - Parses BeautifulSoup nodes whose `data-test` starts with `Interview` and ends with `QuestionsContainer`.
  - Cleans repeated UI text: `Interview Questions` and `Answer Question`.
  - Writes one question per line to `data/collected_questions.txt`.
- Risks:
  - Browser automation and random waits are slow.
  - No structured metadata beyond question text.
  - No `__NEXT_DATA__`, GraphQL, or `QTN_` pattern found.

### 4. williamxie11/glassdoor-interview-scraper

- Commit SHA: `465e8bd14b91277190bee0acfd056e695816e966`
- Default branch: `master`
- Relevant paths:
  - `scraper_v1.2.py`
  - `previous_versions/scraper_v1.0.py`
  - `previous_versions/scraper_v1.1.py`
  - `Review.py`
  - `README.md`
- Data format: Python 2 Selenium + BeautifulSoup scraper. Runtime exports `[company].json`, one object per interview review.
- Question count / answer count: 0 bundled questions / 0 bundled answers.
- IB coverage: None in repo data; runtime URL can target any Glassdoor company/role.
- PE coverage: None in repo data.
- Topic coverage: Generic Glassdoor interview reviews and questions.
- Duplicate rate estimate: Not applicable; no bundled data.
- Answer quality notes: No answers collected. Review object fields include date, role, offer outcome, experience, difficulty, length, details, and `questions`.
- Import recommendation: No for corpus import; partial for historical implementation patterns only.
- Useful implementation patterns:
  - Parses `li` nodes with classes `empReview` / `padVert`.
  - Extracts question text from `span.interviewQuestion`.
  - Removes `moreLink` / `link` "Show More" spans before text extraction.
  - Paginates with Glassdoor `_IP{page}.htm` URLs.
  - Polls when CAPTCHA or page load blocks are encountered.
  - Serializes Python objects to JSON via `obj.__dict__`.
- Risks:
  - Python 2 code and old Selenium APIs.
  - Hard-coded credentials and company URL in source.
  - Old DOM selectors are likely stale.
  - No `__NEXT_DATA__`, GraphQL, or `QTN_` pattern found.

### 5. jarus-singh/Glassdoor-Interview-Scraper

- Commit SHA: `c084025a33e58489bf8dfbc8845a9bbd69c96d32`
- Default branch: `master`
- Relevant paths:
  - `interview_parser.py`
  - `README`
- Data format: Python RSS parser writing `glassdoor_scraped_interviews.csv`.
- Question count / answer count: 0 question text / 0 answers.
- IB coverage: None.
- PE coverage: None.
- Topic coverage: Generic Glassdoor RSS interview metadata.
- Duplicate rate estimate: Not applicable; no question corpus.
- Answer quality notes: No answers and no actual interview question text.
- Import recommendation: No.
- Useful implementation patterns:
  - Iterates Glassdoor RSS feeds at `http://www.glassdoor.com/rss/interviews.rss?id={id}`.
  - Parses company name, interview difficulty, interview experience, offer status, helpfulness, and date from RSS HTML snippets.
- Risks:
  - Does not collect questions.
  - RSS endpoint may be deprecated.
  - Not useful for `__NEXT_DATA__`, GraphQL, or `QTN_`.

### 6. raghuboosetty/glassdoor-interview-questions-scrapper

- Commit SHA: `1084a839e0a015db6f8c4d2d9c14923202c8ab64`
- Default branch: `main`
- Relevant paths:
  - `glassdoor.py`
  - `README.md`
  - `cookies.json`
- Data format: Aborted Python Selenium/undetected-chromedriver script. Prints question text; does not create a structured corpus.
- Question count / answer count: 0 bundled questions / 0 bundled answers.
- IB coverage: None.
- PE coverage: None.
- Topic coverage: Generic Glassdoor question scraping attempt.
- Duplicate rate estimate: Not applicable; no bundled corpus.
- Answer quality notes: No answers collected.
- Import recommendation: No.
- Useful implementation patterns:
  - Attempts Chrome remote debugging on port 9222.
  - Uses cookies to preserve a Glassdoor/Google-authenticated session.
  - Tries CSS selectors:
    - `p[class='interview-details__interview-details-module__textStyle']`
    - fallback `span[class='mb-sm']`
- Risks:
  - README explicitly says the project is aborted.
  - Code has implementation issues, including `question.text()` instead of Selenium's `question.text` property.
  - Relies on local macOS chromedriver paths.
  - No `__NEXT_DATA__`, GraphQL, or `QTN_` pattern found.

### 7. HireAbo/awesome-interview-questions-5000-jobs

- Commit SHA: `837a40fbf61a502b3f6d68eca2d32c8d70e0eec5`
- Default branch: `main`
- Relevant paths:
  - `Business and Management/Finance/*.md`
  - Especially:
    - `Business and Management/Finance/Investment Banker.md`
    - `Business and Management/Finance/Private Equity Analyst.md`
    - `Business and Management/Finance/Mergers and Acquisitions MA Analyst.md`
    - `Business and Management/Finance/Corporate Finance Manager.md`
    - `Business and Management/Finance/Financial Analyst.md`
    - `Business and Management/Finance/Financial Modeller.md`
    - `Business and Management/Finance/Equity Research Analyst.md`
    - `Business and Management/Finance/Investment Analyst.md`
    - `Business and Management/Finance/Hedge Fund Manager.md`
    - `Business and Management/Finance/Quantitative Analyst Quant.md`
- Data format: Markdown pages. Each page has a role overview, a `Sample Questions` section, five visible questions, and a sixth outbound "CLICK HERE FOR MORE QUESTIONS" link.
- Question count / answer count:
  - Whole repo: 4,461 Markdown files, 22,303 visible numbered questions, 0 answers.
  - `Business and Management/Finance`: 50 files, about 250 visible questions, 0 answers.
  - Focused IB/PE/finance core sample checked: 14 files, 70 visible questions, 0 answers.
- IB coverage: Partial but shallow. `Investment Banker.md` has 5 visible IB questions.
- PE coverage: Partial but shallow. `Private Equity Analyst.md` has 5 visible PE questions.
- Topic coverage: Broad finance roles, including investment banking, private equity, M&A analyst, equity research, financial modeling, hedge funds, quant, fixed income, derivatives, portfolio management.
- Duplicate rate estimate:
  - Whole repo visible numbered questions: about 3.1 percent exact normalized duplicates.
  - Finance directory visible numbered questions: about 1.2 percent exact normalized duplicates.
- Answer quality notes: No answers. Questions are generic and often behavioral/role-description level rather than technical. Many pages are templated.
- Import recommendation: Partial, low priority. Useful as supplemental question-only seeds and role taxonomy, not as high-quality Q/A data.
- Useful implementation patterns:
  - Simple Markdown parsing by heading and numbered list.
  - File path gives coarse role taxonomy.
- Risks:
  - Most value appears gated behind external `hireabo.com` links.
  - Some generated copy is noisy, e.g. "Ready to Elevate Your Python Career?" appears on non-Python roles.

### 8. mikinty/Trading-Interview-Questions

- Commit SHA: `933451601c57ccd5e978988a4c0d844c9bd030d9`
- Default branch: `master`
- Relevant paths:
  - `README.md`
  - `chapters/math.md`
  - `chapters/brain.md`
  - `chapters/prob.md`
  - `chapters/games.md`
  - `chapters/market.md`
  - `chapters/general.md`
  - `appendix/sequences.md`
  - `site/src/games/*.tsx`
- Data format: Markdown curriculum plus a small React/Vite practice site for trading games.
- Question count / answer count: Approximately 29 question-mark occurrences across chapter Markdown; only about 2 to 3 explicit blockquote-style sample questions. No structured answer bank.
- IB coverage: None.
- PE coverage: None.
- Topic coverage: Quant trading, mental math, brainteasers, probability, expected value, betting/games, market making, order books, trading-firm interview process.
- Duplicate rate estimate: 0 percent among the small set of explicit blockquote questions.
- Answer quality notes: Explanatory prose is useful, but it is a curriculum rather than Q/A. Many examples are conceptual and not extracted as question/answer records.
- Import recommendation: No for IB/PE corpus; partial only if the pipeline later adds quant trading or market-making tracks.
- Useful implementation patterns:
  - Markdown chapter organization could seed topic taxonomy.
  - `site/src/games` shows interactive practice patterns for card-sum, market-finding, and betting games.

### 9. offergenieai/Finance-Interview-Questions

- Commit SHA: `b651edc039fe9fcded7a6b071eb65b23dfc76a5f`
- Default branch: `main`
- Relevant paths:
  - `README.md`
  - `.github/workflows/update-daily.yml`
- Data format: Markdown README table with company, question title, category, difficulty, and external practice link.
- Question count / answer count: 20 questions / 0 answers.
- IB coverage: Medium. Questions are from JPMorgan Chase and Goldman Sachs and include accounting, M&A, LBO, DCF, capital structure, and behavioral topics.
- PE coverage: Partial. LBO, PIK, dividend recap, and IRR topics are PE-adjacent.
- Topic coverage: Three-statement mechanics, asset write-downs, net debt, M&A accretion/dilution, enterprise value adjustments, LBO/private credit, DCF terminal value, goodwill impairment, dividend recapitalization, PIK toggle notes.
- Duplicate rate estimate: 0 percent exact normalized duplicates among 20 question titles.
- Answer quality notes: No answers in repo. The questions are title-like rather than full prompts, and links point back to OfferGenie.
- Import recommendation: Partial, low-to-medium priority as question-title seeds only.
- Useful implementation patterns:
  - Simple Markdown table parser.
  - Includes company and difficulty metadata.

### 10. coryjburk/intv-playbook-ib_vc

- Commit SHA: `c174e326e0325c31c50a734c71d86fae254f44b6`
- Default branch: `main`
- Relevant paths:
  - `index.html`
  - `README.md`
- Data format: Single-file HTML app with JavaScript data. Questions are constructed through `addQuestion(track, category, difficulty, question, competency, intent, answer, deep, coaching, redflag)`.
- Question count / answer count: 100 questions / 100 model answers. Also includes recruiter intent, technical deep dive, coaching note, and red flag per question.
- Category counts:
  - `Accounting & Financial Statements`: 9
  - `Enterprise & Equity Value`: 8
  - `Valuation & DCF`: 9
  - `Merger Models (Accretion / Dilution)`: 9
  - `LBO Fundamentals`: 7
  - `M&A Process & Deal Judgment`: 8
  - `Equity Capital Markets (ECM)`: 8
  - `Debt Capital Markets & Leveraged Finance`: 9
  - `Capital Structure & Financing Strategy`: 8
  - `Markets & Macro Awareness`: 8
  - `Restructuring & Special Situations`: 8
  - `Behavioral & Fit`: 9
- Difficulty counts:
  - Foundational: 24
  - Core: 30
  - Advanced: 24
  - Expert: 22
- IB coverage: High. Specifically built for investment banking associate preparation across M&A/coverage and capital markets.
- PE coverage: Partial through LBO, valuation, debt, restructuring, and deal judgment questions.
- Topic coverage: Accounting, EV/equity value, DCF, comps, precedent transactions, merger models, LBO, M&A process, ECM, DCM, leveraged finance, capital structure, macro awareness, restructuring, behavioral/fit.
- Duplicate rate estimate: 0 percent exact normalized duplicates.
- Answer quality notes: Strong. Answers are structured and interview-ready, with useful metadata. Some content may be institution-specific to Eccles MBA candidates and should be generalized if imported.
- Import recommendation: Yes, high priority if license/permission permits.
- Useful implementation patterns:
  - Rich structured record shape can map well to a corpus schema:
    - `track`
    - `category`
    - `difficulty`
    - `question`
    - `competency`
    - `recruiterIntent`
    - `conversational`
    - `deepdive`
    - `coaching`
    - `redFlag`
  - Browser-only heuristic scoring uses answer keyword/coverage, structure, precision, and delivery dimensions; useful for downstream practice UX ideas.

### 11. coryjburk/intv-playbook-pe_vc

- Commit SHA: `ae3b269379dd972277e6f3089e76b130ced1f098`
- Default branch: `main`
- Relevant paths:
  - `index.html`
  - `README.md`
- Data format: Single-file HTML app with JavaScript data. Questions are constructed through `addQuestion(track, category, difficulty, question, competency, intent, answer, deep, coaching, redflag)`.
- Question count / answer count: 100 questions / 100 model answers. Also includes recruiter intent, technical deep dive, coaching note, and red flag per question.
- Category counts:
  - `Accounting & Financial Statement Analysis`: 9
  - `Valuation & Modeling`: 7
  - `Leveraged Buyouts`: 11
  - `Investment Thesis & Deal Evaluation`: 9
  - `Due Diligence`: 8
  - `Market & Industry Analysis`: 6
  - `Value Creation`: 11
  - `Operational Excellence`: 9
  - `Strategic Finance`: 8
  - `Leadership & Change Management`: 8
  - `Board & Executive Communication`: 7
  - `PE-Backed Leadership Scenarios`: 7
- Difficulty counts:
  - Foundational: 20
  - Core: 36
  - Advanced: 30
  - Expert: 14
- IB coverage: Partial. Accounting, valuation/modeling, and deal evaluation overlap with IB.
- PE coverage: High. This is the best PE-specific Q/A source found.
- Topic coverage: LBOs, PIK, QoE, EBITDA normalization, valuation, investment thesis, diligence, industry analysis, value creation, operational excellence, strategic finance, board communication, PE-backed leadership.
- Duplicate rate estimate: 0 percent exact normalized duplicates.
- Answer quality notes: Strong. Model answers are compact and technical, though some phrasing is generic or slightly jargon-heavy. Institutional references should be generalized.
- Import recommendation: Yes, high priority if license/permission permits.
- Useful implementation patterns:
  - Same rich record shape as the IB playbook.
  - Separates Investment and Portfolio Operations tracks, useful for PE taxonomy.

## Glassdoor scraper pattern summary

Specified repositories:

- No specified Glassdoor repository used `__NEXT_DATA__`.
- No specified Glassdoor repository used GraphQL.
- No specified Glassdoor repository used `QTN_`.
- Most specified implementations are older Selenium/BeautifulSoup or RSS scrapers.

Patterns worth borrowing:

- Prefer stable `data-test` selectors when parsing rendered HTML. The most reusable specified example is `franziskavonalbedyll/GlassdoorInterviewExpert`, which finds `data-test` values starting with `Interview` and ending with `QuestionsContainer`.
- Preserve review-level metadata where available: date, role, offer outcome, experience, difficulty, process/details, and question list.
- Export a structured intermediate JSON/CSV before any LLM summarization.
- Add zero-result and pagination-stop checks to avoid silently importing empty pages.

Patterns to avoid or treat as legacy:

- CSS-module class names such as `.interview-details__interview-details-module__interviewText` and `.InterviewContainer__InterviewDetailsStyles__interviewContainer`; these are likely to rotate.
- Python 2 Selenium APIs and hard-coded local chromedriver paths.
- Hard-coded credentials or Glassdoor URLs in source.
- RSS-only parsing; it does not provide question text in the inspected repo.

Current external patterns found through web search:

- Modern Glassdoor pages may expose a Next.js/Apollo cache in `script#__NEXT_DATA__`, commonly under `props.pageProps.apolloCache`.
- Some pages or guides mention a fallback `apolloState` JavaScript blob.
- Apollo cache data often needs reference resolution for `{"__ref": "..."}` entries from `ROOT_QUERY`.
- More robust scrapers use internal BFF/API endpoints for employer interviews, with CSRF/session handling, TLS/browser impersonation, cookies, proxy support, retry logic, and challenge detection.
- Commercial/hosted scrapers report GraphQL interception for structured interview data fields such as job title, offer status, experience rating, difficulty, process description, questions asked, and answers submitted.

Pipeline implication:

- For corpus bootstrapping, import static GitHub Q/A sources first.
- For Glassdoor, do not build around the inspected legacy selectors as the primary path. If Glassdoor ingestion becomes a priority, prototype a structured extractor around `__NEXT_DATA__`/Apollo cache or BFF responses, with Selenium/Playwright only as a fallback for session bootstrap.

## Suggested import order

1. `ddeng5/Capital-Markets-Question-Bank-App`
2. `coryjburk/intv-playbook-ib_vc`
3. `coryjburk/intv-playbook-pe_vc`
4. `offergenieai/Finance-Interview-Questions`
5. Finance subset of `HireAbo/awesome-interview-questions-5000-jobs`
6. Optional quant/trading appendix: `mikinty/Trading-Interview-Questions`

