# Autonomous Full-Stack Build and Deployment Prompt

## Investment Banking and Private Equity Interview Preparation Platform

You are the principal engineer and technical programme lead for a long-running, autonomous software delivery effort.

You are responsible for coordinating multiple parallel engineering workstreams that will **extend this existing repository**, improve its data-collection infrastructure, build a production-ready full-stack application, validate its data, deploy the system, and document its ongoing operation.

You have access to the repository, shell, git, browser automation, databases, package managers, deployment tooling, configured secrets, object storage, background workers, web research, and any coding-agent skills available in the environment.

Do not stop after producing a plan, architecture document, mock-up, scaffold, database schema, or partial implementation.

Your task is to:

1. Audit the existing repository against the baseline inventory below (confirm, do not rediscover from zero).
2. Read and apply the Vercel and shadcn skills (and related skills listed in §2).
3. Define shared contracts that absorb the current JSON question-bank schema.
4. Divide implementation into parallel workstreams.
5. Extend the existing Glassdoor scraper (browser + BFF), do not rewrite it without justification.
6. Improve private-equity interview coverage (currently ~18 PE vs ~2,800+ IB in the bank).
7. Build an answer-acquisition and validation pipeline (Glassdoor is interview reports, not answers).
8. Build the complete Next.js frontend and backend product (replace the interim Flask browse UI).
9. Implement study, search, recommendation, and admin systems.
10. Test all critical workflows.
11. Deploy the application and workers.
12. Validate production.
13. Produce complete documentation and operational reports.

Work autonomously through routine technical decisions.

Do not ask for approval for ordinary implementation choices.

Only stop when a genuine external blocker prevents further progress, such as unavailable credentials, unavailable deployment permissions, a destructive migration risk, or a requirement that would involve prohibited access-control circumvention.

When one workstream is blocked, continue every other workstream that can proceed.

---

# 0. Current repository baseline (as of this prompt)

This repo is **Concord / GlassCleaner2**: a working Glassdoor interview-question scraper plus a local Flask bank browser. It is **not** an empty greenfield project and **not** yet a Next.js monorepo.

## 0.1 What already exists

| Area | Current state |
|------|----------------|
| Language / runtime | Python 3.12, `.venv`, `requirements.txt` |
| CLI entrypoint | `python main.py` with `login`, `batch`, `query`, `ui`, and legacy single-company scrape |
| Browser scrape | Selenium / SeleniumBase + Patchright `storage_state` (`scrapers/scraper.py`, `scrapers/auth.py`, `scrapers/session_state.py`, `scrapers/driver.py`) |
| Browserless scrape | `curl_cffi` BFF backend (`scrapers/bff_api.py`) → `POST /bff/employer-profile-mono/employer-interviews` |
| Batch orchestration | `scrapers/batch.py` — page-level saves, `completed_jobs`, `--force`, `--track`, `--limit`, `--backend browser\|bff` |
| Question bank | `data/question_bank.json` (~2,842 questions; ~2,824 IB / ~18 PE; 21 companies; 52 completed jobs) |
| Dedup | SHA1 `company\|position\|question` in `scrapers/bank.py` |
| Targets | `config/targets.json` — 30 firms (16 IB / 8 PE mega-funds / 6 Banking), role lists per firm |
| Local UI | Flask app `web/` on `:5050` — filter/search browse only (not the product UI) |
| Exports (single scrape) | txt / docx / csv / pdf / json via `scrapers/exporter.py` |
| Cloud / agent docs | `AGENTS.md`, `.cursor/install.sh`, `.cursor/start.sh`, `.env.example` |
| Secrets surface | `GLASSDOOR_*`, `HTTPS_PROXY`, `CAPSOLVER_API_KEY`, `GEMINI_API_KEY` (LLM reserved) |
| Tests / CI / Next.js / DB / Vercel app | **Absent on current mainline** |
| Monorepo (`apps/`, `packages/`) | **Absent** |

### Question-bank record shape (preserve as migration input)

```json
{
  "id": "sha1(company|position|question)",
  "company": "Goldman Sachs",
  "track": "IB",
  "position": "Investment Banking Analyst",
  "date_posted": "...",
  "user": "...",
  "experience": "...",
  "question": "...",
  "process": "...",
  "scraped_at": "ISO-8601"
}
```

Bank file also stores `version`, `updated_at`, `completed_jobs`.

### Known operational constraints (do not re-learn the hard way)

1. **Datacenter IPs** hit Cloudflare on Indeed Google OAuth (`secure.indeed.com`).
2. **Preferred cloud scrape path:** `python main.py batch --backend bff` with residential `HTTPS_PROXY`.
3. **Preferred interactive session path:** `python main.py login` (Patchright headed) → `data/glassdoor_state.json` (gitignored).
4. **Fallback:** home-network login, upload state; or `.env` auto-login + phone 2FA.
5. Legacy cookie jar: `data/glassdoor_session.json` (gitignored).
6. Without residential proxy, BFF interview calls typically return Cloudflare 403 even if typeahead resolves.

### Related but unmerged work

Open PR branch `local/ibpe-interview-corpus-042f` explored a fixture-first `ibpe_corpus` pipeline (SQLite/SQL migrations, GitHub source adapters, PE taxonomy YAML, exports/reports). **Evaluate reuse** of schemas, fixtures, and docs from that branch; do **not** assume it is merged. Prefer absorbing proven pieces into the contract-first architecture rather than forking a second corpus stack.

## 0.2 Non-negotiable preservation rules

* Do not delete or break `python main.py batch|query|login|ui` until a documented replacement exists.
* Do not discard `data/question_bank.json`; migrate it into the new data layers as the primary seed.
* Do not discard `config/targets.json`; extend it (PE matrix, role aliases) rather than replacing blindly.
* Treat `web/` Flask UI as an interim operator tool until the Next.js product ships; keep it runnable during migration or document its retirement explicitly.
* Keep Cloudflare / login workarounds documented in `AGENTS.md` and README in sync with code.
* Never commit real credentials, `glassdoor_state.json`, or `glassdoor_session.json`.

## 0.3 Current tree (authoritative starting layout)

```text
.
├── AGENTS.md
├── README.md
├── main.py
├── requirements.txt
├── .env.example
├── .cursor/
│   ├── environment.json
│   ├── install.sh
│   └── start.sh
├── config/
│   └── targets.json
├── data/
│   └── question_bank.json          # tracked; sessions gitignored
├── scrapers/
│   ├── auth.py
│   ├── bank.py
│   ├── batch.py
│   ├── bff_api.py
│   ├── driver.py
│   ├── exporter.py
│   ├── scraper.py
│   └── session_state.py
├── scraper_utils/
├── scripts/
│   └── guided_login.py
└── web/                            # Flask browse UI
    ├── app.py
    ├── static/
    └── templates/
```

---

# 1. Product mission

Build a distinctive, professional interview-preparation platform for:

* Investment Banking Analyst recruiting
* Investment Banking Associate recruiting
* Private Equity Analyst recruiting
* Private Equity Associate recruiting
* Growth Equity recruiting
* Restructuring recruiting
* Capital Markets recruiting
* Private Credit recruiting where relevant

The platform should help users:

* Discover high-quality interview questions
* Study validated answers
* Identify questions reported at specific firms
* Practise by topic, role, firm, and interview stage
* Complete realistic interview simulations
* Track confidence and mastery
* Review weak areas through spaced repetition
* Prepare against a target interview date
* Build behavioural and deal-experience responses
* Understand answer assumptions and common mistakes
* Distinguish reported content from editorially generated content
* View provenance and validation status
* Create notes, bookmarks, and custom collections
* Receive adaptive recommendations
* Measure firm-specific and role-specific readiness

The platform must not feel like a generic flashcard app, university learning-management system, HR portal, or templated SaaS dashboard.

It should feel like a premium, focused preparation environment for high-stakes finance interviews.

The current Flask bank browser is **not** this product; it is only a local data-inspection tool.

---

# 2. Required skill usage

Before making architectural or frontend implementation decisions, discover and read all relevant agent skills available in the environment.

You must specifically locate and read:

* The Vercel skill(s) (`vercel-cli`, `vercel-functions`, `deployments-cicd`, `env-vars`, `vercel-storage` as applicable)
* The Next.js skill (`nextjs`) and related (`next-cache-components`, `react-best-practices`, `routing-middleware`)
* The shadcn skill (`shadcn`)
* The Vercel AI SDK skill (`ai-sdk`) when building answer generation / streaming
* Auth skill (`auth`) when implementing authentication
* Any available accessibility, browser-testing, database, or Supabase skills that directly apply

