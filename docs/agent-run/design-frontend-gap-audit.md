# DESIGN.md frontend gap audit

**Date:** 2026-08-01  
**Branch:** `local/design-frontend-continue-bb32`  
**Basis:** `DESIGN.md` §3–§10 vs `apps/web` product surfaces

## Closed this programme

| Area | State |
|------|-------|
| Dark mode contrast | Done — cream paper + black ink under `.dark`; Settings theme |
| §10.5 Pseudo-RAG | Done — study loop via `StudyLoopIsland` |
| §10.3–10.4 Heat nav | Done — cell → scoped RAG + weakness toggle |
| §10.6 Learn hub | Done — lesson PaperSheets, module drills, Apply-at-firm |
| §10.8–10.9 Study | Done — Again/Hard/Good/Easy, hint, layer `p`, practice CTAs |
| §10.10–10.11 Plan/Sim | Done — paper day cells, timers, handwriting burst, diagram prompts |
| §10.12–10.13 Saved/Progress | Done — search, collections POST, heat∩weakness matrix |
| Paper cohesiveness | Done — landing, onboarding, companies, heat, dashboard paper wraps |

## Paper kit leverage (product)

Surfaces heavily use `@/components/paper`: PaperSheet, Annotate, RoughHover, InkHoverScope, HandwritingHeadline, HeatStrip, CircledNumber, PaperBurst, WarrenCallout, SemanticPill, ProvenanceChip, InterviewerAvatar.

Highest usage: study-plan, simulator, progress, study, onboarding, learn module, heat, landing, companies, dashboard.

## Still open (lower urgency)

- Diagram step-highlight interactivity inside Mermaid host
- §10.14 notifications preferences
- Diagram completion flags on `/api/progress`
- Cited Gemini simulator feedback (key-guarded)
- Richer Verticals filter on Learn catalog
