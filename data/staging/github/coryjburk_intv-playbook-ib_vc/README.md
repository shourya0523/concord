# Full-Time MBA • David Eccles School of Business

## Investment Banking Interview Playbook — User Guide

A single-file, browser-based interview preparation tool for MBA candidates recruiting into Investment Banking Associate roles. 100 questions across two tracks, 16 strategic frameworks, voice practice with simulated AI scoring, and a persistent readiness dashboard — all client-side, no build step, no server, no student data leaving the browser.

---

**▶ Live tool:** **[Intv Playbook - IB (vC)]( https://coryjburk.github.io/intv-playbook-ib_vc/)**

_Companion tool to the Private Equity Interview Playbook; both use the same architecture and can coexist on the same origin._

---

## Contents

- [Quick Start](#quick-start)
- [What's Inside](#whats-inside)
- [Module Guide](#module-guide)
  - [Home / Cockpit](#home--cockpit)
  - [Question Bank](#question-bank)
  - [Strategic Frameworks](#strategic-frameworks)
  - [Interview Battlecards](#interview-battlecards)
  - [Banker Red Flags](#banker-red-flags)
  - [Readiness Dashboard](#readiness-dashboard)
- [Voice Practice & Scoring](#voice-practice--scoring)
- [How Scoring Works](#how-scoring-works)
- [Browser Requirements](#browser-requirements)
- [Data & Privacy](#data--privacy)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Architecture Notes (for maintainers)](#architecture-notes-for-maintainers)

---

## Quick Start

1. Open the tool in **Chrome or Edge** (required for voice practice; all other features work in any modern browser).
2. Pick a track from the home screen — **M&A / Coverage** or **Capital Markets** — or browse everything in the Question Bank.
3. Expand any question card to study the model answer, technical deep-dive, and coaching notes.
4. Click **🎤 Practice This Question**, speak (or type) your answer, and hit **⚡ Submit for AI Evaluation**.
5. Watch the **Readiness Dashboard** build as your best score per category is saved automatically.

Progress saves in your browser and persists across sessions on the same device.

## What's Inside

| Component | Count | Description |
|---|---|---|
| Questions | 100 | 50 per track, four difficulty tiers |
| Frameworks | 16 | 8 per track, interview-ready mental models |
| Battlecards | 2 | Rapid-review sheets per track |
| Red Flags | 10 | Fatal interview mistakes with remedies |
| Difficulty tiers | 4 | Foundational → Core → Advanced → Expert |

**M&A / Coverage track categories:** Accounting & Financial Statements · Enterprise & Equity Value · Valuation & DCF · Merger Models (Accretion / Dilution) · LBO Fundamentals · M&A Process & Deal Judgment

**Capital Markets track categories:** Equity Capital Markets (ECM) · Debt Capital Markets & Leveraged Finance · Capital Structure & Financing Strategy · Markets & Macro Awareness · Restructuring & Special Situations · Behavioral & Fit

**Depth targeting:** Foundational and Core tiers cover the technical screens asked of Analysts and first-round Associates (the $10 depreciation walk, EV vs. Equity Value, walk-me-through-a-DCF). Advanced and Expert tiers cover Associate-level judgment: contested board advisory, exchange-ratio structuring, covenant architecture, liability management, and live-scenario questions.

## Module Guide

### Home / Cockpit
Landing page with tool statistics and two track shortcuts that jump straight into a pre-filtered Question Bank.

### Question Bank
The core study surface. Three stacking filters — **Track**, **Category**, **Difficulty** — narrow the 100 questions. The Category dropdown repopulates based on the selected track.

Each question card expands into three tabs:

- **Conversational Answer** — what the interviewer is actually testing (Recruiter Intent) plus a model answer written the way a strong candidate would say it out loud.
- **Technical Deep-Dive** — the layer beneath the answer: the mechanism, the exception, or the nuance that survives follow-up questions.
- **Coaching & Red Flags** — a delivery tip and the specific mistake that fails candidates on this question.

### Strategic Frameworks
16 structured mental models (DCF construction, merger consequences, bookbuilding, restructuring waterfall, etc.), each with core mechanics, math where applicable, and an application guide. Use these to organize answers, not memorize them.

### Interview Battlecards
One rapid-review sheet per track: must-know concepts, power phrases, metrics to know cold, and mental-math shortcuts (M&A) or daily market levels and preparation habits (Capital Markets). Designed for the 30 minutes before an interview.

### Banker Red Flags
Ten patterns that fail otherwise-qualified candidates — broken statement linkage, memorized-not-understood technicals, zero market awareness — each paired with a concrete remedy.

### Readiness Dashboard
Tracks your best evaluation score per category (12 bars) and an overall readiness score with a tier badge:

| Score | Tier |
|---|---|
| 90–100 | Offer Caliber |
| 75–89 | Interview Ready |
| 50–74 | Advancing |
| 25–49 | Developing |
| 0–24 | Emerging |

**Reset Dashboard to Zero** clears saved progress for this tool only (the PE playbook's data is untouched).

## Voice Practice & Scoring

From any question card, **Practice This Question** opens the practice interface:

1. **Speak** — click the mic and answer aloud; your words transcribe live. Or **type** directly into the transcription box — evaluation works identically either way.
2. **Live metrics** — pace (words per minute), stalls (fillers + long pauses), and duration update as you speak.
3. **⚡ Submit for AI Evaluation** — scores your answer instantly (see below).
4. **Simulate Perfect Response** — injects the model answer and evaluates it, demonstrating what a top score looks like.
5. **Copy Prompt for Live AI Coach** — generates a structured coaching prompt (question, your transcript, evaluation axes) to paste into Claude or another AI assistant for qualitative feedback beyond what the built-in scorer can provide.

## How Scoring Works

The built-in evaluator is a **heuristic scorer, not a language model**. It runs entirely in your browser and weighs four subscores:

| Subscore | Weight | What it measures |
|---|---|---|
| Coverage | 40% | Domain concepts from the model answer present in yours |
| Structure | 20% | Ordered delivery — signal words ("first," "therefore") and clause organization |
| Precision | 20% | Numbers, formulas, and quantitative language |
| Delivery | 20% | Answer length adequacy minus stall penalties |

**Close-word matching:** the scorer credits paraphrases, not just exact strings. Stemming ("multiples" = "multiple"), single-typo tolerance ("amortisation" = "amortization"), hyphen normalization ("high-yield" = "high yield"), and a domain synonym map ("accretive" ↔ accretion, "green shoe" ↔ greenshoe, "discounted cash flow" ↔ DCF, "bps" ↔ basis points) all count as hits.

**Known limitations — read this:**

- A conceptually correct answer phrased entirely outside the domain vocabulary will underscore. The vocabulary *is* part of what interviewers assess, but treat low Coverage scores as a prompt to check the concept chips, not as a verdict.
- Browser speech engines **clean up disfluencies**: "um" and "uh" are frequently dropped or rewritten (often as "I'm") before the transcript reaches the tool. The Stalls metric therefore counts the hedge words that survive transcription ("like," "I think," "I guess," "I mean") **plus silent pauses longer than ~2 seconds**, which are the measurable proxy for erased fillers. Do not treat a low stall count as proof of clean delivery — record yourself separately if verbal polish is your focus area.
- For qualitative feedback on reasoning, story quality, and presence, use the **Copy Prompt for Live AI Coach** button — that is what it exists for.

## Browser Requirements

| Feature | Requirement |
|---|---|
| Study modules, typing-based practice, scoring, dashboard | Any modern browser |
| Voice transcription | Chrome or Edge (Web Speech API), served over **https** |
| Microphone | Permission granted on first use; the tool degrades to typed input if blocked |

Safari and Firefox users: everything works except live voice capture — type answers instead.

## Data & Privacy

- **All processing is client-side.** Nothing you speak or type is sent to any server by this tool.
- Voice transcription uses the browser's built-in speech service (in Chrome, audio is processed by Google's speech engine as part of the browser feature — this is a browser behavior, not a call made by this tool).
- Progress is stored in `localStorage` under the key `eccles_ib_readiness_v1`, scoped to the hosting domain and the specific browser/device. Clearing site data erases progress.
- Private/incognito windows will not retain progress after closing.

## Deployment

Single file, no dependencies, no build step:

```bash
# GitHub Pages (recommended)
git add "Intv Playbook - IB.html"
git commit -m "Add IB interview playbook"
git push
# → https://<username>.github.io/<repo>/Intv%20Playbook%20-%20IB.html
```

Any static host works (Netlify Drop, Cloudflare Pages, Tiiny.host). **Serve over https** — voice capture requires a secure context. Renaming the file to something URL-friendly (e.g., `ib-playbook.html`) is cosmetic and safe.

The localStorage key is namespaced, so this tool and the PE playbook can live on the same origin without clobbering each other's saved progress.

## Troubleshooting

| Symptom | Cause & Fix |
|---|---|
| Mic button shows "not supported" | Browser lacks Web Speech API — use Chrome/Edge, or type your answer |
| Mic button shows "requires a secure connection" | Page served over http or `file://` — deploy to an https host |
| "Microphone permission was blocked" | Re-enable mic access for the site in browser settings (padlock icon → Site settings) |
| Transcript stops mid-answer | Speech engines auto-pause on silence; the tool auto-restarts — keep speaking, or click the mic off/on |
| "um" appears as "I'm" in transcript | Browser speech engine behavior; edit the transcript manually before evaluating if it matters, and rely on the pause count |
| Scores seem to reset | Different browser, device, private window, or cleared site data — progress is per-browser |
| Dashboard won't update | Scores only rise (best-score-per-category); a lower run won't overwrite a higher one |

## Architecture Notes (for maintainers)

- **Single HTML file** — vanilla JS, no framework, no build step. All state in module-scope variables; persistence via `localStorage`.
- **Question data:** `IB_QUESTIONS` array built by `buildQuestionsDatabase()`; each question carries track, category, difficulty, and five content fields. Add questions with `addQuestion(...)` — the dashboard and filters pick them up automatically.
- **Scoring:** `evaluateResponseHeuristic()` → subscores → `renderHeuristicFeedback()`. Fuzzy matching lives in `buildMatchProfile()` / `termPresent()` / `TERM_SYNONYMS`. To tune vocabulary, edit `IB_FRAMEWORK_GLOSSARY` and `TERM_SYNONYMS`.
- **Hedge-word policy:** `FILLER_WORDS` includes "I think" / "I guess" / "I mean" as hedges. If students report false positives on opinion questions, remove entries from that array — one line.
- **Storage key:** `eccles_ib_readiness_v1`. Bump the suffix if the schema ever changes incompatibly.
- Tested headlessly (jsdom): boot, all filter partitions, all 100 cards, all 16 frameworks, modal edge cases, 100 simulated evaluations, fuzzy-match suite, pause logic, persistence lifecycle.

---

Developed by Cory Burk, Senior Manager, Program Management · Full-Time MBA Program · David Eccles School of Business.
© 2026 University of Utah, David Eccles School of Business. All rights reserved.