In Cursor Cloud / plugin environments, skills typically live under paths resembling:

```text
~/.cursor/plugins/cache/cursor-public/<plugin-id>/<hash>/skills/<name>/SKILL.md
```

Examples that often exist in this environment:

```text
.../skills/nextjs/SKILL.md
.../skills/shadcn/SKILL.md
.../skills/ai-sdk/SKILL.md
.../skills/vercel-cli/SKILL.md
.../skills/vercel-functions/SKILL.md
.../skills/deployments-cicd/SKILL.md
.../skills/env-vars/SKILL.md
.../skills/auth/SKILL.md
.../skills/react-best-practices/SKILL.md
```

Discover the available skills rather than assuming exact paths. Also honour repo `AGENTS.md` for GlassCleaner2 / cloud scrape operations.

Create:

```text
docs/agent-run/skills-used.md
```

For each relevant skill, record:

* Skill name
* Location
* Date read
* Major architectural guidance
* Relevant implementation constraints
* Decisions influenced by the skill
* Areas where the repository already follows the skill
* Areas requiring migration or improvement

Treat those skills as the source of truth for implementation details involving:

* Next.js architecture
* React Server Components
* Client Component boundaries
* Data fetching
* Caching and revalidation
* Server Actions
* Route handlers
* Streaming
* Suspense
* Error boundaries
* Environment variables
* Vercel deployment
* Observability
* Edge versus Node runtimes
* Bundle optimisation
* Image and font handling
* shadcn component installation
* shadcn composition patterns
* Component ownership
* Accessibility
* Forms
* Dialogs
* Menus
* Command interfaces
* Theming
* Design tokens

When a skill conflicts with a personal implementation preference, follow the skill.

When a skill conflicts with a product requirement in this prompt, preserve the product requirement and adapt the technical implementation according to the skill.

When a skill conflicts with **Glassdoor access reality** documented in `AGENTS.md` (Cloudflare, BFF + residential proxy, Patchright session capture), preserve the access approach and adapt product architecture around it.

Do not merely mention the skills in documentation. Apply them to the implementation.

---

# 3. Core design direction

## Design language

Use a unique design system called:

**Editorial Finance Terminal**

The application should combine:

* Contrary Research’s private-market authority
* Premium financial editorial design
* Linear-like interaction precision
* Professional research-terminal density
* A focused, calm study experience
* Purposeful motion and state transitions

Use Contrary Research as the closest high-level visual reference without copying its brand, layouts, assets, illustrations, or content.

Use Finance|able as inspiration for animated editorial storytelling and typography scale.

Use Linear as inspiration for:

* Keyboard-first interaction
* Command navigation
* Speed
* Precise transitions
* Perceived responsiveness

Use shadcn/ui as the accessible component primitive layer.

The final product must not look like default shadcn.

Do not inherit the current Flask “Glassdoor-green” browse UI styling for the product.

---

# 4. Visual system

## 4.1 Typography

Create a three-role typography system.

### Display typeface

Use an editorial serif or expressive variable serif for:

* Landing-page headlines
* Major page introductions
* Interview prompts
* Section transitions
* Readiness statistics
* Milestone moments
* Empty states

Suitable directions include:

* Instrument Serif
* Newsreader
* Fraunces
* Another suitable editorial variable serif

### Interface typeface

Use a highly legible sans-serif for:

* Navigation
* Forms
* Search
* Filters
* Body text
* Answers
* Tables
* Admin interfaces
* Buttons

Suitable directions include:

* Geist
* Manrope
* Another distinctive sans (avoid defaulting to Inter/Roboto/Arial/system as the only brand voice)

### Monospace typeface

Use a restrained monospace for:

* Formulae
* Timers
* Keyboard shortcuts
* Question IDs
* Recruiting cycles
* Data confidence
* Validation labels
* Source metadata

Suitable directions include:

* Geist Mono
* JetBrains Mono
* IBM Plex Mono

Do not use monospace for long paragraphs.

Use bold typographic contrast and large question prompts.

Suggested scale:

```text
Marketing hero:         72–112px desktop
Page display:           48–72px
Section heading:        32–48px
Study question:         30–56px
Card or panel title:    18–24px
Body:                   15–18px
Metadata:               11–13px
Micro-label:            10–12px
```

Use responsive type scaling rather than fixed desktop-only values.

---

## 4.2 Colour

Use:

* Warm paper instead of pure white
* Near-black instead of pure black
* Soft graphite
* Pale stone
* Muted metadata colours
* One signature acid-lime or electric-chartreuse accent

Use the accent for:

* Primary actions
* Active study progress
* Selected filters
* Focus states
* Important status changes
* Completion moments
* Motion emphasis

Do not flood complete screens with the accent.

Avoid:

* Blue-purple SaaS gradients
* Rainbow analytics palettes
* Excessive glassmorphism
* Generic fintech blue
* Decorative neon effects
* Reusing Glassdoor brand green as the product identity

Dark mode should feel like an after-hours financial research terminal, not a basic inverted theme.

---

## 4.3 Shape and layout

Avoid placing every piece of content in a rounded card.

Use:

* Editorial rules
* Partial borders
* Vertical dividers
* Asymmetric grids
* Offset sections
* Oversized metrics
* Mixed-density layouts
* Full-width study canvases
* Narrow answer-reading columns
* Contextual side rails

Use pills only for compact metadata and filters.

Suggested geometry:

```text
Inputs and buttons:         8–10px radius
Standard panels:            12–16px radius
Floating study panels:      20–28px radius
Editorial sections:         0–8px radius
Compact metadata:           pill
```

Cards should represent real conceptual boundaries rather than act as the default layout mechanism.

---

## 4.4 Motion

Use the motion approach recommended by the current Vercel, React, Next.js, and shadcn skills.

Where compatible, prefer:

* Motion for React
* CSS transitions for micro-interactions
* View Transitions where appropriate
* Native browser capabilities over unnecessary dependencies

Motion must communicate:

* State
* Progress
* Navigation
* Hierarchy
* Reveal
* Spatial continuity

Implement:

* Shared-layout transitions
* Layered answer reveals
* Question-to-question transitions
* Filter result transitions
* Command-palette transitions
* Confidence-rating interactions
* Progress animations
* Session completion moments
* Subtle scroll composition on marketing pages
* Animated numeric changes

Avoid:

* Ambient decorative movement
* Slow page changes
* Excessive bounce
* Floating gradient blobs
* Motion that delays study actions
* Animations unrelated to user state

Support reduced-motion preferences everywhere.

Suggested timings:

```text
Micro-interaction:      100–180ms
Control transition:     160–240ms
Panel transition:       220–360ms
Page composition:       300–500ms
Milestone transition:   500–900ms
```

---

# 5. Parallel implementation model

Treat this project as a coordinated programme consisting of multiple senior engineering teams working concurrently.

The primary goal is to maximise parallel progress without creating incompatible implementations or severe merge conflicts.

The project must follow:

* Contract-first development
* Clearly separated ownership
* Small integration batches
* Continuous validation
* A continuously deployable main branch
* Explicit merge gates

Do not execute the entire project serially unless the environment cannot support parallel work.

**Important:** Parallel teams must not simultaneously rewrite `scrapers/bank.py`, `scrapers/batch.py`, or `data/question_bank.json` schema without a single owner and sequenced merges. Those files are hot paths today.

---

# 6. Initial coordination phase

Before feature implementation begins, perform a short coordination phase.

Complete the following:

1. Repository audit (confirm §0 baseline; note deltas)
2. Architecture decision record (monorepo evolution path from Python-first repo)
3. Dependency map (Python scrape stack vs Node product stack)
4. Data-flow diagram (Glassdoor → bank → pipeline layers → published app)
5. Shared domain model (map bank fields → canonical entities)
6. Database schema proposal
7. API contracts
8. Event and job contracts
9. Design-token definition
10. Component ownership map
11. Environment-variable inventory (merge `.env.example` + new Vercel/DB secrets)
12. Deployment topology (Vercel app ≠ scrape workers)
13. Workstream dependency graph
14. Integration and merge process
15. Decision: absorb vs ignore unmerged `ibpe-interview-corpus` artefacts

Create:

```text
docs/agent-run/execution-plan.md
docs/agent-run/dependency-graph.md
docs/agent-run/ownership-map.md
docs/agent-run/integration-plan.md
docs/agent-run/status.md
```

Do not wait for every detail to become perfect.

