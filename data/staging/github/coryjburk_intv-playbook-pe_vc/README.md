# Private Equity & Value Creation Interview Playbook

**Full-Time MBA Program · David Eccles School of Business · University of Utah**

A single-file, browser-based interview preparation tool for MBA candidates targeting **Private Equity Investment** and **Portfolio Operations / Value Creation** roles. It combines a 100-question bank, 16 strategic frameworks, executive battlecards, a red-flag library, a voice-enabled practice simulator with live speech analytics, a client-side AI evaluation engine, and a persistent readiness dashboard — with no server, no login, and no data leaving the student's browser.

---

## **▶ Live tool:** **[Intv Playbook - PE (vC)](https://coryjburk.github.io/intv-playbook-pe_vc/)**

---


## Contents

1. [What's Inside](#whats-inside)
2. [Quick Start](#quick-start)
3. [User Manual](#user-manual)
   - [Home / Cockpit](#home--cockpit)
   - [Question Bank](#question-bank)
   - [Practice Simulator](#practice-simulator)
   - [AI Evaluation & Scoring](#ai-evaluation--scoring)
   - [Strategic Frameworks](#strategic-frameworks)
   - [Interview Battlecards](#interview-battlecards)
   - [Deal Team Red Flags](#deal-team-red-flags)
   - [Readiness Dashboard](#readiness-dashboard)
   - [Voice Input Troubleshooting](#voice-input-troubleshooting)
4. [Operational Guide](#operational-guide)
   - [Repository Structure](#repository-structure)
   - [Deployment (GitHub Pages)](#deployment-github-pages)
   - [Editing & Adding Questions](#editing--adding-questions)
   - [Editing Frameworks, Battlecards & Red Flags](#editing-frameworks-battlecards--red-flags)
   - [How the Scoring Engine Works](#how-the-scoring-engine-works)
   - [Progress Persistence](#progress-persistence)
   - [Browser Support](#browser-support)
5. [Changelog](#changelog)
6. [Credits](#credits)

---

## What's Inside

| Module | Count | Purpose |
|---|---|---|
| Question Bank | 100 questions | 50 Investment-track + 50 Portfolio Operations-track questions across 12 competency domains and 4 difficulty tiers |
| Strategic Frameworks | 16 | 8 Investment (LBO architecture, thesis construction, CDD, QofE, exit, etc.) + 8 Operations (100-day plan, VCP, pricing, working capital, etc.) |
| Interview Battlecards | 2 | Rapid-reference concept, metric, and phrase sheets for each track |
| Red Flags | 10 | The most common fatal candidate errors, each with a remediation blueprint |
| Practice Simulator | — | Voice- or text-based mock answering with live pace/stall metrics |
| AI Evaluation | — | Instant client-side scoring across Content, Structure, Specificity, and Delivery |
| Readiness Dashboard | 12 domains | Best-demonstrated score per competency, persisted in the browser |

Every question carries five layers: the question itself, the **target competency**, the **recruiter's strategic intent**, a **model executive answer**, a **technical deep-dive**, an **Eccles coaching note**, and the **critical red flag** to avoid.

---

## Quick Start

**Students:** open the deployed GitHub Pages URL in **Chrome or Edge on desktop** (best voice support). No installation, no account. Your progress saves automatically in that browser.

**Maintainers:** the entire application is one file — `index.html`. Clone, edit, commit; GitHub Pages redeploys automatically.

---

## User Manual

### Home / Cockpit

The landing view summarizes the tool (100 questions, 16 frameworks, 2 battlecards, 10 red flags) and offers one-click entry into either track's question bank. The left navigation is always available; the red header bar stays fixed.

### Question Bank

Three filters combine to narrow the 100 questions:

- **Track** — Investment / Portfolio Operations / All. Changing the track re-populates the Category filter with that track's six domains.
- **Category** — the 12 competency domains (e.g., Leveraged Buyouts, Value Creation, Strategic Finance).
- **Difficulty** — Foundational, Core, Advanced, Expert.

Click any question card to expand it. Four tabs appear:

1. **Recruiter Intent** — the competency being tested and why the interviewer asks it.
2. **Model Answer** — a spoken-style executive answer, plus the critical red flag to avoid.
3. **Technical Deep-Dive** — the underlying mechanics one level deeper.
4. **Eccles Coaching Note** — delivery and framing guidance.

The **Launch Interactive Practice Simulator** button at the bottom of each expanded card opens the practice modal for that question.

### Practice Simulator

The simulator supports two input modes, scored identically:

- **Voice** — click the microphone, allow browser mic access, and speak. Your words transcribe live into the text area (you may correct them before submitting).
- **Typing** — type your answer directly into the text area.

Three live metrics update while you work:

| Metric | Meaning | Target |
|---|---|---|
| Pace (WPM) | Words per minute | ~130–160 conversational |
| Stalls | Filler/hedge words ("um," "basically," "I think") **plus** silent pauses longer than 1.8 seconds | As close to 0 as possible |
| Duration | Elapsed answer time | Most questions: 30–90 seconds |

Three actions are available:

- **⚡ Submit for AI Evaluation** — grades your transcript instantly (see next section).
- **Simulate Perfect Response** — loads the model answer and scores it, so you can see what a ceiling-level answer looks like against the rubric.
- **Copy Prompt for Live AI Coach** — generates a fully-contextualized coaching prompt (question, competency, recruiter intent, your transcript, and a strict output format) that you can paste into Claude or another AI assistant for narrative feedback beyond the built-in heuristic.

### AI Evaluation & Scoring

Every submission is graded 0–100 across up to four axes:

| Axis | Weight (quantitative Q) | Weight (qualitative Q) | What it measures |
|---|---|---|---|
| Content | 45% | 55% | Coverage of the framework vocabulary and key concepts the model answer relies on (fuzzy matching: plurals, tenses, typos, and synonyms all earn credit) |
| Structure | 22% | 27% | Answer length, with the full-credit band calibrated to each question's model answer (from ~16–40 words depending on the question, up to 220), plus use of logical connectors ("because," "therefore," "which means") |
| Specificity | 18% | — | Quantification — dollar figures, percentages, multiples — scored against the model answer's own quantitative density |
| Delivery | 15% | 18% | Stall density (fillers, hedges, long pauses) relative to answer length |

**Qualitative questions** — those whose model answer contains no numbers — are scored on three axes only; students are not penalized for failing to quantify an answer that has nothing to quantify. The feedback panel shows three bars instead of four in this case.

Scores map to readiness tiers:

| Score | Tier |
|---|---|
| 90–100 | Elite |
| 75–89 | Interview Ready |
| 55–74 | Strong |
| 30–54 | Competitive |
| 0–29 | Emerging |

The feedback panel also lists the **framework terms you hit**, the **terms the model answer expected** that you missed, and targeted **coaching notes** derived from your weakest axes.

### Strategic Frameworks

Sixteen frameworks organized by track. Select any framework in the left sub-menu to view its core mechanics and application guide. Use these as answer scaffolding — the scoring engine's vocabulary comes from the same conceptual base.

### Interview Battlecards

Two rapid-review sheets — one per track — covering must-know concepts, power phrases, metrics to know cold, and mental-math shortcuts (e.g., 2.0x MOIC over 5 years ≈ 15% IRR; 3.0x ≈ 25%). Best used in the final 48 hours before an interview.

### Deal Team Red Flags

The ten most common fatal candidate errors (weak accounting, poor valuation logic, LBO confusion, unstructured communication, etc.), each paired with an Eccles remediation blueprint. Cross-referenced in every question card's Model Answer tab.

### Readiness Dashboard

Tracks your **best demonstrated score** in each of the 12 competency domains, plus an overall average and tier badge. Progress saves automatically to the browser you're using (nothing is transmitted anywhere — see [Progress Persistence](#progress-persistence)). The **Reset Dashboard to Zero** button permanently clears saved progress after a confirmation prompt.

> **Note:** progress is per-browser, per-device. Practicing on a library computer will not carry over to your laptop.

### Voice Input Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Browser doesn't support live speech-to-text" | Firefox/Safari or older browser | Use **Chrome or Edge on desktop**, or type your answer — scoring is identical |
| "Voice needs a secure https page" | Opened as a local file | Use the deployed GitHub Pages link |
| "Embedded preview blocks microphone access" | Viewing inside an iframe/preview pane | Open the page in its **own browser tab** |
| "Microphone permission was blocked" | Denied the browser prompt | Click the lock/mic icon in the address bar → allow → click the mic again |
| "No microphone was found" | No mic on device | Type your answer instead |

Typing is always a full-fidelity fallback — the evaluation engine scores text and voice transcripts identically.

---

## Operational Guide

### Repository Structure

```
/
├── index.html      ← the entire application (markup, CSS, data, and logic)
└── README.md       ← this file
```

There is no build step, no dependencies, and no backend. All question data, frameworks, battlecards, red flags, and the scoring engine live inside `<script>` in `index.html`.

### Deployment (GitHub Pages)

1. Repo → **Settings → Pages**.
2. Source: **Deploy from a branch** → `main` → `/ (root)` → Save.
3. The site publishes at `https://<org-or-user>.github.io/<repo-name>/`. Commits to `main` redeploy automatically (allow ~1 minute).

HTTPS from GitHub Pages is required for the voice features — the Web Speech API and microphone access are blocked on `file://` pages.

### Editing & Adding Questions

All questions are registered inside `buildQuestionsDatabase()` via `addQuestion(...)`, which takes ten arguments **in this order**:

| # | Parameter | Notes |
|---|---|---|
| 1 | `track` | `"Investment"` or `"Portfolio Operations"` — must match exactly |
| 2 | `category` | Use the array constants, e.g. `INVESTMENT_CATEGORIES[2]`, `PORTFOLIO_CATEGORIES[0]` — never a free-typed string |
| 3 | `difficulty` | `"Foundational"`, `"Core"`, `"Advanced"`, or `"Expert"` |
| 4 | `question` | The interview question shown on the card |
| 5 | `competency` | Target competency label (Recruiter Intent tab) |
| 6 | `intent` | Why the recruiter asks it (Recruiter Intent tab) |
| 7 | `answer` | Model spoken answer — **this text also drives the scoring rubric** (see below) |
| 8 | `deep` | Technical deep-dive tab content |
| 9 | `coaching` | Eccles coaching note tab content |
| 10 | `redflag` | The critical mistake to avoid (shown in the Model Answer tab) |

**Rules when adding or editing:**

- The `category` string must match a key in `COMPETENCY_DASHBOARD_STATE` exactly, or dashboard updates for that question will silently no-op. Using the array constants guarantees this.
- The **model answer is the scoring rubric**: the engine extracts its framework vocabulary and salient terms, then grades students on coverage. Write model answers in natural spoken prose containing the terms you want students to say. Aim for 40–200 words.
- If a model answer contains **no digits**, the question is automatically treated as qualitative (Specificity axis excluded). Include figures only where a strong answer genuinely requires them.
- If you add questions, update the hard-coded counts in three places: the hero stat card, the hero paragraph, and the nav label ("Question Bank (100 distinct)"). Domain-count code comments are informational only.

### Editing Frameworks, Battlecards & Red Flags

- **Frameworks** — `FRAMEWORKS_DATA` object (key per framework, `title`, `tag`, `sections[]`). Adding one also requires a matching `<div class="framework-nav-item" data-fid="...">` entry in the sidebar markup.
- **Red flags** — `RED_FLAGS_DATA` array (`id`, `name`, `desc`, `remedy`). Rendered automatically; update the hero stat card if the count changes.
- **Battlecards** — plain HTML in the `#invest-card` and `#ops-card` panes; edit directly.

### How the Scoring Engine Works

Entirely client-side (`evaluateResponseHeuristic()`); no API calls, no cost, no data egress.

1. **Rubric derivation** — `deriveExpectedKeywords()` scans the question's model answer for (a) *core* terms matching the `PE_FRAMEWORK_GLOSSARY` (~120 PE/finance terms) and (b) up to 10 *supporting* high-salience content words.
2. **Fuzzy matching** — `termPresent()` credits plurals/tenses (suffix stemming), single-character typos (edit-distance-1, minimum 6 characters, with an explicit exclusion list for semantically different near-pairs), and spoken variants via `TERM_SYNONYMS` (e.g., "internal rate of return" ⇄ "irr", "add on" ⇄ "bolt-on"). Short acronyms (≤4 chars: `irr`, `pik`, `dso`) match only as whole tokens to prevent substring false positives.
3. **Axis scores** — Content (weighted core/supporting coverage), Structure (length band calibrated to the model answer's word count, plus a connector bonus), Specificity (numeric-token count scaled to the model answer's own count — matching it earns full credit), Delivery (stall ratio). `STALL_REGEX` is the single source of truth for filler/hedge detection, shared by the live metrics panel and the final evaluation so both counts always agree. Silent pauses > 1.8 s during voice recording (`PAUSE_THRESHOLD_MS`) add to the stall count — browser speech engines strip "um/uh" from transcripts, so pauses are the measurable proxy.
4. **Composite** — weights per the table in [AI Evaluation & Scoring](#ai-evaluation--scoring); answers under 8 words are capped at 22.
5. **Dashboard write-through** — the question's category score updates only if the new result **beats** the stored best, then persists.

**Calibration check after any engine or content change:** run **Simulate Perfect Response** on a sample of questions in every domain. Model answers should score 90+ (Elite). If they don't, the rubric and the model answer have drifted apart.

### Progress Persistence

- Storage: `localStorage`, key **`eccles_pe_readiness_v1`** — namespaced and versioned to avoid collisions with the other Eccles playbooks served from the same GitHub Pages origin.
- Payload: the 12 domain scores + an `updatedAt` ISO timestamp (surfaced as "last updated" under the dashboard).
- Failure mode: if storage is blocked (sandboxed preview, strict privacy mode), the tool degrades gracefully to in-memory scores for the session.
- Breaking-change policy: if the schema ever changes incompatibly, bump the key suffix (`_v2`) rather than migrating in place.
- Privacy: no transcript, audio, score, or identifier ever leaves the browser. The only network activity is loading the page itself.

### Browser Support

| Capability | Chrome / Edge (desktop) | Safari | Firefox | Mobile |
|---|---|---|---|---|
| All modules, typing, scoring, dashboard | ✅ | ✅ | ✅ | ✅ |
| Live voice transcription | ✅ | Partial | ❌ | Varies |

The tool never hard-fails without voice — it detects the limitation, explains it in plain language, and directs the student to type.

## Changelog

- **v1.1** — Footer repositioned inside the content column (was rendered under the fixed header due to body flex layout); hero copy corrected to 100 questions; typo and grammar fixes in the question bank; unified stall regex so live and final counts match; scoring recalibration (structure band and specificity expectations calibrated to each model answer; qualitative questions scored on three axes) — verified by an automated test that Simulate Perfect Response scores 99–100 (Elite) on all 100 questions.
- **v1.0** — Initial release: 100-question bank, 16 frameworks, 2 battlecards, 10 red flags, voice practice simulator with pause detection, client-side heuristic evaluation, persistent readiness dashboard.

## Credits

Developed by Cory Burk, Senior Manager, Program Management · Full-Time MBA Program · David Eccles School of Business.
© 2026 University of Utah, David Eccles School of Business. All rights reserved.
