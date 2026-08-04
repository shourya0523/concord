---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
title: Data Pipeline Rethink - Plan
date: 2026-08-01
updated: 2026-08-01
---

# Data Pipeline Rethink - Plan

## Goal Capsule

**Objective:** Make question processing, practice interviews, and completeness one coherent product pipeline — three lanes (teaching, firm signals, practice) — with **real RAG**, **LLM/custom scoring**, and **Glassdoor-as-firm-context** (not pseudo-mode theater).

**Product authority:** ADR 0002; Modes A/B; `docs/data-pipeline.md`.

**Open blockers:**

- Neon occurrences largely unlinked to teaching canonicals — join weak; heat-biased RAG must carry Mode A until joins catch up.
- Learn module checkpoints empty; diagram graph thin.
- Practice sessions mode-blind; attempts self-rated only.
- Practice enum still named `pseudo_rag` despite `buildRealRagPack` / `rag_documents`.
- License BLOCKING for some GitHub sources.

## Product Contract

### Summary

Three lanes (T / S / P). **Real embedding RAG is the default retrieval path**; lexical pseudo-RAG is fallback only. Practice grading uses teaching answers as gold + Glassdoor heat/snippets as firm context via a cite-only LLM rubric. Completeness scoreboard includes scoring (C9) and diagrams (C10).

### Problem Frame

Docs implied one conveyor; code split teaching/signals/publish. Product still talks “pseudo-RAG” while dense retrieval exists. Practice ignores LLM and firm signals at grade time. Glassdoor volume sits in heat tables but does not coach or score company interviews. Diagrams have a schema and a tiny seed — not a Mode B asset pipeline.

### Users / Actors

| Actor | Need |
|-------|------|
| Candidate (Mode A) | Firm-biased packs + feedback that mentions what *this firm* skews toward |
| Candidate (Mode B) | Concept labs with drills **and** mermaid diagram checkpoints |
| Corpus operator | Honest provenance; Glassdoor never becomes gold answers |
| Programme / QA | Scoreboard for RAG backend, scoring, joins, diagrams |

### Key Decisions

| ID | Decision |
|----|----------|
| KD-1 | Three-lane model (T / S / P). |
| KD-2 | Mode-specific pack builders; no bare `listQuestions` for named modes. |
| KD-3 | Completeness C1–C10 gate modes and publish. |
| KD-4 | Neon publish attests validator results — no blind `validated` stamp. |
| KD-5 | Glassdoor = heat + grader context + optional joins; never teaching answers. Heat-biased **real RAG** is a first-class Mode A path when joins are sparse. |
| KD-6 | Shadow `JOB_NAMES` wired, renamed, or removed. |
| KD-7 | **session-settled:** Retire `pseudo_rag` as the product name → `rag`; keep alias one release. Lexical pack is fallback only. |
| KD-8 | **session-settled:** Practice attempts use LLM (or deterministic numeric) scoring with teaching-answer gold + firm heat context; self-score is fallback, not the design center. |
| KD-9 | **session-settled:** Firm practice feedback may cite heat topics / occurrence ids; must not quote Glassdoor as correct answers. |
| KD-10 | Diagram mermaid bodies live in `diagram_versions`; core concepts + module checkpoints must link them; embed a11y text into RAG. |

### Requirements

| ID | Requirement |
|----|-------------|
| R-1 | Keep `docs/data-pipeline.md` as lane/stage/gate contract. |
| R-2 | Lane T: publishable Qs have non-rejected answers before Neon publish. |
| R-3 | Lane S: bank/Glassdoor never become teaching answers. |
| R-4 | Persist joins when wording matches; until then ship heat-biased RAG packs labeled honestly. |
| R-5 | Modes `company`, `concept`, `adaptive_weak`, `rag` (+`pseudo_rag` alias), `simulator` each have pack source + gate. |
| R-6 | Session freezes `question_ids`, stages, and a `firm_context_snapshot` (heat topics + top occurrence ids). |
| R-7 | Module checkpoints ≥3 `question_ids`; diagram checkpoints reference real `diagram_id`. |
| R-8 | Regenerate `reports/pipeline-completeness.md`. |
| R-9 | Workers host scrape / pipeline / enrich / publish / embed — not Vercel request timeouts. |
| R-10 | Rename practice mode + user-facing copy from pseudo-RAG → RAG; tests accept alias. |
| R-11 | Attempt API returns structured grade: `score_source`, `llm_score`/`rubric_json`, `weak_topics`, citations. |
| R-12 | Grader prompt: teaching Answer layers as gold; firm heat/RAG hits as context; cite-only firm claims. |
| R-13 | Numeric topics run deterministic validators from `calculation_representation` when present. |
| R-14 | Core concept set has ≥1 mermaid `diagram_versions` row each; linked from learn modules. |
| R-15 | Diagram title + a11y_fallback indexed into `rag_documents` on embed. |

### Non-goals

- BFF+proxy as default Glassdoor access.
- Treating Glassdoor review prose as gold answers or RAG teaching documents.
- Expanding teaching corpus past license BLOCKING sources.
- Full UI redesign of Learn/Simulator chrome (API + data contracts first).

### Success Criteria

| ID | Signal |
|----|--------|
| S-1 | Scoreboard shows Mode A/B readiness including C9/C10. |
| S-2 | `mode=concept` never returns arbitrary bank slice when checkpoints exist. |
| S-3 | `mode=company` / `rag` returns heat-biased real-RAG packs (or typed not-ready / labeled lexical fallback). |
| S-4 | C1 stays 100%; C6 leaves empty checkpoints; at least one core diagram per major concept. |
| S-5 | Prod attempt on firm session can return `score_source=llm` with teaching + heat citations. |
| S-6 | User-facing “pseudo-RAG” naming gone from product surfaces. |

### Outstanding Questions

| ID | Question | Default if unresolved |
|----|----------|------------------------|
| OQ-1 | Anonymous heat/RAG prep vs auth-gated? | Auth-gated; fix smokes. |
| OQ-2 | C4 join % vs heat-RAG-only for Mode A “green”? | Green if heat-RAG packs ship even when join <25%; join still tracked. |
| OQ-3 | Delete unused `score_quality` job name? | Delete if no owner. |
| OQ-4 | Rubric model: flash vs pro for latency/cost? | Flash for interactive grade; pro for offline eval set. |

### Risks / Assumptions

| ID | Note |
|----|------|
| A-1 | ADR 0002 remains accepted. |
| A-2 | Live Glassdoor may stay bank/fixture-led from datacenter IPs. |
| A-3 | `GEMINI_API_KEY` on Vercel Production required for dense RAG + LLM grading. |
| RSK-1 | Blind `validated` stamp can hide export drift. |
| RSK-2 | LLM grader may overfit heat jargon — cite-only + teaching gold mitigate. |
| RSK-3 | Renaming `pseudo_rag` needs contract + UI + smoke coordination. |