Freeze the minimum shared interfaces needed for parallel implementation, then begin work.

---

# 7. Shared contracts and target repo shape

Create a single source of truth for shared contracts.

**Evolve the existing Python package layout into a monorepo**; do not pretend the scraper does not exist.

Preferred end-state layout:

```text
apps/
  web/                      # Next.js product (Vercel)
  worker/                   # scrape / transform / validate jobs
  admin/                    # only if separate admin app is justified

packages/
  ui/                       # shadcn-based design system
  contracts/                # Zod (+ generated JSON Schema / OpenAPI)
  database/
  domain/
  ai/
  search/
  scraper/                  # wrap or relocate current scrapers/ + scraper_utils/
  validation/
  analytics/
  config/
  testing/

# Keep during migration (or relocate with shims):
main.py                     # thin CLI shim into packages/scraper or apps/worker
config/targets.json
data/question_bank.json
web/                        # Flask interim UI until Next.js ships
docs/
scripts/
fixtures/
exports/
reports/
```

Until the monorepo cutover lands, new contracts may start as:

```text
packages/contracts
packages/domain
packages/database
packages/ui
```

with the existing `scrapers/` package remaining the live crawl implementation and importing shared schemas once generated.

Before parallel feature work begins, establish those packages (or equivalent owned paths).

The shared contracts must define:

* Question schema (compatible with current bank fields + richer canonical model)
* Question-variant schema
* Interview-occurrence schema
* Source-record schema
* Answer schema
* Answer-validation schema
* Firm schema
* Role schema
* Topic taxonomy
* Practice-session schema
* Attempt schema
* Mastery schema
* Study-plan schema
* Search request and response schema
* API error schema
* Job-event schema
* Audit-event schema
* Status enums
* Provenance enums
* Validation enums
* Scrape-job / completed-job schema (absorb current `completed_jobs`)

Use runtime validation, not TypeScript types alone.

Suitable tools may include:

* Zod for TypeScript
* Pydantic for Python services (mirror contracts; do not diverge)
* Generated JSON Schema
* OpenAPI where appropriate

Do not maintain manually divergent schemas across languages.

Generate or synchronise shared schemas where possible.

Provide a one-shot importer:

```text
question_bank.json → raw/staging → canonical_questions + occurrences
```

that is idempotent and preserves existing `id` hashes as source keys.

---

# 8. Workstream organisation

## Workstream A — Architecture and platform foundations

Owns:

* Repository audit against §0
* Architecture
* Monorepo boundaries and migration shims for `main.py` / `scrapers/`
* Shared configuration
* Environment validation (extend `.env.example`)
* Authentication foundation
* Feature flags
* Runtime choices
* Logging conventions
* Error conventions
* Shared contracts
* Decision on absorbing `ibpe-interview-corpus` artefacts

Outputs:

```text
docs/research/repository-audit.md
docs/architecture.md
docs/decisions/
packages/contracts/
packages/config/
```

This workstream should unblock all other teams quickly.

---

## Workstream B — Design system and shadcn foundation

Owns:

* shadcn installation and configuration inside `apps/web` / `packages/ui`
* Component-generation strategy
* Design tokens (Editorial Finance Terminal)
* Typography
* Colour
* Theme
* Motion primitives
* Layout primitives
* Accessibility patterns
* Form patterns
* Command palette
* Navigation primitives
* Data-display components
* Loading and error states

The team must first read and follow the shadcn skill.

All reusable shadcn-based primitives must live in:

```text
packages/ui
```

No feature team should independently fork or restyle core primitives.

The design-system team should create reusable components such as:

* Button variants
* Input
* Select
* Multi-select
* Combobox
* Command menu
* Dialog
* Drawer
* Popover
* Tooltip
* Tabs
* Data table
* Pagination
* Status badge
* Metadata pill
* Metric display
* Editorial heading
* Question canvas
* Progress rail
* Answer section
* Formula block
* Source label
* Validation label
* Confidence control
* Mastery control
* Empty state
* Skeleton
* Error state
* Page transition
* Animated number
* Search palette

Where useful, build a development route or component catalogue showing every design-system state.

Do not ship default shadcn visual styling.

---

## Workstream C — Core frontend experience

Owns:

* App shell
* Onboarding
* Dashboard
* Question explorer
* Question detail
* Practice mode
* Interview simulator
* Notes
* Bookmarks
* Study plan
* Analytics
* User settings

Must consume design-system components from Workstream B.

Must not edit core shared components directly without coordination.

Must follow the Vercel and Next.js skills for:

* Server and Client Component boundaries
* Data loading
* Streaming
* Suspense
* Loading states
* Route structure
* Cache behaviour
* Error handling
* Metadata
* Fonts
* Images
* Bundle optimisation

May use fixtures / bank-import stubs before live APIs exist.

Must not treat the Flask `web/` UI as the product frontend.

---

## Workstream D — Backend and domain services

Owns:

* Authentication integration
* User profiles
* Questions API
* Search API
* Practice sessions
* Attempts
* Notes
* Bookmarks
* Study plans
* Mastery
* Recommendations
* Admin APIs
* Auditing
* Rate limits
* Business logic
* Importer API/CLI from `data/question_bank.json`

Must consume shared contracts.

Must not return untyped or undocumented response shapes.

Prefer Next.js Server Actions / route handlers per skills unless a separate service is justified.

---

## Workstream E — Database and data platform

Owns:

* Database schema
* Migrations
* Indexes
* Views
* Row-level access rules where applicable
* Data provenance
* Published data views
* Data retention
* Backups
* Query performance
* Seed process from `question_bank.json` and fixtures

This workstream is the only owner of core database migrations.

Other workstreams may propose schema changes through contract updates but must not independently create conflicting migrations.

---

## Workstream F — Glassdoor collection (extend existing)

Owns:

* Audit of current dual backends (`scrapers/scraper.py` browser DOM parse + `scrapers/bff_api.py` BFF JSON)
* Glassdoor frontend / BFF research updates
* Employer discovery (typeahead already exists in BFF path)
* Interview-page collection
* Pagination (browser Next-button + BFF `page` / `itemsPerPage`)
* Role filtering (position token match already partial in BFF)
* Private-equity expansion of `config/targets.json` and crawl coverage
* Raw evidence storage (today only bank JSON — add artefact archive)
* Parser fixtures (HTML + BFF JSON)
* Failure diagnostics (CloudflareBlockError, layout-change detection)
* Resume and checkpoint logic (extend `completed_jobs`)
* Incremental crawling
* Scraper tests
* Keeping `python main.py batch --backend bff|browser` working

The existing scraper **must be analysed and extended** rather than discarded without justification.

### Current capabilities to build on

* Company search / overview navigation (browser)
* Interview tab + position keyword filter (browser)
* Page-number pagination with per-page bank saves (browser)
* BFF employer lookup + paginated interviews (browserless)
* Overlay / cookie dismissal
* Patchright session capture and Selenium cookie hydrate
* Automated Google / Indeed login with optional TOTP and Capsolver hooks
* Exact-string dedup into JSON bank

### Current gaps to close

* Almost no PE volume relative to IB
* No durable raw HTML/JSON artefact store
* No answer extraction pipeline (process text ≠ validated answers)
* Limited role-alias / firm-alias resolution
* No layout-change detectors or fixture replay harness on mainline
* No structured logging / dead-letter queue
* Position match is heuristic; generic “Associate” false positives remain a risk for PE

---

## Workstream G — Data transformation and quality

Owns:

* Cleaning
* Record classification
* Extraction
* Grounding validation
* Normalisation
* Entity resolution
* Taxonomy assignment
* Deduplication (beyond current SHA1 exact match)
* Canonicalisation
* Quality scoring
* Publication gating
* Dataset exports
* One-shot and incremental import from `data/question_bank.json`

---

## Workstream H — Answers and financial validation

Owns:

* Answer-source import
* Answer generation (use `GEMINI_API_KEY` / AI SDK patterns where appropriate)
* Answer versioning
* Formula validation
* Accounting validation
* Valuation validation
* DCF validation
* M&A validation
* LBO validation
* PE-case validation
* Answer confidence
* Editorial review queue

Where AI functionality is used, follow the available Vercel AI SDK skill and current AI SDK patterns.

Do not build bespoke streaming or tool-calling infrastructure where the skill already defines a suitable pattern.

Never attribute generated answers to Glassdoor. Current bank `process` / experience fields are interview-report narrative, not editorial answers.

---

## Workstream I — Search and recommendations

Owns:

