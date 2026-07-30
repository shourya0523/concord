# Autonomous Full-Stack Build and Deployment Prompt

## Investment Banking and Private Equity Interview Preparation Platform

You are the **programme orchestrator** (`ibpe-orchestrator`). Your job is not to implement every workstream yourself.

You must **spin up parallel subagents** that implement concurrently, then integrate their work.

Extend this existing GlassCleaner2 / Concord repository into a production IB/PE interview-preparation platform: scrape improvements, data pipeline, Next.js product, deploy, document.

Do not stop after a plan, mock-up, scaffold, or partial implementation.

---

# ORCHESTRATOR PROTOCOL (do this first — non-negotiable)

## O1. Identity

1. You are the coordinator described in `.cursor/agents/ibpe-orchestrator.md`.
2. Workstream agents live in `.cursor/agents/ibpe-*.md`.
3. If any are missing, follow **`/create-subagent`**: create project agents under `.cursor/agents/` with YAML `name` + `description` and a focused system-prompt body. Do not invent a second agent layout.

## O2. Read skills before architecture or UI

Discover each skill file, then **Read** it fully (do not skim titles):

```bash
# Typical locations (hash dirs vary — Glob, do not hardcode one hash):
~/.cursor/plugins/cache/**/skills/<name>/SKILL.md
~/.cursor/skills-cursor/**/SKILL.md
~/.cursor/skills/**/SKILL.md
```

### Required slash skill references

| Slash ref | When |
|-----------|------|
| `/create-subagent` | Creating or repairing `.cursor/agents/*` |
| `/bootstrap` | Repo link, env pull, first-run order |
| `/nextjs` | App Router, RSC, caching, routes |
| `/shadcn` | Any UI primitive / theme work |
| `/auth` | End-user product authentication |
| `/ai-sdk` | Answer generation, structured output, embeddings |
| `/vercel-cli` | `vercel` link/deploy/logs/env |
| `/vercel-storage` | Blob, Postgres/Redis marketplace storage, Edge Config |
| `/vercel-functions` | Serverless/Edge/cron/runtime limits |
| `/deployments-cicd` | CI workflows, promote/rollback, prebuilt deploy |
| `/env-vars` | `.env*`, `vercel env`, secret hygiene |
| `/workflow` | Durable long-running scrape/transform orchestration |
| `/verification` | Full-story browser→API→data verification |
| `/react-best-practices` | TSX quality passes |
| `/supabase` | If using Supabase Postgres/Auth/Storage/Vectors |
| `/supabase-postgres-best-practices` | Schema/index/RLS performance |
| `/ce-worktree` | Isolated worktrees for parallel streams (when available) |
| `/ce-test-browser` | Browser e2e when available |

Also read repo **`AGENTS.md`** for Glassdoor Cloudflare / BFF / proxy constraints (overrides naive scrape advice).

Write `docs/agent-run/skills-used.md` listing path, date, and decisions influenced for every skill read.

**Skill > personal preference.** Product requirements in this prompt win over skill aesthetics when they conflict; adapt implementation to the skill.

## O3. Phase 0 — serial gate (orchestrator only)

Complete **before** launching implementers:

1. Confirm §0 baseline (do not rediscover from zero).
2. Freeze minimum shared contracts (`packages/contracts` or agreed path).
3. Write `docs/agent-run/ownership-map.md`, `dependency-graph.md`, `execution-plan.md`, `integration-plan.md`, `status.md`.
4. Ensure `.cursor/agents/ibpe-*.md` exist for A–K + orchestrator.
5. Scaffold empty owned dirs if needed so parallel agents do not collide on mkdir.
6. Run **§0b sibling-agent check** → write `docs/agent-run/sibling-agents.md` (PR #5/#7 status).

Do **not** build features in Phase 0.

## O4. True parallel spawn (Wave 1) — single message, many Tasks

After Phase 0, launch **all Wave 1 agents in one assistant turn** using **multiple parallel `Task` tool calls** (not sequential chats).

| Wave | Agents (`.cursor/agents/`) | Focus |
|------|----------------------------|--------|
| **1** (parallel) | `ibpe-architecture`, `ibpe-design-system`, `ibpe-database`, `ibpe-glassdoor`, `ibpe-data-quality`, `ibpe-answers`, `ibpe-infra` | Contracts, DS, DB, Glassdoor **signals**, **GitHub Q/A import**, **Gemini enrich**, CI/Vercel scaffold |
| **2** (parallel, after Wave 1 integrate) | `ibpe-frontend`, `ibpe-backend`, `ibpe-search` | Product UI, APIs/auth, hybrid search |
| **3** (parallel + orchestrator integrate) | `ibpe-qa`, resume `ibpe-infra`, any lagging streams | Gates, deploy, smoke, docs |

### Task launch rules

For each workstream Task:

* `description`: short title matching the agent (e.g. `WS-F Glassdoor PE`)
* `prompt`: paste that agent's `.cursor/agents/ibpe-*.md` body **plus** explicit owned paths, branch name, and “read these slash skills first: …”
* Prefer `subagent_type: "best-of-n-runner"` for isolated worktrees when available; else `generalPurpose`
* Give each stream its own branch: `local/<workstream>-9954` or per-env suffix
* Instruct: commit/push on that branch; do not edit files owned by other streams
* Instruct: update only their section of `docs/agent-run/status.md` (or a per-stream status file under `docs/agent-run/status/`) to reduce merge conflicts

**Failure mode to avoid:** one agent serially implementing A→K. That violates this prompt.

When the environment cannot run parallel Tasks, use `/ce-worktree` (or git worktrees) and still separate commits/branches per stream; document the limitation in `status.md`.

## O5. Integration loops

After each wave:

1. Merge contract/DB/UI-primitive PRs first.
2. Rebase dependent streams.
3. Run `/verification` on critical paths when the app boots.
4. Relaunch only blocked or failed streams; leave healthy streams running.
5. Never wait on Glassdoor credentials to stop frontend/fixtures/validators/CI.

## O6. Programme outcomes (still required)

1. Audit against §0.
2. Apply skills in §O2.
3. Shared contracts absorbing bank + GitHub corpus shapes.
4. Parallel workstreams via subagents (§O4).
5. **Prioritise open-source GitHub Q/A corpora as teaching source of truth** (absorb PR #2 importers); Glassdoor stays directional for firm preferences.
6. Extend Glassdoor scraper only as a **firm-signal / occurrence** layer (browser + BFF), including PE coverage.
7. **Gemini enrichment** — categorise, tag, link Q/A into company-prep and concept-lab graphs (`GEMINI_API_KEY` + `/ai-sdk`).
8. Answer validation + diagram/resource attachment on enriched corpus.
9. Full Next.js product — **company prep rooms + concept labs** with weak-topic auto-focus, resource hyperlinks, embedded JS diagrams.
10. Study, search, recommendation, and admin systems oriented to interactive learning.
11. Test critical workflows (company session, concept page + diagram, weak-topic drill, Gemini enrich job).
12. Deploy app + workers.
13. Validate production.
14. Complete documentation + reports.

Work autonomously on routine decisions. Pause only for true external blockers (credentials, deploy permissions, destructive migration, prohibited access circumvention). When one stream is blocked, continue every other stream.

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
| Parallel batch (unmerged) | Sibling agent PR [#7](https://github.com/shourya0523/concord/pull/7): `scripts/parallel_batch.py` — N Chrome workers, bank shards, merge. **No `--backend bff` yet.** Claimed in-progress full force scrape of ~82 jobs via `glassdoor_state.json` |
| Question bank | `data/question_bank.json` (~2,842 questions; ~2,824 IB / ~18 PE; 21 companies; 52 completed jobs) — re-check after PR #7 scrape finishes |
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

### Related sibling agent / PR progress (refresh before Wave 1)

| Item | Status (as of 2026-07-30) |
|------|---------------------------|
| Cloud agent `bc-a80753a1-8140-425a-88e1-3a90e54c3a7e` | Not visible in every Cursor environment’s agent list; track via GitHub PRs + branch `*-3a7e` |
| [PR #5](https://github.com/shourya0523/concord/pull/5) BFF API Cloudflare bypass | **MERGED** into base — `scrapers/bff_api.py`, `batch --backend bff` already on trunk. Do not re-implement. |
| [PR #7](https://github.com/shourya0523/concord/pull/7) parallel batch scraper | **OPEN** on `local/parallel-full-scrape-3a7e`. Adds `scripts/parallel_batch.py` + gitignore for `data/parallel_batch/`. PR body: full force scrape of all IB/PE/Banking jobs with 3 browser workers + saved session **in progress**. Bank on that branch tip still showed ~2842 / 52 jobs at last check — re-fetch before treating scrape as done. |
| Parallel runner gap | Does **not** pass `--backend bff`; browser-only workers. Workstream F should absorb the script and add BFF/worker parity + PE-focused shards. |

### Related but unmerged work

1. **`local/ibpe-interview-corpus-042f` / PR #2** — **priority absorb.** Fixture-first corpus with `config/github_sources.yml`, GitHub adapters (`src/ibpe_corpus/adapters/github/`), staged `ddeng5/Capital-Markets-Question-Bank-App` export (~385 IB Q/A pairs), answer pipeline, taxonomy/PE matrix. This is the best existing path to **teaching Q/A source of truth**. Merge/cherry-pick importers rather than re-scrape Glassdoor for answers.
2. **`local/parallel-full-scrape-3a7e` / PR #7** — parallel Chrome batch + ongoing Glassdoor collection for **firm directional signals**. Prefer merge or cherry-pick `scripts/parallel_batch.py`; add BFF mode later.

Before starting data work, run:

```bash
gh pr view 2 --json state,updatedAt,files
gh pr view 5 --json state,mergedAt
gh pr view 7 --json state,updatedAt,body,commits
git fetch origin local/ibpe-interview-corpus-042f local/parallel-full-scrape-3a7e
```

---

# 0c. Source-of-truth model (product data thesis)

**Do not treat Glassdoor as the teaching corpus.**

| Source | Role in the product |
|--------|---------------------|
| **Open-source GitHub Q/A corpora** (and similar curated public banks) | **Primary source of truth** for questions + answers used to teach. Import, license-review, dedupe, then enrich. |
| **Glassdoor** (browser / BFF / `question_bank.json`) | **Directional firm signal only** — which topics/firms/roles show up in reported interviews; occurrence heat for Mode A company rooms. Not authoritative answer text. |
| **Gemini enrichment** (`GEMINI_API_KEY` + `/ai-sdk`) | Categorise, tag taxonomy, map to concepts, suggest firm relevance, draft diagrams/resource links, fill gaps with clearly labelled synthesised answers. |
| **Deterministic validators / editorial** | Gate correctness for finance maths; human/editorial override. |

This split powers the two product modes:

* **Mode A — Company prep:** Glassdoor (and firm tags from enrichment) weight *what to practise at Firm X*; GitHub+Gemini supply *what good answers look like*.
* **Mode B — Concept lab:** GitHub+Gemini supply concept curriculum, diagrams, resources; Glassdoor is optional “where this shows up in real interviews.”

Never present Glassdoor `process` narrative as a validated model answer. Never attribute Gemini output to Glassdoor or to a GitHub repo.

## 0.2 Non-negotiable preservation rules

* Do not delete or break `python main.py batch|query|login|ui` until a documented replacement exists.
* Do not discard `data/question_bank.json`; keep it as the Glassdoor signal seed (occurrences), not as the answer bible.
* **Prefer absorbing PR #2 GitHub import path** over inventing a second corpus stack.
* Do not discard `config/targets.json`; extend it (PE matrix, role aliases) rather than replacing blindly.
* Absorb or supersede `scripts/parallel_batch.py` from PR #7 rather than inventing a third batch runner.
* Treat `web/` Flask UI as an interim operator tool until the Next.js product ships; keep it runnable during migration or document its retirement explicitly.
* Keep Cloudflare / login workarounds documented in `AGENTS.md` and README in sync with code.
* Never commit real credentials, `glassdoor_state.json`, or `glassdoor_session.json`.
* Review licenses before publishing imported GitHub Q/A in production.

## 0.3 Current tree (authoritative starting layout)

```text
.
├── AGENTS.md
├── README.md
├── main.py
├── requirements.txt
├── .env.example
├── .cursor/
│   ├── agents/                     # ibpe-* parallel subagents
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
│   ├── bff_api.py                  # MERGED via PR #5 — extend, don't rewrite
│   ├── driver.py
│   ├── exporter.py
│   ├── scraper.py
│   └── session_state.py
├── scraper_utils/
├── scripts/
│   ├── guided_login.py
│   └── parallel_batch.py           # from PR #7 when merged / cherry-picked
└── web/                            # Flask browse UI
    ├── app.py
    ├── static/
    └── templates/
```

(If `scripts/parallel_batch.py` is missing on your checkout, fetch PR #7 before reinventing concurrency.)

---

# 0b. Sibling-agent check (orchestrator must run)

When this programme starts, record progress into `docs/agent-run/sibling-agents.md`:

1. PR #2 corpus / GitHub Q/A — **priority**; open/merged? importer paths present?
2. PR #5 BFF — expect **merged**; confirm `scrapers/bff_api.py` present.
3. PR #7 parallel scrape — open/merged? bank row counts? (firm-signal only)
4. Any new commits on `*-042f` / `*-3a7e` branches.

Do not duplicate finished BFF work. **Absorb GitHub Q/A importers before treating Glassdoor as content.** Incorporate parallel-batch for firm-signal scale when available.

---

# 1. Product mission

Build a distinctive, **interactive, company-based learning** platform for high-stakes finance interviews.

Primary audiences:

* Investment Banking Analyst / Associate recruiting
* Private Equity Analyst / Associate recruiting
* Growth Equity, Restructuring, Capital Markets, Private Credit where relevant

## 1.1 Two primary learning modes

The product is organised around **two equal entry paths** (not a generic question dump):

### Mode A — Company interview prep

User picks a **target firm** (and optionally role / interview date). The experience becomes that company’s prep room:

* Questions and occurrences reported at that firm
* Firm-specific frequency, difficulty, and stage patterns
* “Why this firm / why banking / why PE” framing for that house
* Adaptive queue that **automatically prioritises the user’s weaker topics** relative to that firm’s interview profile
* Hyperlinks out to firm-relevant primers, deal examples, and concept deep-dives
* Embedded interactive diagrams for the technical topics that firm over-indexes on

### Mode B — Concept learning

User picks a **concept track** (e.g. Accounting, Enterprise value, DCF, M&A, LBO / paper LBO, Behavioural story bank) without requiring a firm first:

* Structured concept pages with progressive disclosure
* Interactive diagrams (statement linkages, WACC build-up, sources & uses, value-creation bridge, etc.)
* Curated resource hyperlinks (internal concept pages + external high-quality references)
* Practice drills that feed mastery / weak-topic signals
* Optional “apply this concept at [Company]” bridges into Mode A

Users can switch modes freely. Company mode deep-links into concept pages; concept mode deep-links into firm occurrence heat.

**Data behind the modes:** GitHub (and similar) Q/A corpora are the teaching source of truth; Glassdoor only biases *which* topics matter at a firm; Gemini enriches and categorises into both graphs (§0c).

## 1.2 Learning behaviours (non-negotiable)

The platform should help users:

* **Prep interactively** for interviews at large IB / PE / growth firms — not only browse a bank
* **Learn concepts** with diagrams, worked examples, and resource links
* **Auto-focus weaker topics** from confidence, mastery, misses, and time-since-review (default session bias toward weakness, explainable)
* Study validated answers with layered reveal
* See firm-reported vs editorial content clearly
* Practise by topic, role, firm, and interview stage
* Run realistic simulations and track readiness to a target date
* Follow **hyperlinks to resources** (internal concepts, related questions, external references with provenance)
* View **embedded JS diagrams** inline in study / concept surfaces (see §25.1) — not image-only screenshots as the primary teaching medium
* Keep notes, bookmarks, collections
* Receive adaptive recommendations with “why this” explanations

The platform must not feel like a generic flashcard app, university LMS, HR portal, or templated SaaS dashboard.

It should feel like a premium, focused **interactive prep studio** for high-stakes finance interviews — company rooms and concept labs first; explorer/admin second.

The current Flask bank browser is **not** this product; it is only a local data-inspection tool.

---

# 2. Required skill usage

Follow **§O2** (slash refs + Glob discovery). Do not invent alternate skill names.

## 2.1 Agent → skill map (each subagent must Read these before coding)

| Subagent (`.cursor/agents/`) | Required slash skills |
|------------------------------|------------------------|
| `ibpe-orchestrator` | `/create-subagent` `/bootstrap` + full §O2 table |
| `ibpe-architecture` | `/bootstrap` `/env-vars` `/nextjs` `/vercel-storage` |
| `ibpe-design-system` | `/shadcn` `/react-best-practices` `/nextjs` |
| `ibpe-frontend` | `/nextjs` `/shadcn` `/react-best-practices` `/auth` `/verification` |
| `ibpe-backend` | `/nextjs` `/auth` `/vercel-functions` `/env-vars` |
| `ibpe-database` | `/vercel-storage` `/supabase` `/supabase-postgres-best-practices` `/env-vars` |
| `ibpe-glassdoor` | `AGENTS.md` (scrape) + `/env-vars` — **not** `/auth` |
| `ibpe-data-quality` | contracts; `/ai-sdk` only if structured extraction needed |
| `ibpe-answers` | `/ai-sdk` `/vercel-functions` `/verification` |
| `ibpe-search` | `/ai-sdk` `/vercel-storage` `/supabase` (+ postgres best practices) |
| `ibpe-infra` | `/vercel-cli` `/deployments-cicd` `/vercel-storage` `/vercel-functions` `/env-vars` `/workflow` `/bootstrap` |
| `ibpe-qa` | `/verification` `/ce-test-browser` `/react-best-practices` `/deployments-cicd` |

Optional related skills when paths match: `/next-cache-components`, `/routing-middleware`, `/runtime-cache`, `/turbopack`, `/vercel-sandbox`, `/ai-gateway`.

## 2.2 Skills are source of truth for

Next.js architecture, RSC/client boundaries, data fetching, caching/revalidation, Server Actions, route handlers, streaming, Suspense, error boundaries, env vars, Vercel deploy, observability, Edge vs Node, bundle/image/font handling, shadcn install/composition/theming, accessibility, forms/dialogs/menus/command UI, AI SDK streaming/tools/embeddings, storage choice (Blob/Postgres/Redis), CI/CD promote/rollback, durable `/workflow` jobs.

## 2.3 Conflict order

1. Prohibited access circumvention — never.
2. `AGENTS.md` Glassdoor access reality (BFF + proxy + Patchright).
3. Product requirements in this prompt.
4. Slash skills listed above.
5. Personal preference — last.

Record every skill read in `docs/agent-run/skills-used.md`. Apply skills in code; do not only mention them.

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
* A focused, calm **interactive study** experience (company rooms + concept labs)
* Purposeful motion and state transitions
* Teaching aids: weak-topic focus, resource links, embedded diagrams

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

This is a **multi-subagent programme**, not a single-threaded coding session.

## 5.1 Mechanism

1. Orchestrator loads `/create-subagent` definitions from `.cursor/agents/ibpe-*.md`.
2. Phase 0 freezes contracts (serial).
3. Orchestrator fires **Wave 1** as **one message containing multiple `Task` calls** (§O4).
4. Each Task gets its own branch/worktree and owned paths.
5. Orchestrator integrates; launches Wave 2 / Wave 3 the same way.

## 5.2 Principles

* Contract-first
* File ownership = merge safety
* Small integration batches
* Continuously deployable trunk
* Explicit gates (§45)
* Fixtures unblock data/answers while scrape waits on proxy

## 5.3 Hot-path single owners

| Path | Owner agent |
|------|-------------|
| `packages/contracts/**` | `ibpe-architecture` |
| `packages/ui/**` | `ibpe-design-system` |
| `packages/database/**`, migrations | `ibpe-database` |
| `scrapers/bank.py`, `scrapers/batch.py`, `scrapers/bff_api.py`, `scripts/parallel_batch.py` | `ibpe-glassdoor` |
| `data/question_bank.json` | `ibpe-glassdoor` (writes) / `ibpe-data-quality` (import only) |
| `apps/web/**` feature routes | `ibpe-frontend` |
| API/auth server modules | `ibpe-backend` |
| `.github/workflows/**`, `vercel.json` | `ibpe-infra` |

Do **not** execute A→K serially “for simplicity.” If Tasks are unavailable, still use separate worktrees/branches and rotate in short slices, documenting the constraint.

---

# 6. Initial coordination phase

This is **Phase 0** (§O3). Orchestrator only — then spawn Wave 1.

Before feature implementation begins, perform a short coordination phase.

Complete the following:

1. Repository audit (confirm §0 baseline; note deltas)
2. Ensure `.cursor/agents/ibpe-*.md` exist (`/create-subagent` if missing)
3. Architecture decision record (monorepo evolution path from Python-first repo)
4. Dependency map (Python scrape stack vs Node product stack)
5. Data-flow diagram (Glassdoor → bank → pipeline layers → published app)
6. Shared domain model (map bank fields → canonical entities)
7. Database schema proposal
8. API contracts
9. Event and job contracts
10. Design-token definition (tokens only — full DS is Wave 1 `ibpe-design-system`)
11. Component ownership map
12. Environment-variable inventory (merge `.env.example` + new Vercel/DB secrets) via `/env-vars`
13. Deployment topology (Vercel app ≠ scrape workers) via `/vercel-cli` `/deployments-cicd` `/workflow`
14. Workstream dependency graph + Task wave plan
15. Integration and merge process
16. Decision: absorb vs ignore unmerged `ibpe-interview-corpus` artefacts

Create:

```text
docs/agent-run/execution-plan.md
docs/agent-run/dependency-graph.md
docs/agent-run/ownership-map.md
docs/agent-run/integration-plan.md
docs/agent-run/status.md
docs/agent-run/status/          # per-stream files
docs/agent-run/skills-used.md
```

Do not wait for every detail to become perfect.

Freeze the minimum shared interfaces needed for parallel implementation, then **immediately** execute §O4 Wave 1 parallel Task spawn.

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
* **Concept schema** (slug, prerequisites, firm relevance weights)
* **Diagram schema** (id, type, source format e.g. mermaid|interactive-json, version, a11y fallback)
* **Learning-resource schema** (label, url, kind internal|external, provenance, concept/firm links)
* Practice-session schema (mode: company|concept|adaptive_weak|…)
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
* Learning-mode enum (`company_prep` | `concept_learn`)

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

Each workstream below maps 1:1 to a project subagent. **Launch via Task**; do not re-implement as solo sequential work.

| WS | Subagent file | Wave |
|----|---------------|------|
| A | `.cursor/agents/ibpe-architecture.md` | 1 |
| B | `.cursor/agents/ibpe-design-system.md` | 1 |
| C | `.cursor/agents/ibpe-frontend.md` | 2 |
| D | `.cursor/agents/ibpe-backend.md` | 2 |
| E | `.cursor/agents/ibpe-database.md` | 1 |
| F | `.cursor/agents/ibpe-glassdoor.md` | 1 |
| G | `.cursor/agents/ibpe-data-quality.md` | 1 |
| H | `.cursor/agents/ibpe-answers.md` | 1 |
| I | `.cursor/agents/ibpe-search.md` | 2 |
| J | `.cursor/agents/ibpe-infra.md` | 1 then 3 |
| K | `.cursor/agents/ibpe-qa.md` | 3 |

### Example Wave 1 Task prompt skeleton (repeat per agent in one turn)

```text
You are the subagent defined in .cursor/agents/ibpe-<name>.md.
Read your listed slash skills first (Glob **/skills/<name>/SKILL.md then Read).
Repo baseline: docs/prompts/autonomous-fullstack-build.md §0.
Branch: local/<workstream>-9954
Owned paths only (see §5.3). Commit and push on your branch.
Update docs/agent-run/status/<workstream>.md
Stop when your Wave 1 exit criteria are met; report blockers exactly.
```

## Workstream A — Architecture and platform foundations

**Agent:** `ibpe-architecture` · **Skills:** `/bootstrap` `/env-vars` `/nextjs` `/vercel-storage`

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

**Agent:** `ibpe-design-system` · **Skills:** `/shadcn` (required first) `/react-best-practices` `/nextjs`

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

The team must first read and follow the `/shadcn` skill.

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
* **Diagram canvas** (Mermaid / interactive finance diagram host + reduced-motion fallback)
* **Resource link list** (labelled hyperlinks, internal/external)
* **Weak-topic chip** / focus callout
* **Company room header** / **Concept lab header**
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

**Agent:** `ibpe-frontend` · **Skills:** `/nextjs` `/shadcn` `/react-best-practices` `/auth` `/verification`

Owns:

* App shell with **Company prep** / **Concept lab** navigation
* Onboarding (mode + firms + role + interview date)
* Dashboard (weak-topic auto-focus)
* Company prep rooms
* Concept lab pages (diagrams + resource hyperlinks)
* Question study (layered reveal + diagram slot + resource rail)
* Adaptive / company / concept practice modes
* Interview simulator
* Notes, bookmarks, study plan, analytics, user settings

Must consume design-system components from Workstream B.

Must not edit core shared components directly without coordination.

Must follow `/nextjs` and related skills for:

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
* Client islands for interactive JS diagrams without abandoning RSC by default

May use fixtures / bank-import stubs before live APIs exist.

Must not treat the Flask `web/` UI as the product frontend.

Product UX priority: **interactive company + concept learning** (§1, §24–§25) over generic explorer chrome.

---

## Workstream D — Backend and domain services

**Agent:** `ibpe-backend` · **Skills:** `/nextjs` `/auth` `/vercel-functions` `/env-vars`

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

**Agent:** `ibpe-database` · **Skills:** `/vercel-storage` `/supabase` `/supabase-postgres-best-practices` `/env-vars`

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

## Workstream F — Glassdoor collection (firm signals)

**Agent:** `ibpe-glassdoor` · **Skills:** `AGENTS.md` + `/env-vars` (not `/auth`) · **Sibling:** PR #5 merged; PR #7 parallel batch open

Owns firm-**signal** collection only — not the teaching answer corpus (that is G/H + GitHub).

Owns:

* Audit of dual backends (`scrapers/scraper.py` + `scrapers/bff_api.py`)
* Employer discovery, pagination, role filtering
* PE expansion of crawl coverage for occurrence heat
* Raw evidence storage for Glassdoor artefacts
* Parser fixtures; Cloudflare / layout failure diagnostics
* `completed_jobs` / incremental crawl
* Absorbing `scripts/parallel_batch.py` (PR #7) + optional `--backend bff`
* Keeping `python main.py batch --backend bff|browser` working

**Must not** treat Glassdoor text as canonical teaching answers. Emit occurrences / topic signals for Mode A.

---

## Workstream G — Data transformation and quality

**Agent:** `ibpe-data-quality` · **Skills:** contracts; `/ai-sdk` for structured enrich staging if needed

Owns:

* **GitHub / open-source corpus import** (absorb PR #2 adapters + `config/github_sources.yml`) as primary teaching intake
* Pipeline: clean → classify → extract → ground → resolve → taxonomy → dedupe → publish
* Joining Glassdoor occurrences onto canonical Qs as firm signals
* Dataset exports under `exports/`
* Quality / license reports under `reports/`
* One-shot + incremental import from GitHub staging and from `question_bank.json` (signal path)

Must:

1. Prefer GitHub Q/A as teaching source of truth; Glassdoor bank is secondary signal.
2. Unblock with PR #2 fixtures/staged exports when live crawl is blocked.
3. Never publish `[Interview process]` placeholders as exact questions or answers.
4. Dedup beyond SHA1; merges reversible.
5. Update `docs/agent-run/status/data-quality.md`.

---

## Workstream H — Answers, Gemini enrichment, financial validation

**Agent:** `ibpe-answers` · **Skills:** `/ai-sdk` `/vercel-functions` `/verification`

Owns:

* Answer versioning and origins (GitHub-first)
* **Gemini enrichment jobs** — categorise into concepts/topics, firm soft-tags, Mode A/B routing, diagram/resource drafts (§21.2)
* Deterministic finance calculators + fixtures
* Editorial review queue hooks
* Gap-fill synthesised answers only when corpus lacks coverage

Must:

1. Read `/ai-sdk`; use `GEMINI_API_KEY`; run enrich offline via workers.
2. Never attribute Gemini or editorial answers to Glassdoor or to a GitHub path that did not contain them.
3. Wire enrichment outputs into **company prep** and **concept lab** graphs.
4. Update `docs/agent-run/status/answers.md`.

---

## Workstream I — Search and recommendations

**Agent:** `ibpe-search` · **Skills:** `/ai-sdk` `/vercel-storage` `/supabase`

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

**Agent:** `ibpe-infra` · **Skills:** `/vercel-cli` `/deployments-cicd` `/vercel-storage` `/vercel-functions` `/env-vars` `/workflow` `/bootstrap`

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

Must read `/vercel-cli`, `/deployments-cicd`, `/vercel-storage`, `/vercel-functions`, `/env-vars`, `/workflow`, and `/bootstrap` before creating deployment architecture.

Do not assume every workload should run in a Vercel request runtime.

Place long-running scraping, batch extraction, and heavy data processing in appropriate worker infrastructure.

Residential `HTTPS_PROXY` for BFF crawls is an operational secret, not an app public env var.

---

## Workstream K — QA and integration

**Agent:** `ibpe-qa` · **Skills:** `/verification` `/ce-test-browser` `/react-best-practices` `/deployments-cicd`

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

## 9.1 Status files (avoid merge fights)

Prefer per-stream status:

```text
docs/agent-run/status/architecture.md
docs/agent-run/status/design-system.md
docs/agent-run/status/frontend.md
docs/agent-run/status/backend.md
docs/agent-run/status/database.md
docs/agent-run/status/glassdoor.md
docs/agent-run/status/data-quality.md
docs/agent-run/status/answers.md
docs/agent-run/status/search.md
docs/agent-run/status/infra.md
docs/agent-run/status/qa.md
docs/agent-run/status.md          # orchestrator rollup only
```

Each stream records: objective, done, files, tests, contract proposals, blockers, deps, integration notes.

## 9.2 Branches / worktrees

Repo convention: `local/<descriptive-name>-9954` (or current cloud suffix).

Suggested stream branches:

```text
local/architecture-foundation-9954
local/design-system-9954
local/frontend-product-9954
local/backend-domain-9954
local/database-platform-9954
local/glassdoor-scraper-9954
local/data-transformation-9954
local/answer-validation-9954
local/search-recommendations-9954
local/infrastructure-9954
local/qa-integration-9954
```

Use `/ce-worktree` when available so streams do not clobber the orchestrator checkout.

## 9.3 Integration rules

1. Shared contracts merge first.
2. Database migrations merge before dependent APIs.
3. Design tokens / UI primitives merge before feature pages.
4. API stubs may unblock `ibpe-frontend`.
5. Fixtures + `question_bank.json` unblock G/H before live crawls.
6. Integrate in small batches; trunk stays buildable; `python main.py query` keeps working.
7. Broken stream branches must not freeze unrelated Tasks — relaunch or continue others.
8. Schema changes require contract updates owned by `ibpe-architecture` + `ibpe-database`.
9. Central files have a single owner (§5.3).
10. Orchestrator may use `/verification` after Wave 2 before Wave 3 prod push.

## 9.4 Anti-patterns (reject these)

* One agent coding all workstreams in order
* “We’ll parallelise later”
* Feature teams editing `packages/ui` primitives directly
* Frontend waiting idle for scrape credentials
* Scrapers deployed as Vercel request handlers
* Using `/auth` skill for Glassdoor login flows

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

**Priority order for teaching content:**

1. Licensed / clearly attributable **GitHub (and similar) Q/A corpora** — primary truth
2. Curated public guides / PDFs / university notes — secondary truth
3. Editorial + Gemini-enriched material — labelled, never laundered as “reported”
4. Glassdoor — **firm preference / occurrence signals only**

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
* **Rights / license / use notes** (blocking for GitHub publish)
* Failure policy
* **Product role:** `teaching_qa` | `firm_signal` | `enrichment` | `pattern_only`

Source types may include:

* Public GitHub datasets / question banks (**teaching_qa** — prefer first)
* Glassdoor browser / BFF API / local `question_bank.json` (**firm_signal**)
* Public interview guides, university resources, forums, PDFs
* Existing repository files / PR #2 staged exports
* User-provided data
* Gemini enrichment jobs (**enrichment** — not a scrape source)

Register at minimum:

* `github_*` entries from `config/github_sources.yml` (absorb PR #2)
* `glasscleaner2_question_bank` as firm-signal lineage
* `gemini_enrichment_v*` for model-assisted categorisation outputs

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

Bootstrap path for this repo (**teaching content first**):

```text
GitHub Q/A corpora (PR #2 staging / github_sources.yml)
        → Raw/Staging → Normalised → Canonical Q/A
        → Gemini enrich (topics, concepts, firm hints, diagrams/resources)
        → Validated → Published (Concept lab + answer bank)

Glassdoor BFF/browser + question_bank.json
        → Raw/Staging → firm occurrences / topic heat only
        → join to canonical Qs as Mode A signals (not answer text)
```

## Raw

Preserve:

* URL / repo / commit SHA
* Retrieval timestamp
* HTTP metadata
* HTML / BFF JSON / GitHub export JSON
* PDF
* Screenshot
* Source hash
* Main-content hash
* Browser mode (`browser` | `bff` | `github_import` | `gemini_enrich`)
* Crawl / import / enrich version
* Parser or model version
* Crawl status
* Cloudflare / proxy diagnostics (no secrets)
* License / attribution snapshot for GitHub imports

## Staging

Store:

* Exact source text
* Source span or JSON path
* Extracted question
* Extracted answer (required for teaching_qa sources when present)
* Firm (optional on GitHub; often absent)
* Role
* Office
* Interview stage
* Reported date
* Record type
* Extraction confidence
* Validation issues
* Legacy bank `id` when imported from Glassdoor signal seed
* Gemini proposed labels (topics, concepts, firm relevance) pending validation

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
* Concept slugs

Always preserve original values.

## Canonical

Create canonical question concepts with:

* Wording variants
* Interview occurrences (**Glassdoor firm signals attach here**)
* Firm relationships (from signal + Gemini suggestions, confidence-scored)
* Role relationships
* Topic / concept relationships
* Follow-ups
* Answer versions (**prefer GitHub source_provided, then validated enrichment**)
* Source references
* Diagram + learning-resource links

## Validated

Only content passing defined quality thresholds becomes eligible for publication.

## Published

Optimise published tables or views for application queries.

* Concept lab reads published concepts + Q/A + diagrams + resources
* Company rooms read firm occurrence heat joined to published Q/A
* The frontend should not query raw ingestion tables or the JSON bank file directly in production

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

## Learning content layer

* `concepts`
* `concept_prerequisites`
* `concept_firm_weights`
* `diagrams`
* `diagram_versions`
* `learning_resources`
* `resource_links` (concept/question/firm associations)

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

# 21. Answer acquisition and Gemini enrichment

## 21.1 Source hierarchy for answers

1. **`imported` / `source_provided` from GitHub (and similar) corpora** — default teaching answers when license allows.
2. **`editorial`** — human-reviewed gold.
3. **`deterministic_calculation`** — numeric/finance identities.
4. **`synthesised` via Gemini** — gap-fill only; clearly labelled; never the silent default when a corpus answer exists.
5. **Glassdoor** — do **not** mine `process` text as model answers. Use Glassdoor only to attach firm/role/stage **signals** onto canonical questions.

The current `question_bank.json` largely lacks answers; treat it as occurrence fuel for Mode A.

## 21.2 Gemini enrichment jobs (required for the two-mode app)

Use `GEMINI_API_KEY` through `/ai-sdk` patterns (structured output). Batch offline in workers (`/workflow`), not in the question-browse request path.

For each canonical question / imported Q/A pair, Gemini may propose:

* Track / topic / subtopic labels
* Concept lab slug(s) + prerequisites
* Difficulty + interview stage hints
* Firm-relevance suggestions (soft tags — join later with Glassdoor heat)
* Mode routing: useful for `company_prep`, `concept_learn`, or both
* Short “interview-ready” rewrite candidates (as new answer **versions**, not overwrites)
* Diagram sketch specs (Mermaid or structured JSON) and resource link suggestions
* PE vs IB relevance flags

All Gemini outputs land in staging/enrichment tables with model version, prompt version, and confidence. **Publication requires schema validation + finance validators where numeric + provenance labels.**

## 21.3 Answer origins and states

Answer origins:

* `source_provided` (in-corpus)
* `imported`
* `synthesised` (Gemini or other LLM)
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
* Source references (GitHub repo/commit/path when imported)
* Validator version
* Validation results
* Last validation date

Never imply that a generated answer came from Glassdoor or from a GitHub file that did not contain it.

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

Build the following product surfaces in Next.js (not Flask). **Order UX around Mode A (company) and Mode B (concepts)** — not a flat CRUD catalogue.

## 24.1 Core learning surfaces (priority)

* Marketing page (company-prep + concept-learn CTAs)
* Authentication
* Onboarding — choose **Company prep** and/or **Concept learning**; set role, target firms, interview date
* Home dashboard — weak-topic focus + next session for active mode
* **Company prep room** (`/companies/[firm]`) — firm overview, reported topics, readiness, start adaptive session
* **Concept lab** (`/concepts/[slug]`) — concept page with diagrams, resource links, linked questions, start drill
* Adaptive study session (company- or concept-scoped)
* Question study page (signature layered reveal + diagrams + resource rail)
* Practice / weak-topic drill
* Interview simulator (firm-configurable)
* Study planner (interview-date urgency + weak topics)
* Resource browser (curated hyperlinks with provenance)

## 24.2 Supporting surfaces

* Question explorer (power users / admin-adjacent browse)
* Notes, bookmarks, collections
* Analytics (weakness trends, firm readiness, concept mastery)
* User settings
* Admin console

Keep Flask `web/` available as an operator bank browser until feature parity for search/browse exists, then document deprecation.

---

# 25. Signature question experience

The question-study experience should be the product’s defining interaction — interactive learning, not a static FAQ.

Before answer reveal, prioritise:

* Large question typography
* Topic and difficulty
* **Company context** when in Mode A (firm chip, occurrence count, stage)
* Thinking timer
* Confidence selection
* Optional hint
* Reveal action
* Weak-topic indicator when this question is in the user’s weak set

Reduce unnecessary navigation chrome during focused study.

Reveal answers in stages:

1. Direct answer
2. Interview-ready explanation
3. Step-by-step walkthrough
4. **Interactive diagram** (when the topic has one — see §25.1)
5. Formulae or calculations
6. Assumptions
7. Common mistakes
8. Follow-up questions
9. Related concepts (deep links into Concept lab)
10. **Resource hyperlinks** (internal + external, labelled)
11. Sources / provenance and validation
12. “Practise more on this weak topic” / “See how [Firm] asks this”

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
* Open related concept
* Open resource link (focusable)

## 25.1 Embedded interactive diagrams (JS diagrams)

Diagrams are a **first-class teaching medium**, not decoration.

Requirements:

* Embed **interactive JavaScript diagrams** inline in concept pages and in answer reveals (client components where needed).
* Prefer declarative diagram sources (e.g. Mermaid or equivalent) compiled/rendered in JS for maintainability, plus purpose-built interactive finance diagrams where Mermaid is too weak (three-statement flow, DCF waterfall, LBO sources & uses, capital structure stack, accretion/dilution bridge).
* Support pan/zoom or step-highlight where helpful; never require a separate tab to understand the diagram.
* Honour `prefers-reduced-motion`; provide a textual/table fallback for accessibility.
* Store diagram definitions in content/contracts (versioned), not only in opaque binary assets.
* Link diagram nodes/sections to related concept pages and resource URLs where natural.
* Do **not** rely on static PNG screenshots as the primary diagram experience.

Minimum diagram coverage for MVP concepts:

* Three financial statements linkages
* Enterprise value → equity value bridge
* DCF / WACC build-up
* Sources & uses (LBO / M&A)
* Simple paper-LBO returns sketch (IRR / MOIC intuition)

## 25.2 Resource hyperlinks

Every concept page and every validated answer should expose a **Resources** rail or section:

* Internal links: related concepts, prerequisite topics, firm prep rooms that over-index this topic
* External links: high-quality public references (guides, explainers) with title, publisher, and optional “why linked”
* Never bare URLs without labels
* Track broken-link checks in QA where feasible
* Distinguish editorial/resource links from Glassdoor source provenance

---

# 26. Dashboard

The dashboard should not be a uniform grid of generic cards.

Use an asymmetric editorial composition oriented to **what to learn next**.

Display:

* Active mode toggle or clear entry: **Company prep** vs **Concept lab**
* Target firm(s) readiness (Mode A)
* Concept mastery map with **weaker topics highlighted** (Mode B / cross-cutting)
* **Auto-suggested next session** biased to weaker topics (explain why)
* Today’s review queue
* Days until interview
* Overall mastery
* Firm readiness / PE readiness
* Study streak
* Recent sessions
* Progress trends
* Shortcut into company room or concept page

Use oversized metrics, editorial rules, mixed-width panels, and meaningful hierarchy.

---

# 27. Company prep room & concept explorer

## 27.1 Company prep room

For each major firm:

* Hero firm identity (editorial, not generic card stack)
* Role filters (Analyst / Associate / …)
* Topic heat from reported occurrences
* User weakness overlay vs firm topic profile
* Start **adaptive firm session** (defaults to weaker firm-relevant topics)
* Reported question explorer scoped to firm
* Links into concepts the firm cares about
* Resource links specific to that firm’s interview style (when curated)

## 27.2 Concept lab / explorer

Support:

* Keyword + semantic search over concepts and questions
* Typo tolerance
* Firm filtering (when bridging to Mode A)
* Fund / role / office / topic / subtopic / difficulty / stage
* Reported versus editorial
* Answer availability / validation
* **Has interactive diagram** filter
* **Has resource links** filter
* Weak-for-me filter
* IB versus PE
* Source confidence

Allow sorting by relevance, frequency, recency, difficulty, quality, firm relevance, **personal weakness**.

Support saved searches/filters, filter counts, keyboard navigation, command-palette entry (“Open Goldman prep”, “Open DCF concept”).

---

# 28. Practice modes

Implement:

* **Adaptive weak-topic session** (default from dashboard)
* **Company adaptive session** (Mode A — firm profile ∩ weak topics)
* **Concept drill** (Mode B — single concept or prerequisite chain)
* Random technical drill
* Accounting / Valuation / DCF / M&A / LBO / PE case / Behavioural drills
* Firm-specific drill
* Role-specific drill
* Timed drill
* Difficulty progression
* Spaced-repetition review

Freeze the selected question membership when a session starts.

A session must remain reproducible even when the underlying dataset changes later.

Surface mid-session links to the active concept diagram and resource list without breaking focus (peek / side rail).

---

# 29. Interview simulations

Implement configurable interview simulations — prefer **firm-templated** sims when a company is selected.

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
* Final readiness report biased to **weaker stages/topics**
* Topic-specific recommendations with links into Concept lab + resources
* Optional diagram prompts for technical stages (e.g. “sketch sources & uses”)

---

# 30. Study engine

Implement:

* Spaced repetition
* Adaptive review
* Confidence tracking
* Mastery tracking
* **Automatic weak-topic prioritisation** (default ranking input for sessions)
* Topic prerequisites (concept graph)
* Firm frequency × personal weakness scoring for Mode A
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

Weak-topic selection must be **explainable** in the UI (“Recommended because: low mastery + high Goldman frequency + due for review”).

---

# 31. Study plans

Generate study plans using:

* Target interview date
* Target firms (Mode A weighting)
* Target role
* Current mastery / **weaker topics**
* Daily availability
* Topic priorities / prerequisite order
* Practice history

Provide:

* Daily assignments mixing company drills and concept labs
* Weekly goals
* Review sessions
* Mock interviews
* Diagram/concept checkpoints for weak technical areas
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
* User relevance / weakness
* Concept and firm entities
* Resource titles

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
has diagram / has resources (soft boost when user in concept mode)
```

Prevent duplicated low-quality reports from dominating ranking.

Create a curated search-evaluation set and report ranking quality.

Command palette must jump to **companies**, **concepts**, **questions**, and **resources**.

---

# 33. Recommendations

Recommend content based on:

* Target firms
* Target role
* **Weaker topics (primary signal)**
* Review due date
* Confidence
* Mastery
* Interview date
* Prerequisite concepts
* Firm-reported frequency
* Answer quality
* Missing diagrams/resources for incomplete concept coverage (editorial backlog — admin)

Provide explanation metadata:

```text
Recommended because:
- Frequently reported for your target firm
- Due for spaced review
- Low current mastery (weak topic)
- Prerequisite for LBO interviews
- Concept diagram available — good next learn
```

Do not recommend low-confidence unvalidated material by default.

Deep-link every recommendation into the correct **company room**, **concept lab**, or **study session**.

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
* Concepts
* Diagrams
* Learning resources
* Search
* Firms
* Roles
* Topics
* Practice sessions (company | concept | adaptive_weak | …)
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
docs/learning-modes.md
docs/concepts-and-diagrams.md
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
docs/agent-run/sibling-agents.md
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
* Concept + diagram fixture load
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
* Company prep room + concept lab work
* Weak-topic auto-focus session works and shows explanation
* Diagrams render with fallback
* Resource hyperlinks work
* Search / command palette works
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

* Relevant slash skills (`/nextjs`, `/shadcn`, `/vercel-cli`, `/vercel-storage`, `/auth`, `/ai-sdk`, `/deployments-cicd`, …) were read and applied.
* `.cursor/agents/ibpe-*.md` existed and Wave 1+ were launched as parallel Tasks (or limitation documented).
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
* Dashboard avoids generic card-grid design and centres **next learn** / weak topics.
* **Company prep** and **Concept lab** modes both work.
* Question study is a signature experience with layered reveal.
* Interactive JS diagrams render with a11y fallbacks.
* Resource hyperlinks are labelled and reachable from study + concepts.
* Weak-topic auto-focus drives default sessions and is explainable.
* Motion is purposeful; reduced motion works.
* Keyboard navigation works.
* Responsive layouts work.
* Flask UI is deprecated or clearly scoped as operator-only.

## Product

* Authentication works.
* Onboarding (company and/or concept path) works.
* Search / command palette reaches firms, concepts, questions, resources.
* Filtering works.
* Question pages work.
* Adaptive / company / concept practice sessions work.
* Interview simulations work.
* Study plans work.
* Spaced repetition + weak-topic prioritisation work.
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
