---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
title: Data Pipeline Rethink - Plan
date: 2026-08-01
---

# Data Pipeline Rethink - Plan

## Goal Capsule

**Objective:** Make question processing, practice interviews, and completeness one coherent product pipeline — three lanes (teaching, firm signals, practice) with explicit gates — instead of a single implied conveyor that the code already outgrew.

**Product authority:** ADR 0002 data thesis; Modes A (company prep) and B (concept labs); `docs/data-pipeline.md` is the operational source of truth after this plan.

**Open blockers:**

- Neon occurrences largely unlinked to teaching canonicals (`canonical_question_id` null) — Mode A join packs weak.
- Learn module checkpoints seeded empty — Mode B drills not practice-ready.
- Practice session creation ignores mode when `question_ids` empty.
- License review still BLOCKING for some GitHub sources before corpus expansion.

## Product Contract

### Summary

Rethink the pipeline as **Lane T (teaching)**, **Lane S (signals)**, and **Lane P (practice)**. Questions are processed differently by lane. Practice modes only start when their completeness gate passes. A living completeness scoreboard replaces ad-hoc “row counts look fine.”

### Problem Frame

Docs describe one stage chain (`discover → … → export/publish`). Code runs a collapsed fixture assembly, a parallel Glassdoor scrape, a separate Neon publish, and practice APIs that treat modes as labels. Product gaps (empty drills, null joins, untagged topics) show up as UX holes, not as pipeline failures. Operators cannot answer “are we complete enough for Mode A/B?” with one artifact.

### Users / Actors

| Actor | Need |
|-------|------|
| Candidate (Mode A) | Firm-relevant practice packs grounded in heat × teaching Q/A |
| Candidate (Mode B) | Concept labs with real drill questions |
| Corpus operator | Restartable jobs, honest provenance, publish gates |
| Programme / QA | Completeness scoreboard that matches product readiness |

### Key Decisions

| ID | Decision |
|----|----------|
| KD-1 | Adopt three-lane model (T / S / P); abandon single-conveyor mental model in architecture docs. |
| KD-2 | Practice modes must use mode-specific pack builders; bare `listQuestions` fallback is only for explicit unscoped/dev requests. |
| KD-3 | Completeness is eight product dimensions (C1–C8 in `docs/data-pipeline.md`); green thresholds gate modes and publish. |
| KD-4 | Neon publish must not blind-stamp `validation_status=validated` without attesting Python validator results or re-running an equivalent gate. |
| KD-5 | Signal↔teaching join is a first-class Lane S→T stage; heat-only UX is allowed only when labeled as lexical/RAG fallback. |
| KD-6 | Unused `JOB_NAMES` entries are wired, renamed, or removed — no shadow catalog. |

### Requirements

| ID | Requirement |
|----|-------------|
| R-1 | Document and keep `docs/data-pipeline.md` as the lane/stage/gate contract; architecture links to it. |
| R-2 | Lane T: every publishable teaching question has a non-rejected answer before Neon publish. |
| R-3 | Lane S: Glassdoor/bank rows never become teaching answers; topic tagging and heat remain signal-only. |
| R-4 | Lane S→T: join step persists teaching links where wording matches; report join rate on the scoreboard. |
| R-5 | Lane P: `company`, `concept`, `adaptive_weak`, `pseudo_rag`, `simulator` each have a defined pack source and fail-closed readiness gate. |
| R-6 | Session start freezes `question_ids` (and simulator stages) in session metadata. |
| R-7 | Published learning modules expose checkpoints with ≥3 teaching `question_ids` each before `concept` mode is ready. |
| R-8 | Regenerate `reports/pipeline-completeness.md` from pipeline export or a dedicated script. |
| R-9 | Worker hosts long jobs (scrape, pipeline, enrich, publish, embed); never inside Vercel request timeouts. |

### Non-goals

- Replacing Patchright/manual captcha Glassdoor login with BFF+proxy as the default.
- Automated rubric grading of free-text simulator answers in this rethink (self-rating may remain).
- Expanding the teaching corpus past license BLOCKING sources.
- Redesigning frontend Learn/Simulator chrome (pack builders + data gates only).

### Success Criteria

| ID | Signal |
|----|--------|
| S-1 | An operator can point to `docs/data-pipeline.md` + completeness scoreboard and know Mode A/B readiness. |
| S-2 | Creating a practice session with `mode=concept` never returns an arbitrary bank slice when checkpoints exist. |
| S-3 | Creating `mode=company` for a firm with heat either returns heat-ranked teaching Qs or a typed “fallback/not ready” error. |
| S-4 | C1 stays at 100% for publishable teaching answers; C6 leaves “empty checkpoints” state. |
| S-5 | Architecture stage list and executed jobs no longer contradict each other. |

### Outstanding Questions

| ID | Question | Default if unresolved |
|----|----------|------------------------|
| OQ-1 | Should anonymous users hit heat/RAG prep, or remain auth-gated? | Stay auth-gated; fix smokes. |
| OQ-2 | Minimum join rate (C4) 25% vs higher before Mode A drops lexical fallback label? | 25% for v1; raise later. |
| OQ-3 | Implement `score_quality` job or delete the name? | Delete if no owner in next orchestration pass. |

### Risks / Assumptions

| ID | Note |
|----|------|
| A-1 | Assumes ADR 0002 remains accepted (GitHub teaching / Glassdoor signals). |
| A-2 | Live Glassdoor volume may stay fixture/bank-led from datacenter IPs. |
| RSK-1 | Blind `validated` stamp today can hide failed Python validation if exports drift. |
| RSK-2 | Mode pack builders without UI work still unblock API correctness. |