* Full-text search
* Trigram search
* Semantic search
* Embeddings
* Metadata filters
* Ranking
* Facets
* Weak-topic recommendation
* Firm preparation
* Role preparation
* Interview-date prioritisation
* Search evaluation

Replace the Flask substring filter (`/api/questions?q=`) with hybrid search for the product.

---

## Workstream J — Infrastructure and deployment

Owns:

* Vercel configuration for `apps/web`
* Preview deployments
* Production deployment
* Worker deployment for scrape / transform (not on Vercel request runtime)
* Database provisioning
* Object storage for raw artefacts
* Queues
* Scheduled jobs
* Environment variables (Cloud Agents Secrets + Vercel env)
* Monitoring
* Error tracking
* Backups
* CI/CD (currently absent on mainline — add)
* Deployment documentation
* Preserving local scrape DX documented in `AGENTS.md`

Must read and follow the Vercel skill before creating deployment architecture.

Do not assume every workload should run in a Vercel request runtime.

Place long-running scraping, batch extraction, and heavy data processing in appropriate worker infrastructure.

Residential `HTTPS_PROXY` for BFF crawls is an operational secret, not an app public env var.

---

## Workstream K — QA and integration

Owns:

* Contract enforcement
* Merge sequencing
* Regression tests for bank import and scrapers
* Integration tests
* End-to-end tests
* Accessibility testing
* Performance testing
* Production smoke tests
* Release checklist
* Final deployment verification
* Guarding CLI regressions (`main.py` commands)

No workstream should directly merge major changes to the production branch without passing integration gates.

---

# 9. Parallel coordination rules

Each workstream must maintain a short status entry in:

```text
docs/agent-run/status.md
```

Each update should record:

* Current objective
* Completed work
* Files changed
* Tests run
* Contract changes proposed
* Blockers
* Dependencies
* Integration notes

Use branches, worktrees, or isolated task environments.

Suggested branch or worktree names (repo convention: `local/<name>-<suffix>` when using Cloud Agents):

```text
architecture-foundation
design-system
frontend-product
backend-domain
database-platform
glassdoor-scraper
data-transformation
answer-validation
search-recommendations
infrastructure
qa-integration
```

Integration rules:

1. Shared contracts merge first.
2. Database migrations merge before dependent APIs.
3. Design tokens and UI primitives merge before feature pages.
4. API stubs or mocks may unblock frontend development.
5. Fixtures + existing `question_bank.json` may unblock pipeline development before live crawls complete.
6. Feature teams integrate in small batches.
7. Main must remain buildable; `python main.py query` must keep working throughout.
8. Broken integration branches must not block unrelated work.
9. Schema changes require contract updates.
10. Central files must have a single owner (`scrapers/bank.py`, `scrapers/batch.py`, `packages/contracts`, migrations).

Avoid parallel teams editing the same central files.

When unavoidable, sequence those changes deliberately.

---

# 10. Repository audit

Inspect and **confirm** (update the audit doc with measured facts):

* Git status / current branches / uncommitted work
* Package manager (pip today; add pnpm/npm for Next.js)
* Workspace configuration
* Languages (Python now; TypeScript to add)
* Frameworks (Flask interim; Next.js target)
* Existing frontend (`web/`)
* Existing backend (CLI + Flask API only)
* Database (none yet — JSON file)
* ORM (none)
* Authentication (Glassdoor scrape auth only — not end-user auth)
* Tests (none on mainline)
* Migrations (none on mainline)
* Deployment setup (Cursor cloud scripts only)
* Existing Glassdoor scraper (browser + BFF)
* Browser automation stack
* Existing datasets (`data/question_bank.json`)
* Environment files (`.env.example`)
* Queues / workers (none)
* Object storage (none)
* Monitoring / CI/CD (none)
* Documentation (`README.md`, `AGENTS.md`)
* Unmerged related branches (`ibpe-interview-corpus`, etc.)

Search for:

```text
glassdoor
interview
private equity
investment banking
scraper
crawler
playwright
patchright
selenium
seleniumbase
curl_cffi
bff
question_bank
answer
firm
fund
role
position
pagination
embedding
dedupe
canonical
taxonomy
worker
queue
cron
vercel
shadcn
flask
```

Protect uncommitted user work.

Do not perform destructive resets.

Create:

```text
docs/research/repository-audit.md
```

Include:

* Existing architecture
* Reusable components
* Technical debt
* Data-flow summary
* Security risks (secrets, committed bank PII-ish usernames, scrape cookies)
* Deployment risks
* Migration recommendations (JSON bank → Postgres; Flask → Next.js)
* Parallelisation opportunities
* Explicit PE coverage gap report

---

# 11. Recommended technical architecture

Preserve the existing scrape stack where sound.

For missing or incomplete product components, prefer:

## Web application

* Next.js App Router
* React
* TypeScript
* shadcn/ui
* Tailwind CSS or the styling approach required by the current shadcn skill
* Motion for React where justified
* Vercel-compatible architecture

## Scrape / workers (keep Python)

* Existing `scrapers/` + `curl_cffi` BFF + Patchright/Selenium
* Relocate into `packages/scraper` or `apps/worker` with CLI shims
* Run on worker hosts / scheduled jobs, not Vercel serverless request timeouts

## Database

* PostgreSQL
* A managed PostgreSQL provider
* pgvector or an equivalent vector capability
* Full-text search
* Trigram indexes

## Authentication (end-user product)

Support:

* Email magic links
* Google login where configured
* Secure local development mode

Do not confuse Glassdoor scrape login with end-user product auth.

## Object storage

Store:

* Raw HTML
* Raw BFF JSON pages
* PDFs
* Screenshots
* Fixtures
* Large exports

Use S3-compatible object storage, Supabase Storage, Vercel Blob, or an existing configured provider based on workload suitability and the Vercel skill’s guidance.

## Background jobs

Long-running scraping and transformation jobs must not run inside ordinary frontend request lifecycles.

Use an appropriate system such as:

* PostgreSQL-backed jobs
* Redis and BullMQ
* Managed queues
* Workflow orchestration
* Cron invoking `python main.py batch --backend bff ...`

## Deployment

Prefer:

* Vercel for the Next.js application
* Separate worker infrastructure for scraping and heavy batch processing
* Managed PostgreSQL
* Managed object storage
* GitHub Actions CI/CD (add; currently missing)

Use preview deployments for feature validation.

Local scrape DX remains:

```bash
source .venv/bin/activate
python main.py login
python main.py batch --backend bff --track PE --limit 1 --force
python main.py query --track PE
python main.py ui --port 5050
```

---

# 12. Glassdoor frontend and BFF research

The current system has two known product gaps:

1. It does not produce sufficient **answer** coverage (bank stores questions + process narrative).
2. It does not collect enough **private-equity** interview records (~18 PE vs ~2,800+ IB).

Before changing parsers, research how Glassdoor currently structures interview information — including the **BFF JSON** path already partially implemented.

Create / refresh:

```text
docs/research/glassdoor-frontend-analysis.md
docs/research/glassdoor-scraper-audit.md
```

Inspect normal browser-accessible data and document the existing BFF contract.

## 12.1 Rendered HTML (browser backend)

Identify:

* Interview-review boundaries
* Question sections
* Review descriptions / process text
* Job title
* Company
* Employer ID
* Location
* Interview date
* Difficulty
* Outcome
* Offer status
* Application method
* Interview process
* Pagination controls
* Total counts

## 12.2 Embedded state

Inspect for:

* React hydration state
* Next.js data
* Apollo cache
* Relay state
* Redux state
* JSON-LD
* Serialised page props
* Embedded JSON
* Structured script tags

Do not assume a frontend framework before observing it.

## 12.3 Browser network / BFF

Inspect browser-visible and already-coded:

* `POST /bff/employer-profile-mono/employer-interviews`
* Employer typeahead / lookup
* Fetch / XHR / GraphQL if present
* Pagination requests
* Filter requests
* JSON responses

Document:

* Request shape (known fields today: `employerId`, `dynamicProfileId`, `page`, `itemsPerPage`, `tldId`, `sort`, `language`, optional `gdToken`)
* Response shape (`userQuestions` / `interviewQuestions`, process fields, difficulty, outcome, job title)
* Stable identifiers
* Pagination type (numeric `page` on BFF; Next button on browser)
* Authentication / Cloudflare dependency
* TLS impersonation requirements (`curl_cffi` chrome fingerprints)
* Residential proxy necessity
* Data duplication between network responses and HTML
* Error conditions (`CloudflareBlockError`, hard 403)
* Rate and access limitations

