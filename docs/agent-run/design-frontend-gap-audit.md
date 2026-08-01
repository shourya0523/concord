# DESIGN.md frontend gap audit

**Date:** 2026-07-31  
**Branch:** `local/design-frontend-continue-bb32`  
**Basis:** `DESIGN.md` §3–§10 vs `apps/web` product surfaces

## Dark mode (P0 — contrast)

| Issue | Detail |
|-------|--------|
| Hardcoded cream | `PaperSheet` / mermaid theme use `#f7f1e4` while `.dark` flips `--ink`/`--foreground` → light text on cream |
| Incomplete `.dark` tokens | Chrome + semantic pastels not fully paired for dark paper |
| No visible theme control | `d` hotkey only; §10.14 requires theme in Settings |

## §10 screen status

| Section | Status | Priority | Top gaps |
|---------|--------|----------|----------|
| 10.1 Onboarding | Present | P2 | Paper firm chips; clearer Both path |
| 10.2 Dashboard | Partial | P1 | Stronger editorial asymmetry; weakest-cell glow |
| 10.3 Company room | Partial | P1 | Role filter; heat cell → concept/RAG; weakness toggle |
| 10.4 Heat compare | Partial | P1 | Cell → scoped RAG/concept; per-cell low-N |
| 10.5 Pseudo-RAG | Partial | **P0** | Pack preview only — needs study loop, mid-rail, close mastery |
| 10.6 Learn catalog/hub | Partial | P1 | Lesson content; module-scoped drill/quiz; Apply-at-firm |
| 10.7 Concept lab | Partial | P1 | Step-highlight diagram; richer progressive notes |
| 10.8 Study reveal | Partial | P1 | Hint; firm occurrence meta; practice-more CTA; layer `p` |
| 10.9 Adaptive drills | Partial | P1 | Session-type chooser; Again/Hard/Good/Easy |
| 10.10 Plan | Partial | P1 | Diagram checkpoints in generated plan; richer timeline |
| 10.11 Simulator | Partial | P1 | Stage timer wiring; diagram prompt; cited AI feedback |
| 10.12 Saved | Partial | P1 | Search; note edit/delete; collection CRUD; firm chips |
| 10.13 Progress | Partial | P1 | Heat∩weakness matrix; concept mastery map; diagram completion |
| 10.14 Settings | Partial | P1 | Theme toggle UI; notifications; mode edit |

## Orchestrator workstreams (this pass)

| Stream | Branch | State |
|--------|--------|-------|
| DS / shell dark contrast + Settings theme | integrate `2cd7cd0` | Done — cream paper locked under `.dark` |
| §10.5 RAG study loop (P0) | `local/ws-rag-session-bb32` | Done — `StudyLoopIsland` |
| §10.3–10.4 heat → scoped RAG | `local/ws-heat-nav-bb32` | Done — `?firm=&topic=` |
| §10.12–10.13 progress + saved | `local/ws-progress-saved-bb32` | Done — matrix + search |

## Still open (next pass)

- §10.6 module lesson/quiz depth; §10.8 hint + practice-more CTA
- §10.9 Again/Hard/Good/Easy; §10.11 cited simulator feedback
- §10.14 notifications; diagram completion API for progress