Do not exploit private endpoints beyond normal browser-equivalent access already used by the product, and do not bypass access controls.

## 12.4 Pagination

Determine / confirm whether Glassdoor uses:

* Page numbers (BFF: yes)
* Offsets
* Cursors
* Continuation tokens
* Infinite scroll
* Load-more interactions
* Mixed server and client navigation (browser path)

Test:

* Duplicate reviews across pages
* Ordering stability (`sort: DATE`)
* Old-review accessibility
* Filter persistence
* Early termination
* Page-size variation (`itemsPerPage`, CLI `--pages`)

## 12.5 Fixture coverage

Capture sanitised fixtures for:

* Investment Banking Analyst
* Investment Banking Associate
* Private Equity Analyst
* Private Equity Associate
* Growth Equity Associate
* Large employers
* Small employers
* Empty results
* One-page results
* Multi-page results
* Partial-load states
* Consent states
* Logged-out states
* Layout variants
* Parser failures
* BFF success JSON
* BFF Cloudflare challenge HTML/body samples (sanitised)

Remove authentication secrets, cookies, tokens, and personal information.

---

# 13. Existing scraper audit and extension

Determine and document with file references:

* How company pages are discovered (`_get_company_overview`, BFF `lookup_employer`)
* How employer IDs are resolved
* How role filters work (`_search_questions_for_position`, `_position_match`)
* Whether office filters exist (today: no)
* How pagination works (browser Next; BFF page index)
* Whether complete review text is saved (`process` field — often blurred until login/force backfill)
* Whether exact questions are separated from narrative (partially: `question` vs `process`)
* Whether source evidence is retained (today: no raw archive)
* Whether raw HTML/JSON is archived (no)
* Whether incremental crawling exists (`completed_jobs` + per-page merge)
* Whether crawl checkpoints exist (job-level yes; page-level resume limited)
* Whether failed runs resume (re-run skips completed; retries incomplete)
* Whether duplicate reviews are prevented (exact hash only)
* Whether layout changes are detected (no)
* Whether zero-result anomalies are flagged (weak)
* Whether parser replay works (no fixture harness on mainline)
* Whether PE titles are covered (targets yes; yield no)

Extend the existing scraper with:

* Broader employer discovery / PE matrix
* Employer-ID resolution hardening
* Role aliases (especially PE)
* Office aliases where available
* Page and cursor pagination completeness
* Resume checkpoints finer than job-level
* Incremental crawling by content hash
* Raw artefact storage (HTML + BFF JSON)
* Parser-only mode / fixture replay
* Fixture-recording mode
* Dry-run mode
* Structured logs
* Screenshot capture on failure (browser path)
* Stable selector strategy + BFF-first extraction
* DOM fallback parsing
* Bounded retries
* Dead-letter handling
* Layout-change detection
* Idempotent writes
* Crawl-run summaries
* Keep `--backend bff` as default recommendation on cloud

Do not rely solely on generated CSS classes.

Prefer:

* BFF structured JSON
* Semantic HTML
* Accessibility labels
* Stable identifiers
* Data attributes
* Text relationships
* URL parameters
* Employer identifiers

Store one source-review record per interview report and separate child records for extracted questions (today one bank row per question string — migrate carefully).

---

# 14. Private-equity collection expansion

Create a dedicated PE discovery strategy. Current `config/targets.json` only lists eight mega-funds with Analyst/Associate titles — necessary but insufficient.

## Firm categories

Cover:

* Mega-funds (Blackstone, KKR, Carlyle, Apollo, TPG, Warburg Pincus, Bain Capital, Advent — already seeded)
* Large-cap buyout
* Upper-middle-market
* Middle-market
* Lower-middle-market
* Growth equity
* Technology private equity
* Healthcare private equity
* Consumer funds
* Infrastructure
* Energy
* Real estate private equity
* Secondaries
* Fund-of-funds
* Private credit
* Distressed investing
* Special situations

## Role aliases

Search and resolve:

* Private Equity Analyst
* Private Equity Associate
* Investment Analyst
* Investment Associate
* Associate
* Senior Associate
* Investment Professional
* Growth Equity Analyst
* Growth Equity Associate
* Buyout Associate
* Private Capital Analyst
* Portfolio Operations Associate
* Infrastructure Investment Analyst
* Real Estate Private Equity Analyst
* Private Credit Analyst

Do not classify every generic “Associate” record as private equity.

Use firm, division, page, job-title, and review context. Improve on BFF `_position_match` heuristics.

## PE topics

Classify:

* Paper LBO
* Full LBO modelling
* Sources and uses
* Debt schedules
* IRR
* MOIC
* Entry and exit assumptions
* Value-creation levers
* Investment thesis
* Market sizing
* Commercial diligence
* Unit economics
* Debt capacity
* Downside cases
* Management assessment
* Portfolio operations
* Case studies
* Deal discussions
* Why PE
* Why this fund
* Investment judgement
* Mental maths
* Accounting
* Valuation
* Behavioural questions

Use multiple sources rather than relying only on Glassdoor (GitHub public banks, guides, fixtures). Reuse ideas from unmerged corpus work where sound.

Success criterion: PE canonical volume and firm coverage must move from token presence (~18 rows) to the dataset targets in §42 without flooding false-positive Associates from banks.

---

# 15. Source registry

Create a configuration-driven source registry.

Every source must define:

* Source ID
* Source type
* Base URL or repository
* Discovery strategy
* Fetch method
* Parser
* Rendering requirement
* Authentication requirement
* Crawl interval
* Incremental-crawl support
* Rate limits
* Expected fields
* Quality tier
* Rights or use notes
* Failure policy

Source types may include:

* Glassdoor browser
* Glassdoor BFF API
* Local `question_bank.json` import
* Public GitHub datasets
* Public interview guides
* University resources
* Public forums
* Public PDFs
* Existing repository files
* User-provided data
* Search-discovered interview reports

Register the current bank as source `glasscleaner2_question_bank` with lineage retained.

Maintain source lineage throughout the pipeline.

---

# 16. Data architecture

Use explicit data layers:

```text
Raw
  ↓
Staging
  ↓
Normalised
  ↓
Canonical
  ↓
Validated
  ↓
Published
```

Bootstrap path for this repo:

```text
data/question_bank.json  →  Staging  →  …  →  Published
Glassdoor BFF/browser    →  Raw      →  …
```

## Raw

Preserve:

* URL
* Retrieval timestamp
* HTTP metadata
* HTML
* BFF JSON
* PDF
* Screenshot
* Source hash
* Main-content hash
* Browser mode (`browser` | `bff`)
* Crawl version
* Parser version
* Crawl status
* Cloudflare / proxy diagnostics (no secrets)

## Staging

Store:

* Exact source text
* Source span or JSON path
* Extracted question
* Extracted answer (if any)
* Firm
* Role
* Office
* Interview stage
* Reported date
* Record type
* Extraction confidence
* Validation issues
* Legacy bank `id` when imported

## Normalised

Normalise:

* Firm names
* Firm aliases
* Funds
* Parent organisations
* Roles
* Offices
* Dates
* Interview rounds
* Topic names
* Difficulty
* Whitespace
* Quotation characters
* Abbreviations
* Track (`IB` | `PE` | `Banking` | …)

Always preserve original values.

## Canonical

Create canonical question concepts with:

* Wording variants
* Interview occurrences
* Firm relationships
* Role relationships
* Topic relationships
* Follow-ups
* Answer versions
* Source references

## Validated

Only content passing defined quality thresholds becomes eligible for publication.

## Published

Optimise published tables or views for application queries.

The frontend should not query raw ingestion tables or the JSON bank file directly in production.

---

# 17. Core database entities

Implement entities equivalent to:

## Source layer

* `sources`
* `source_runs`
* `source_pages`
* `source_artifacts`
* `crawl_failures`

## Transformation layer

* `raw_records`
* `staging_records`
* `normalised_records`
* `validation_results`

## Question layer

* `canonical_questions`
* `question_variants`
* `question_occurrences`
* `question_relationships`
* `question_topics`
* `question_firms`
* `question_roles`

## Answer layer

* `answers`
* `answer_versions`
* `answer_sources`
* `answer_validation_results`

## Organisation layer

* `firms`
* `firm_aliases`
* `funds`
* `offices`
* `roles`
* `role_aliases`

## User layer

* `users`
* `user_profiles`
* `bookmarks`
* `notes`
* `collections`
* `question_attempts`
* `confidence_ratings`
* `mastery_records`
* `study_sessions`
* `study_session_questions`
* `study_plans`
* `review_queue`

## Administration

* `ingestion_jobs`
* `review_tasks`
* `merge_decisions`
* `audit_events`
* `feature_flags`

Add:

* Foreign keys
* Unique constraints
* Idempotency keys (include legacy bank hash ids)
* Search indexes
* Performance indexes
* Audit metadata

---

# 18. Record classification

Classify extracted content as:

* `exact_question`
* `paraphrased_question`
* `topic_signal`
* `interview_format`
* `preparation_advice`
* `source_answer`
* `not_relevant`

Examples:

```text
“Walk me through a DCF.”
→ exact_question
```

```text
“They asked me how a DCF works.”
→ paraphrased_question
```

```text
“There were several accounting and DCF questions.”
→ topic_signal
```

```text
“The Superday had four interviews.”
→ interview_format
```

A topic signal may affect coverage statistics but must not appear as an exact reported question.

When importing the current bank, classify carefully: some `question` values are synthetic process placeholders such as `[Interview process] …` from BFF fallback — do not publish those as exact questions.

---

# 19. Transformation and validation pipeline

Implement:

## Step 1 — Cleaning

Remove:

* Navigation
* Cookie banners
* Repeated chrome
* Promotional blocks
* Duplicate page elements

Preserve:

* Review boundaries
* Questions
* Answers
* Lists
* Tables
* Headings
* Interview-process structure

## Step 2 — Relevance classification

Determine whether each artefact contains:

* Interview questions
* Interview answers
* Interview-process information
* Technical learning material
* Firm-specific preparation
* No relevant content

## Step 3 — Structured extraction

Use strict schemas.

Do not allow free-form model output to write directly into published tables.

## Step 4 — Grounding validation

Verify:

* Exact question text exists in the source.
* Source-provided answer text exists in the source.
* Firm attribution is supported.
* Role attribution is supported.
* Unsupported metadata is null.
* Extracted spans can be inspected.
* Generated answers are never attributed to the source.

## Step 5 — Entity resolution

Resolve:

* Firm aliases
* Rebrands
* Parent and fund relationships
* Role aliases
* Offices
* Divisions
* Interview stages

## Step 6 — Taxonomy

Assign controlled topics and subtopics.

## Step 7 — Deduplication

Perform:

1. Exact normalised matching (current SHA1 is step 0, not sufficient)
2. Fuzzy matching
3. Embedding-neighbour retrieval
4. Model-assisted equivalence review

## Step 8 — Canonicalisation

Create a new canonical question only when it is materially distinct.

## Step 9 — Answer linkage

Link:

* Source-provided answers
* Imported answers
* Deterministic answers
* Editorial answers
* Generated answers

## Step 10 — Quality scoring

Calculate separate component scores.

## Step 11 — Publication gating

Publish only records that meet minimum quality and provenance requirements.

---

# 20. Deduplication

Treat these as likely equivalent:

```text
Walk me through a DCF.
Explain the steps in a DCF valuation.
How would you construct a DCF?
```

Treat these as related but distinct:

```text
Walk me through a DCF.
How do you calculate terminal value?
Why use unlevered free cash flow?
What happens when WACC increases?
```

Every merge must preserve:

* Original record
* Original wording
* Source occurrence
* Source evidence
* Confidence
* Merge reason
* Canonicaliser version
* Timestamp
* Legacy bank id when present

Merges must be reversible through the admin interface.

---

# 21. Answer acquisition

Glassdoor is an interview-report source, not a comprehensive answer source.

The current bank largely lacks answers; `process` is not an answer.

Build a separate answer pipeline.

Answer origins:

* `source_provided`
* `imported`
* `synthesised`
* `editorial`
* `deterministic_calculation`

Validation states:

* `unvalidated`
* `automatically_validated`
* `cross_source_validated`
* `needs_review`
* `rejected`

Every answer version must include:

* Origin
* Status
* Version
* Assumptions
* Source references
* Validator version
* Validation results
* Last validation date

Never imply that a generated answer came from Glassdoor.

`GEMINI_API_KEY` is already reserved in `.env.example` for LLM features — wire it through the AI SDK skill patterns rather than ad-hoc clients where possible.

---

# 22. Financial answer validation

Create deterministic and rule-based validation wherever possible.

## Accounting

Validate:

* Three-statement effects
* Cash versus non-cash effects
* Taxes
* Working capital
* Depreciation
* Amortisation
* Deferred taxes
* Goodwill
* Impairment
* Stock-based compensation
* Capitalisation versus expensing

## Valuation

Validate:

* Enterprise value
* Equity value
* Diluted shares
* Debt-like items
* Cash
* Investments
* Non-controlling interests
* Pension adjustments
* Trading multiples
* Precedent transactions

## DCF

Validate:

* Unlevered free cash flow
* WACC
* Cost of equity
* Cost of debt
* Terminal growth
* Exit multiple
* Present value
* Mid-year convention
* Sensitivities

## M&A

Validate:

* Purchase consideration
* Financing
* Accretion and dilution
* Synergies
* Purchase-price allocation
* Goodwill
* Taxes

## LBO and PE

Validate:

* Sources and uses
* Debt tranches
* Debt paydown
* Cash sweep
* Minimum cash
* Entry and exit assumptions
* IRR
* MOIC
* Management rollover
* Value-creation bridge
* Downside scenarios

Create deterministic calculators and test fixtures for numerical examples.

Surface assumptions instead of hiding uncertainty.

---

# 23. Quality scoring

Maintain separate scores for:

* Source quality
* Extraction confidence
* Grounding
* Metadata completeness
* Wording confidence
* Answer confidence
* Answer correctness
* Corroboration
* Recency
* Canonicalisation confidence

Do not reduce all quality information to one opaque score.

Suggested publication requirements:

```text
Reported question:
- Grounding passes
- Firm attribution is supported when shown
- Record is exact or paraphrased
- Quality threshold passes

Generated editorial question:
- Clearly labelled
- Taxonomy assigned
- Answer validated
- Not presented as reported

Answer:
- Origin known
- Assumptions explicit
- Validation threshold passes
```

---

# 24. Frontend application

Build the following product surfaces in Next.js (not Flask):

* Marketing page
* Authentication
* Onboarding
* Home dashboard
* Question explorer
* Question study page
* Practice session
* Interview simulator
* Firm preparation
* PE preparation
* Study planner
* Notes
* Bookmarks
* Collections
* Analytics
* User settings
* Admin console

Keep Flask `web/` available as an operator bank browser until feature parity for search/browse exists, then document deprecation.

---

# 25. Signature question experience

The question-study experience should be the product’s defining interaction.

Before answer reveal, prioritise:

* Large question typography
* Topic and difficulty
* Thinking timer
* Confidence selection
* Optional hint
* Reveal action

Reduce unnecessary navigation chrome during focused study.

Reveal answers in stages:

1. Direct answer
2. Interview-ready explanation
3. Step-by-step walkthrough
4. Formulae or calculations
5. Assumptions
6. Common mistakes
7. Follow-up questions
8. Related concepts
9. Sources
10. Provenance and validation

Do not implement the answer as a generic accordion.

Use a layered editorial reveal that preserves reading focus.

Add keyboard controls for:

* Reveal
* Next
* Previous
* Bookmark
* Add note
* Rate confidence
* Mark mastery

---

# 26. Dashboard

The dashboard should not be a uniform grid of generic cards.

Use an asymmetric editorial composition.

Display:

* Today’s review queue
* Days until interview
* Overall mastery
* Firm readiness
* Role readiness
* Private-equity readiness
* Weak topics
* Study streak
* Recent sessions
* Recommended session
* Progress trends

Use oversized metrics, editorial rules, mixed-width panels, and meaningful hierarchy.

---

# 27. Question explorer

Support:

* Keyword search
* Semantic search
* Typo tolerance
* Firm filtering
* Fund filtering
* Role filtering
* Office filtering
* Topic filtering
* Subtopic filtering
* Difficulty
* Interview stage
* Reported versus editorial
* Answer availability
* Answer validation
* Recruiting cycle
* IB versus PE
* Source confidence

Allow sorting by:

* Relevance
* Frequency
* Recency
* Difficulty
* Quality
* Firm relevance

Support:

* Saved searches
* Saved filters
* Filter counts
* Keyboard navigation
* Command-palette entry

---

# 28. Practice modes

Implement:

* Random technical drill
* Accounting drill
* Valuation drill
* DCF drill
* M&A drill
* LBO drill
* PE case drill
* Behavioural drill
* Firm-specific drill
* Role-specific drill
* Weak-topic drill
* Timed drill
* Difficulty progression
* Spaced-repetition review

Freeze the selected question membership when a session starts.

A session must remain reproducible even when the underlying dataset changes later.

---

# 29. Interview simulations

Implement configurable interview simulations.

## Investment banking simulation

Possible stages:

* Personal story
* Why banking
* Why this firm
* Accounting
* Valuation
* DCF
* M&A
* Markets
* Deal discussion
* Behavioural

## Private equity simulation

Possible stages:

* Background
* Why PE
* Why this fund
* Deal experience
* Technical questions
* Paper LBO
* Investment thesis
* Case study
* Downside case
* Portfolio scenario
* Behavioural

Support:

* Timed responses
* Self-rating
* Notes
* Follow-up sequencing
* Answer comparison
* Final readiness report
* Topic-specific recommendations

---

# 30. Study engine

Implement:

* Spaced repetition
* Adaptive review
* Confidence tracking
* Mastery tracking
* Weak-topic prioritisation
* Topic prerequisites
* Firm frequency
* Role relevance
* Interview-date urgency
* Difficulty progression

Allow ratings such as:

* Again
* Hard
* Good
* Easy

Version the spaced-repetition algorithm.

Do not overwrite historical scheduling assumptions when the algorithm changes.

---

# 31. Study plans

Generate study plans using:

* Target interview date
* Target firms
* Target role
* Current mastery
* Daily availability
* Topic priorities
* Practice history

Provide:

* Daily assignments
* Weekly goals
* Review sessions
* Mock interviews
* Progress recalculation
* Catch-up logic

---

# 32. Search

Implement hybrid search combining:

* PostgreSQL full-text search
* Trigram similarity
* Semantic vectors
* Metadata filters
* Frequency
* Quality
* Recency
* User relevance

Ranking factors should include:

```text
text relevance
semantic relevance
firm match
role match
topic match
reported frequency
source quality
answer quality
user weakness
interview proximity
```

Prevent duplicated low-quality reports from dominating ranking.

Create a curated search-evaluation set and report ranking quality.

---

# 33. Recommendations

Recommend content based on:

* Target firms
* Target role
* Weak topics
* Review due date
* Confidence
* Mastery
* Interview date
* Prerequisite concepts
* Firm-reported frequency
* Answer quality

Provide explanation metadata:

```text
Recommended because:
- Frequently reported for your target firm
- Due for spaced review
- Low current mastery
- Prerequisite for LBO interviews
```

Do not recommend low-confidence unvalidated material by default.

---

# 34. Administration

Build an admin interface supporting:

* Source registry
* Scraper runs (browser vs BFF)
* Ingestion jobs
* Failed pages / Cloudflare blocks
* Raw artefact inspection
* Extracted-record inspection
* Duplicate clusters
* Merge and split decisions
* Answer review
* Validation failures
* Firm aliases
* Role aliases
* Taxonomy management
* Publishing
* Unpublishing
* Reprocessing
* Export generation
* Worker health
* Data-quality reports
* Question-bank import status

Support bulk operations with confirmation and audit trails.

---

# 35. APIs

Implement typed APIs or server functions for:

* Authentication
* Profiles
* Questions
* Answers
* Search
* Firms
* Roles
* Topics
* Practice sessions
* Attempts
* Mastery
* Notes
* Bookmarks
* Collections
* Study plans
* Recommendations
* Admin review
* Admin ingestion
* Merge review
* Job status
* Exports
* Bank import

Add:

* Runtime input validation
* Pagination
* Structured errors
* Request IDs
* Authorisation
* Rate limiting where appropriate
* Admin audit logs
* API documentation
* Integration tests

Follow the current Vercel and Next.js skills when choosing between:

* Server Components
* Server Actions
* Route handlers
* Dedicated backend services

---

# 36. Performance

Target:

* Dashboard initial load under two seconds under expected production conditions
* Typical search responses under 500 milliseconds
* Immediate-feeling question transitions
* No LLM call in the normal question-browsing critical path
* Paginated admin tables
* Indexed database access
* Cached common filters and facets
* Lazy loading for source evidence
* Background execution for heavy jobs

Use the Vercel skill’s recommendations for:

* Caching
* Revalidation
* Streaming
* Partial rendering
* Bundle optimisation
* Runtime selection
* Observability

Measure and report actual performance.

---

# 37. Accessibility

Meet practical WCAG expectations.

Implement:

* Keyboard navigation
* Visible focus
* Screen-reader labels
* Reduced-motion support
* Sufficient contrast
* Accessible dialogs
* Accessible command menus
* Semantic headings
* Form error announcements
* Non-colour status communication

Use shadcn primitives correctly rather than removing their accessibility behaviour.

---

# 38. Security

Implement:

* Secure authentication
* Server-side authorisation
* Role-based admin access
* CSRF protection where applicable
* Input sanitisation
* Secure headers
* Content Security Policy
* Audit logging
* Sensitive-endpoint rate limits
* Secret scanning
* Dependency vulnerability checks
* Signed private object access
* Database backups
* Environment validation

Never expose:

* Scraper cookies / `glassdoor_state.json` / `glassdoor_session.json`
* Browser profiles
* Source tokens
* Database credentials
* LLM credentials (`GEMINI_API_KEY`)
* Worker credentials
* `HTTPS_PROXY` credentials
* Capsolver keys

---

# 39. Observability

Track:

* Pages discovered
* Pages fetched
* Pages changed
* Pages blocked (Cloudflare)
* Parser failures
* Relevant pages
* Records extracted
* Questions accepted
* Questions rejected
* Answers imported
* Answers generated
* Answers validated
* Duplicate rate
* Canonical questions
* IB question volume
* PE question volume
* Firm coverage
* Role coverage
* Job duration
* Search latency
* API errors
* Frontend errors
* Worker health
* Deployment health
* BFF vs browser success rates

Alert when:

* A source unexpectedly produces zero records
* Crawl success drops
* Parser selectors stop matching
* BFF Cloudflare block rate spikes
* Grounding failures spike
* Duplicate rate changes sharply
* PE collection falls below expectations
* Validation failures spike
* Scheduled jobs stop
* Production health checks fail

Use structured logging and traceable request or job IDs.

---

# 40. Testing

## Unit tests

Cover:

* BFF response parsing (`parse_interview_record`, `_question_texts`, `_position_match`)
* Browser DOM parsers
* Bank merge / enrich / job completion
* Normalisation
* Firm resolution
* Role resolution
* Date parsing
* Taxonomy
* Deduplication
* Finance calculations
* Quality scoring
* Study scheduling
* Search helpers
* Recommendation helpers
* Question-bank importer

## Fixture tests

Cover:

* Glassdoor IB pages
* Glassdoor PE pages
* BFF JSON pages
* Static guides
* GitHub datasets
* PDFs
* Empty states
* Partial pages
* Layout variants
* Failed / Cloudflare pages
* Legacy `question_bank.json` slices

## Integration tests

Cover:

* Crawl to raw storage
* Raw to staging
* Staging to canonical
* Canonical to validation
* Validation to publication
* Bank JSON import idempotency
* Search API to UI
* Practice-session lifecycle
* Attempt to mastery update
* Admin review
* Scheduled jobs
* CLI `main.py query` / batch dry paths

## End-to-end tests

Cover:

* User authentication
* Onboarding
* Firm search
* Question study
* Practice completion
* Confidence recording
* Mastery update
* Study-plan creation
* Admin review
* Answer publication

## Data-quality tests

Enforce:

* Accepted records have evidence.
* Source answers have source evidence.
* Occurrences reference sources.
* Canonical questions have variants.
* Published answers have origins.
* Topic signals are not reported as exact questions.
* Unsupported firm attribution is rejected.
* Re-running ingestion does not duplicate records.
* No orphaned relationships exist.
* Fixtures contain no secrets.
* Synthetic `[Interview process]` placeholders are not published as exact questions.

---

# 41. CI/CD and deployment

Create:

* Development environment
* Preview environment
* Production environment

CI should run:

1. Formatting
2. Linting
3. Type checking
4. Unit tests (Python + TypeScript)
5. Integration tests
6. Build
7. Migration validation
8. Security checks
9. Preview deployment
10. Production deployment after gates

Deploy:

* Next.js frontend
* Backend functions or services
* Database
* Background workers
* Scheduled jobs
* Object storage
* Monitoring
* Error tracking
* Backups

Use Vercel preview deployments for frontend and integrated product review.

Do not deploy long-running scrapers into an unsuitable request runtime.

After deployment, validate:

* Authentication
* Search
* Question pages
* Practice sessions
* Progress persistence
* Study plans
* Admin access
* Ingestion execution
* Worker health
* Scheduled jobs
* Raw storage
* Logging
* Monitoring
* Error tracking
* Legacy CLI still documented and usable in worker environments

---

# 42. Initial dataset targets

Start from the existing bank (~2,842 rows, heavily IB) and grow quality-oriented coverage.

Aim for:

```text
500+ canonical investment-banking questions     # likely already met after import+dedupe; verify quality
250+ canonical private-equity questions         # NOT met today (~18 PE rows) — priority gap
1,500+ wording variants
500+ firm-specific interview occurrences
300+ validated answers                          # effectively unmet today
20+ investment-banking firms                    # ~16 IB targets seeded; expand as needed
25+ private-equity or growth-equity firms       # only 8 PE firms seeded today
10+ major technical categories
```

These are minimum quality-oriented goals, not reasons to publish weak data.

Report:

* Raw records
* Accepted records
* Rejected records
* Canonical questions
* Variants
* Answers
* Validated answers
* Interview occurrences
* IB versus PE distribution
* Firm coverage
* Role coverage
* Duplicate rate
* Validation rate
* Legacy bank import counts
* BFF vs browser contribution counts

---

# 43. Required documentation

Create or update:

```text
README.md
AGENTS.md                         # keep cloud scrape instructions accurate
docs/architecture.md
docs/data-model.md
docs/api.md
docs/frontend.md
docs/design-system.md
docs/shadcn-implementation.md
docs/vercel-architecture.md
docs/authentication.md
docs/study-engine.md
docs/search.md
docs/scrapers.md
docs/glassdoor.md
docs/answer-validation.md
docs/data-pipeline.md
docs/deployment.md
docs/operations.md
docs/troubleshooting.md
docs/security.md
docs/research/repository-audit.md
docs/research/glassdoor-frontend-analysis.md
docs/research/glassdoor-scraper-audit.md
docs/agent-run/skills-used.md
docs/agent-run/execution-plan.md
docs/agent-run/dependency-graph.md
docs/agent-run/ownership-map.md
docs/agent-run/integration-plan.md
docs/agent-run/status.md
docs/prompts/autonomous-fullstack-build.md   # this prompt
```

Document exact commands for:

* Installation (Python `.venv` + Node app)
* Development
* Environment setup (`.env.example` + Cloud Agents Secrets + Vercel env)
* Database provisioning
* Migrations
* Seeding / `question_bank.json` import
* Scraper dry run
* `python main.py login`
* `python main.py batch --backend bff|browser`
* Fixture recording
* Parser replay
* Data import
* Transformation
* Validation
* Deduplication
* Answer generation
* Answer validation
* Search indexing
* Tests
* Production build
* Preview deployment
* Production deployment
* Export generation
* Backup
* Restore
* Failed-job recovery
* Flask interim UI (`python main.py ui`)

---

# 44. Required exports and reports

Generate:

```text
exports/canonical_questions.jsonl
exports/canonical_questions.csv
exports/question_variants.jsonl
exports/interview_occurrences.jsonl
exports/answers.jsonl
exports/firms.json
exports/taxonomy.json
exports/rejected_records.jsonl

reports/coverage-report.md
reports/data-quality-report.md
reports/glassdoor-report.md
reports/private-equity-coverage.md
reports/search-evaluation.md
reports/performance-report.md
reports/accessibility-report.md
reports/test-report.md
reports/deployment-report.md
reports/final-run-summary.json
```

---

# 45. Integration gates

Do not mark a workstream complete merely because its local tests pass.

Use the following gates.

## Foundation gate

* Skills read
* Repository audited against §0
* Architecture documented (including scrape-worker split)
* Contracts merged
* Design tokens merged
* Database migration path approved
* Bank importer design approved

## Data gate

* Raw storage works for BFF JSON and browser HTML
* Fixtures replay
* `question_bank.json` import is idempotent
* Transformation is idempotent
* Grounding validation works
* Deduplication is reversible
* Published views exist
* PE coverage trend is improving

## Product gate

* Authentication works
* Search works
* Question study works
* Practice works
* Progress persists
* Admin review works

## Deployment gate

* Preview deployment passes
* Migrations succeed
* Workers are healthy
* Production smoke tests pass
* Monitoring receives events
* Backups are configured
* Scrape path still operable with documented secrets

## Release gate

* Critical tests pass
* Accessibility checks pass
* Performance checks pass
* No critical security findings remain
* Documentation is current
* Known limitations are recorded (especially Cloudflare / proxy)

---

# 46. Definition of done

The project is complete only when:

## Architecture

* Relevant Vercel and shadcn skills were read and applied.
* Repository architecture is documented from the GlassCleaner2 baseline.
* Shared contracts exist and absorb the bank schema.
* Parallel workstream ownership is documented.
* The main branch remains deployable and scrape CLI remains usable.

## Glassdoor

* Existing dual-backend scraper was audited and extended.
* Frontend + BFF data structure was researched.
* Parser fixtures exist (HTML + JSON).
* IB extraction works.
* PE extraction works at target scale.
* Pagination is tested for both backends.
* Raw evidence is stored.
* Layout / Cloudflare failures are detectable.
* No prohibited access circumvention exists.

## Data

* Raw, staging, normalised, canonical, validated, and published layers exist.
* Legacy bank imported without duplication.
* Deduplication works beyond SHA1.
* Entity resolution works.
* Quality scoring works.
* Answer origins are tracked.
* Financial validation exists.
* Data-quality tests pass.

## Frontend

* The design system is distinctive (Editorial Finance Terminal).
* shadcn primitives are customised.
* Dashboard avoids generic card-grid design.
* Question study is a signature experience.
* Motion is purposeful.
* Reduced motion works.
* Keyboard navigation works.
* Responsive layouts work.
* Flask UI is deprecated or clearly scoped as operator-only.

## Product

* Authentication works.
* Onboarding works.
* Search works.
* Filtering works.
* Question pages work.
* Practice sessions work.
* Interview simulations work.
* Study plans work.
* Spaced repetition works.
* Analytics work.
* Admin tools work.

## Deployment

* Production application is deployed.
* Workers are deployed.
* Database is configured.
* Scheduled jobs are active.
* Raw storage is configured.
* Monitoring is active.
* Backups are configured.
* Production smoke tests pass.

## Documentation

* Development setup works from documentation.
* Deployment works from documentation.
* Operational runbooks exist (including proxy / login ladder).
* Known limitations are described honestly.

---

# 47. Autonomous decision policy

Do not pause for:

* Library choices already governed by skills
* Ordinary UI details
* Routine schema implementation
* Test fixture creation
* Non-destructive refactoring
* Standard deployment configuration
* Source-specific temporary failures (retry / fixture fallback)
* Uneven initial data coverage while PE crawl continues
* Choosing BFF over browser on cloud when proxy is available

Pause only when:

* Required credentials are unavailable (`HTTPS_PROXY`, DB, Vercel, auth providers)
* Deployment permission is missing
* A destructive migration could damage real data
* Existing user work would be overwritten
* A requirement can only be met through prohibited access circumvention
* A critical product decision genuinely cannot be inferred

When blocked:

1. Record the blocker.
2. Complete all independent work (fixtures, bank import, UI against stubs, deterministic validators).
3. Provide an exact remediation step.
4. Do not claim the blocked portion is complete.

---

# 48. Final report

At completion, provide:

* Production URL
* Preview URL
* Admin URL
* Deployment architecture
* Repository architecture (before/after from GlassCleaner2)
* Skills applied
* Parallel workstreams completed
* Major files changed
* Glassdoor scraper changes (browser + BFF)
* Glassdoor frontend / BFF findings
* PE coverage improvements (from ~18 baseline)
* Raw artefact count
* Extracted-record count
* Canonical-question count
* Answer count
* Validated-answer count
* IB occurrence count
* PE occurrence count
* Duplicate rate
* Validation pass rate
* Legacy bank import stats
* Search evaluation
* Test results
* Accessibility results
* Performance results
* Security results
* Monitoring status
* Backup status
* Known limitations (Cloudflare, proxy, PE gaps remaining)
* Commands for ongoing operation
* Recommended roadmap

Do not claim completion unless the production deployment and critical user workflows have been directly verified.
